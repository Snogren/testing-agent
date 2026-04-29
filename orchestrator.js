const fs = require('fs');
const path = require('path');
const pLimit = require('p-limit');
const config = require('./config');
const db = require('./database');

let opencodeInstance = null;
let opencodeClient = null;
let sdkModule = null;

/**
 * Lazily import the ESM-only opencode SDK.
 */
async function getSdk() {
  if (!sdkModule) {
    sdkModule = await import('@opencode-ai/sdk');
  }
  return sdkModule;
}

/**
 * Ensure the opencode server is running and we have a client.
 */
async function ensureOpencodeClient() {
  const { createOpencode, createOpencodeClient } = await getSdk();

  if (opencodeClient) {
    try {
      await opencodeClient.global.health();
      return opencodeClient;
    } catch (e) {
      opencodeClient = null;
      opencodeInstance = null;
    }
  }

  if (config.opencode.serverUrl) {
    opencodeClient = createOpencodeClient({ baseUrl: config.opencode.serverUrl });
    await opencodeClient.global.health();
    return opencodeClient;
  }

  opencodeInstance = await createOpencode({
    hostname: config.opencode.hostname,
    port: config.opencode.port,
    timeout: config.opencode.timeout,
  });

  opencodeClient = opencodeInstance.client;
  return opencodeClient;
}

/**
 * Stop the dedicated opencode server if we started it.
 */
async function stopOpencodeServer() {
  if (opencodeInstance) {
    opencodeInstance.server.close();
    opencodeInstance = null;
    opencodeClient = null;
  }
}

/**
 * Read onboarding documents (auth, env, sitemap) from the docs directory.
 */
function readDocs() {
  const docs = {};
  const files = ['auth.md', 'env.md', 'sitemap.md'];
  for (const f of files) {
    const p = path.join(config.paths.docs, f);
    if (fs.existsSync(p)) {
      docs[f.replace('.md', '')] = fs.readFileSync(p, 'utf-8');
    } else {
      docs[f.replace('.md', '')] = '';
    }
  }
  return docs;
}

/**
 * Render a markdown template by replacing ${key} with values from a map.
 * Reads the template from the prompts/ directory.
 */
function renderTemplate(templateName, variables) {
  const templatePath = path.join(__dirname, 'prompts', `${templateName}.md`);
  let content = fs.readFileSync(templatePath, 'utf-8');
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\$\\{${key}\\}`, 'g');
    content = content.replace(placeholder, String(value ?? ''));
  }
  return content;
}

/**
 * Generate the system prompt for a test agent.
 */
function buildAgentPrompt(scenario, docs, evidenceDir) {
  const steps = JSON.parse(scenario.steps);
  const assertions = JSON.parse(scenario.assertions);

  return renderTemplate('agent-test-prompt', {
    authDoc: docs.auth || '(No auth document provided)',
    envDoc: docs.env || '(No env document provided)',
    sitemapDoc: docs.sitemap || '(No sitemap provided)',
    systemName: scenario.system_name,
    featureName: scenario.feature_name,
    scenarioName: scenario.scenario_name,
    stepsList: steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
    assertionsList: assertions.map((a, i) => `${i + 1}. ${a}`).join('\n'),
    evidenceDir
  });
}

/**
 * JSON schema for structured agent output.
 */
const agentOutputSchema = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['passed', 'failed', 'blocked'],
      description: 'Overall scenario status'
    },
    modified: {
      type: 'boolean',
      description: 'Set to true if the agent deviated from the exact steps/assertions listed in the prompt. This alerts the human reviewer that either (1) the application changed and the test needs updating, or (2) the AI went off-script. Both cases demand extra scrutiny.'
    },
    short_summary: {
      type: 'string',
      description: 'Brief summary of what the agent did and observed'
    },
    evidence_filepath: {
      type: 'string',
      description: 'Path to the evidence markdown file'
    },
    steps: {
      type: 'array',
      items: { type: 'string' },
      description: 'Short summaries of each step execution'
    },
    assertions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Short summaries of each assertion result'
    },
    notes: {
      type: 'string',
      description: 'Any additional notes from the agent, especially explaining why modified=true'
    }
  },
  required: ['status', 'modified', 'short_summary', 'evidence_filepath', 'steps', 'assertions']
};

/**
 * Run a single test agent for a scenario.
 */
async function runAgent(executionId, executionNumber, scenario, evidenceDir, logPath) {
  const client = await ensureOpencodeClient();
  const docs = readDocs();

  const session = await client.session.create({
    body: { title: `Exec ${executionNumber} - ${scenario.scenario_name}` }
  });

  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  logStream.write(`[${new Date().toISOString()}] Starting agent for scenario ${scenario.id}: ${scenario.scenario_name}\n`);

  try {
    const promptText = buildAgentPrompt(scenario, docs, evidenceDir);
    logStream.write(`[${new Date().toISOString()}] Prompt built, sending to session ${session.data.id}\n`);

    const result = await client.session.prompt({
      path: { id: session.data.id },
      body: {
        parts: [{ type: 'text', text: promptText }],
        format: {
          type: 'json_schema',
          schema: agentOutputSchema,
          retryCount: 2
        }
      }
    });

    logStream.write(`[${new Date().toISOString()}] Prompt completed\n`);
    logStream.write(`[${new Date().toISOString()}] Raw result:\n${JSON.stringify(result.data, null, 2)}\n`);

    const structured = result.data.info.structured_output;
    if (!structured) {
      throw new Error('Agent did not return structured output');
    }

    return structured;
  } catch (error) {
    logStream.write(`[${new Date().toISOString()}] ERROR: ${error.message}\n`);
    throw error;
  } finally {
    try {
      await client.session.delete({ path: { id: session.data.id } });
    } catch (e) {
      logStream.write(`[${new Date().toISOString()}] Warning: failed to delete session: ${e.message}\n`);
    }
    logStream.end();
  }
}

/**
 * Build evidence markdown from template and agent result.
 */
function buildEvidenceMarkdown(scenario, result, evidenceDir) {
  const steps = JSON.parse(scenario.steps);
  const assertions = JSON.parse(scenario.assertions);

  const stepDetails = steps.map((desc, i) => ({
    description: desc,
    status: result.steps[i] ? 'completed' : 'unknown',
    screenshot: fs.existsSync(path.join(evidenceDir, `step-${i + 1}.png`))
      ? `step-${i + 1}.png`
      : null
  }));

  const assertionDetails = assertions.map((desc, i) => ({
    description: desc,
    status: result.assertions[i] ? 'verified' : 'unknown',
    screenshot: fs.existsSync(path.join(evidenceDir, `assertion-${i + 1}.png`))
      ? `assertion-${i + 1}.png`
      : null
  }));

  let md = `# Evidence: ${scenario.scenario_name}\n\n`;
  md += `**Execution:** #${result.executionNumber || '?'}  \n`;
  md += `**System:** ${scenario.system_name}  \n`;
  md += `**Feature:** ${scenario.feature_name}  \n`;
  md += `**Scenario:** ${scenario.scenario_name}  \n`;
  md += `**Status:** ${result.status}  \n`;

  if (result.modified) {
    md += `**⚠️ MODIFIED:** YES — This test deviated from the original steps/assertions. See Agent Notes for details. This requires human scrutiny to determine if the app changed or the AI went rogue.\n\n`;
  } else {
    md += `**Modified:** No — The agent followed the original steps and assertions exactly.\n\n`;
  }

  md += `---\n\n`;
  md += `## Summary\n\n${result.short_summary}\n\n`;
  md += `---\n\n`;
  md += `## Steps\n\n`;
  stepDetails.forEach((s, i) => {
    md += `### Step ${i + 1}: ${s.description}\n\n`;
    md += `**Status:** ${s.status}\n\n`;
    if (s.screenshot) {
      md += `![Step ${i + 1}](${s.screenshot})\n\n`;
    }
  });
  md += `---\n\n`;
  md += `## Assertions\n\n`;
  assertionDetails.forEach((a, i) => {
    md += `### Assertion ${i + 1}: ${a.description}\n\n`;
    md += `**Status:** ${a.status}\n\n`;
    if (a.screenshot) {
      md += `![Assertion ${i + 1}](${a.screenshot})\n\n`;
    }
  });
  md += `---\n\n`;
  md += `## Agent Notes\n\n${result.notes || '(none)'}\n\n`;
  md += `---\n\n`;
  md += `*Generated by Tester Agent*\n`;

  return md;
}

/**
 * Run the verifier agent on all evidence from an execution.
 */
async function runVerifier(executionId, model) {
  const client = await ensureOpencodeClient();
  const scenarios = db.scenarioExecution.getByExecutionId.all(executionId);

  for (const se of scenarios) {
    if (!se.evidence_filepath || !fs.existsSync(se.evidence_filepath)) {
      await db.scenarioExecution.updateVerification.run({
        id: se.id,
        confidenceScore: 0,
        verifierNotes: 'No evidence file found',
        flaggedForReview: 1
      });
      continue;
    }

    const evidenceContent = fs.readFileSync(se.evidence_filepath, 'utf-8');
    const scenario = db.coverage.getById.get(se.scenario_id);

    const verifierPrompt = renderTemplate('verifier-prompt', {
      scenarioName: scenario.scenario_name,
      stepsList: scenario.steps,
      assertionsList: scenario.assertions,
      evidenceContent
    });

    const session = await client.session.create({
      body: { title: `Verifier - Exec ${se.execution_number} - ${scenario.scenario_name}` }
    });

    try {
      const result = await client.session.prompt({
        path: { id: session.data.id },
        body: {
          parts: [{ type: 'text', text: verifierPrompt }],
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                confidence_score: { type: 'number' },
                flagged_for_review: { type: 'boolean' },
                notes: { type: 'string' }
              },
              required: ['confidence_score', 'flagged_for_review', 'notes']
            },
            retryCount: 2
          }
        }
      });

      const v = result.data.info.structured_output || {};
      const wasModified = se.agent_modified === 1;
      const shouldFlag = (v.confidence_score ?? 0) < config.verifier.confidenceThreshold || wasModified;

      await db.scenarioExecution.updateVerification.run({
        id: se.id,
        confidenceScore: v.confidence_score ?? 0,
        verifierNotes: v.notes ?? '',
        flaggedForReview: shouldFlag ? 1 : 0
      });
    } catch (error) {
      await db.scenarioExecution.updateVerification.run({
        id: se.id,
        confidenceScore: 0,
        verifierNotes: `Verifier error: ${error.message}`,
        flaggedForReview: 1
      });
    } finally {
      try {
        await client.session.delete({ path: { id: session.data.id } });
      } catch (e) {}
    }
  }
}

/**
 * Run a full execution.
 */
async function runExecution(filterTags, modelConfig) {
  const model = modelConfig || `${config.model.provider}/${config.model.model}`;

  const lastExec = db.db.prepare('SELECT MAX(execution_number) as max FROM ExecutionRun').get();
  const executionNumber = (lastExec?.max || 0) + 1;

  const execResult = db.execution.create.run({
    executionNumber,
    executingModel: model,
    status: 'running',
    filterTags: filterTags || null
  });
  const executionId = execResult.lastInsertRowid;

  let scenarios;
  if (filterTags) {
    const tags = filterTags.split(',').map(t => t.trim().toLowerCase());
    const all = db.coverage.getAll.all();
    scenarios = all.filter(s => {
      const sTags = (s.risk_tags || '').toLowerCase().split(',').map(t => t.trim());
      return tags.some(t => sTags.includes(t));
    });
  } else {
    scenarios = db.coverage.getAll.all();
  }

  const execEvidenceDir = path.join(config.paths.evidence, `exec-${executionNumber}`);
  const execLogDir = path.join(config.paths.logs, `exec-${executionNumber}`);
  fs.mkdirSync(execEvidenceDir, { recursive: true });
  fs.mkdirSync(execLogDir, { recursive: true });

  const scenarioExecutions = [];
  for (const scenario of scenarios) {
    const seResult = db.scenarioExecution.create.run({
      executionId,
      executionNumber,
      scenarioId: scenario.id,
      status: 'pending',
      scenarioStartTime: null,
      evidenceFilepath: null,
      stepsSummary: JSON.stringify(JSON.parse(scenario.steps).map(() => 'pending')),
      assertionsSummary: JSON.stringify(JSON.parse(scenario.assertions).map(() => 'pending'))
    });
    scenarioExecutions.push({
      dbId: seResult.lastInsertRowid,
      scenario
    });
  }

  const limit = pLimit(config.concurrency);
  const tasks = scenarioExecutions.map(({ dbId, scenario }) =>
    limit(async () => {
      const scenarioEvidenceDir = path.join(execEvidenceDir, `scenario-${scenario.id}`);
      const logPath = path.join(execLogDir, `scenario-${scenario.id}.log`);
      fs.mkdirSync(scenarioEvidenceDir, { recursive: true });

      db.scenarioExecution.updateResult.run({
        id: dbId,
        status: 'running',
        scenarioEndTime: null,
        evidenceFilepath: null,
        stepsSummary: null,
        assertionsSummary: null,
        agentSummary: null,
        agentModified: 0
      });

      try {
        const startTime = new Date().toISOString();
        db.scenarioExecution.updateResult.run({
          id: dbId,
          status: 'running',
          scenarioStartTime: startTime,
          scenarioEndTime: null,
          evidenceFilepath: null,
          stepsSummary: null,
          assertionsSummary: null,
          agentSummary: null,
          agentModified: 0
        });

        const result = await runAgent(executionId, executionNumber, scenario, scenarioEvidenceDir, logPath);

        const evidencePath = path.join(scenarioEvidenceDir, 'evidence.md');
        const md = buildEvidenceMarkdown(scenario, {
          ...result,
          executionNumber
        }, scenarioEvidenceDir);
        fs.writeFileSync(evidencePath, md);

        db.scenarioExecution.updateResult.run({
          id: dbId,
          status: result.status,
          scenarioEndTime: new Date().toISOString(),
          evidenceFilepath: evidencePath,
          stepsSummary: JSON.stringify(result.steps),
          assertionsSummary: JSON.stringify(result.assertions),
          agentSummary: result.short_summary,
          agentModified: result.modified ? 1 : 0
        });
      } catch (error) {
        db.scenarioExecution.updateResult.run({
          id: dbId,
          status: 'failed',
          scenarioEndTime: new Date().toISOString(),
          evidenceFilepath: null,
          stepsSummary: JSON.stringify(['Agent error: ' + error.message]),
          assertionsSummary: JSON.stringify(['Not executed due to error']),
          agentSummary: `Agent crashed: ${error.message}`,
          agentModified: 0
        });
      }
    })
  );

  await Promise.all(tasks);

  await runVerifier(executionId, model);

  db.execution.updateStatus.run({ id: executionId, status: 'completed' });

  return { executionId, executionNumber, scenarioCount: scenarios.length };
}

module.exports = {
  ensureOpencodeClient,
  stopOpencodeServer,
  runExecution
};
