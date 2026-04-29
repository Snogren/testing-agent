const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const db = require('./database');
const orchestrator = require('./orchestrator');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/evidence', express.static(config.paths.evidence));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const client = await orchestrator.ensureOpencodeClient();
    const health = await client.global.health();
    res.json({ status: 'ok', opencode: health.data });
  } catch (e) {
    res.status(503).json({ status: 'error', opencode: e.message });
  }
});

// Coverage routes
app.get('/api/coverage', (req, res) => {
  const rows = db.coverage.getAll.all();
  const enriched = rows.map(r => {
    const latest = db.coverage.getLatestExecution.get(r.id);
    return {
      ...r,
      steps: JSON.parse(r.steps),
      assertions: JSON.parse(r.assertions),
      latest_execution: latest || null
    };
  });
  res.json(enriched);
});

app.get('/api/coverage/:id', (req, res) => {
  const row = db.coverage.getById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  row.steps = JSON.parse(row.steps);
  row.assertions = JSON.parse(row.assertions);
  res.json(row);
});

app.post('/api/coverage', (req, res) => {
  const { systemName, featureName, scenarioName, riskTags, steps, assertions } = req.body;
  try {
    const result = db.coverage.create.run({
      systemName, featureName, scenarioName, riskTags,
      steps: JSON.stringify(steps),
      assertions: JSON.stringify(assertions)
    });
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.patch('/api/coverage/:id', (req, res) => {
  const { systemName, featureName, scenarioName, riskTags, steps, assertions } = req.body;
  db.coverage.update.run({
    id: req.params.id,
    systemName, featureName, scenarioName, riskTags,
    steps: JSON.stringify(steps),
    assertions: JSON.stringify(assertions)
  });
  res.json({ success: true });
});

app.delete('/api/coverage/:id', (req, res) => {
  db.coverage.delete.run(req.params.id);
  res.json({ success: true });
});

// Execution routes
app.get('/api/executions', (req, res) => {
  const rows = db.execution.getAll.all();
  res.json(rows);
});

app.get('/api/executions/:id', (req, res) => {
  const exec = db.execution.getById.get(req.params.id);
  if (!exec) return res.status(404).json({ error: 'Not found' });
  const scenarios = db.scenarioExecution.getByExecutionId.all(req.params.id);
  res.json({ ...exec, scenarios });
});

app.post('/api/executions', async (req, res) => {
  const { filterTags, model } = req.body;
  try {
    const result = await orchestrator.runExecution(filterTags, model);
    res.status(201).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Scenario execution routes
app.get('/api/scenario-executions/:id', (req, res) => {
  const se = db.scenarioExecution.getById.get(req.params.id);
  if (!se) return res.status(404).json({ error: 'Not found' });
  res.json(se);
});

app.get('/api/scenario-executions/:id/history', (req, res) => {
  const rows = db.scenarioExecution.getHistoryByScenarioId.all(req.params.id);
  res.json(rows);
});

// Evidence serving
app.get('/api/evidence/*', (req, res) => {
  const filePath = path.join(config.paths.evidence, req.params[0]);
  if (!filePath.startsWith(config.paths.evidence)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(filePath);
});

// Docs (auth, env, sitemap)
app.get('/api/docs/:name', (req, res) => {
  const filePath = path.join(config.paths.docs, `${req.params.name}.md`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(filePath);
});

app.put('/api/docs/:name', express.text(), (req, res) => {
  const filePath = path.join(config.paths.docs, `${req.params.name}.md`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, req.body);
  res.json({ success: true });
});

// Catch-all: serve index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(config.port, async () => {
  console.log(`Tester Agent dashboard running at http://localhost:${config.port}`);
  try {
    await orchestrator.ensureOpencodeClient();
    console.log('Opencode server connected/started successfully');
  } catch (e) {
    console.warn('Warning: could not connect to opencode server:', e.message);
    console.warn('Execution will fail until opencode serve is available');
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await orchestrator.stopOpencodeServer();
  server.close(() => {
    process.exit(0);
  });
});

module.exports = app;
