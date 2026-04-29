const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Ensure data directory exists
fs.mkdirSync(path.dirname(config.paths.db), { recursive: true });

const db = new Database(config.paths.db);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS Coverage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      system_name TEXT NOT NULL,
      feature_name TEXT NOT NULL,
      scenario_name TEXT NOT NULL UNIQUE,
      risk_tags TEXT,
      steps TEXT NOT NULL,
      assertions TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ExecutionRun (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      execution_number INTEGER NOT NULL UNIQUE,
      execution_start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      execution_end_time DATETIME,
      executing_model TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      filter_tags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ScenarioExecution (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      execution_id INTEGER NOT NULL,
      execution_number INTEGER NOT NULL,
      scenario_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      scenario_start_time DATETIME,
      scenario_end_time DATETIME,
      evidence_filepath TEXT,
      steps_summary TEXT,
      assertions_summary TEXT,
      agent_summary TEXT,
      agent_modified INTEGER DEFAULT 0,
      confidence_score REAL,
      verifier_notes TEXT,
      flagged_for_review INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (execution_id) REFERENCES ExecutionRun(id),
      FOREIGN KEY (scenario_id) REFERENCES Coverage(id)
    );

    CREATE INDEX IF NOT EXISTS idx_scenario_execution_run ON ScenarioExecution(execution_id);
    CREATE INDEX IF NOT EXISTS idx_scenario_execution_scenario ON ScenarioExecution(scenario_id);
    CREATE INDEX IF NOT EXISTS idx_coverage_system ON Coverage(system_name);
    CREATE INDEX IF NOT EXISTS idx_coverage_feature ON Coverage(feature_name);

    -- Auto-update updated_at on Coverage changes
    CREATE TRIGGER IF NOT EXISTS trg_coverage_updated
    AFTER UPDATE ON Coverage
    FOR EACH ROW
    BEGIN
      UPDATE Coverage SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);
}

// Seed data for initial testing
function seedData() {
  const count = db.prepare('SELECT COUNT(*) as count FROM Coverage').get().count;
  if (count > 0) return;

  const sampleScenarios = [
    {
      systemName: 'Demo App',
      featureName: 'Authentication',
      scenarioName: 'User can log in with valid credentials',
      riskTags: 'critical,smoke',
      steps: JSON.stringify([
        'Navigate to login page',
        'Enter valid username and password',
        'Click login button'
      ]),
      assertions: JSON.stringify([
        'User is redirected to dashboard',
        'Welcome message displays username'
      ])
    },
    {
      systemName: 'Demo App',
      featureName: 'Authentication',
      scenarioName: 'User sees error with invalid credentials',
      riskTags: 'critical',
      steps: JSON.stringify([
        'Navigate to login page',
        'Enter invalid username and password',
        'Click login button'
      ]),
      assertions: JSON.stringify([
        'Error message is displayed',
        'User remains on login page'
      ])
    },
    {
      systemName: 'Demo App',
      featureName: 'Profile',
      scenarioName: 'User can update display name',
      riskTags: 'medium',
      steps: JSON.stringify([
        'Navigate to profile page',
        'Click edit profile',
        'Change display name',
        'Click save'
      ]),
      assertions: JSON.stringify([
        'Success toast is shown',
        'Display name is updated in header'
      ])
    }
  ];

  const insert = db.prepare(`
    INSERT INTO Coverage (system_name, feature_name, scenario_name, risk_tags, steps, assertions)
    VALUES (@systemName, @featureName, @scenarioName, @riskTags, @steps, @assertions)
  `);

  for (const s of sampleScenarios) {
    insert.run(s);
  }
}

initSchema();
seedData();

// Coverage queries
const coverageQueries = {
  getAll: db.prepare('SELECT * FROM Coverage ORDER BY system_name, feature_name, scenario_name'),
  getById: db.prepare('SELECT * FROM Coverage WHERE id = ?'),
  getByScenarioName: db.prepare('SELECT * FROM Coverage WHERE scenario_name = ?'),
  create: db.prepare(`
    INSERT INTO Coverage (system_name, feature_name, scenario_name, risk_tags, steps, assertions)
    VALUES (@systemName, @featureName, @scenarioName, @riskTags, @steps, @assertions)
  `),
  update: db.prepare(`
    UPDATE Coverage SET
      system_name = @systemName,
      feature_name = @featureName,
      scenario_name = @scenarioName,
      risk_tags = @riskTags,
      steps = @steps,
      assertions = @assertions,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `),
  delete: db.prepare('DELETE FROM Coverage WHERE id = ?'),
  getLatestExecution: db.prepare(`
    SELECT se.*, er.execution_start_time, er.executing_model
    FROM ScenarioExecution se
    JOIN ExecutionRun er ON se.execution_id = er.id
    WHERE se.scenario_id = ?
    ORDER BY se.scenario_start_time DESC
    LIMIT 1
  `),
};

// Execution run queries
const executionQueries = {
  getAll: db.prepare('SELECT * FROM ExecutionRun ORDER BY execution_number DESC'),
  getById: db.prepare('SELECT * FROM ExecutionRun WHERE id = ?'),
  getByNumber: db.prepare('SELECT * FROM ExecutionRun WHERE execution_number = ?'),
  create: db.prepare(`
    INSERT INTO ExecutionRun (execution_number, executing_model, status, filter_tags)
    VALUES (@executionNumber, @executingModel, @status, @filterTags)
  `),
  updateStatus: db.prepare(`
    UPDATE ExecutionRun SET status = @status, execution_end_time = CURRENT_TIMESTAMP WHERE id = @id
  `),
};

// Scenario execution queries
const scenarioExecutionQueries = {
  getByExecutionId: db.prepare('SELECT * FROM ScenarioExecution WHERE execution_id = ? ORDER BY id'),
  getById: db.prepare('SELECT * FROM ScenarioExecution WHERE id = ?'),
  getHistoryByScenarioId: db.prepare(`
    SELECT se.*, er.execution_number, er.execution_start_time, er.executing_model
    FROM ScenarioExecution se
    JOIN ExecutionRun er ON se.execution_id = er.id
    WHERE se.scenario_id = ?
    ORDER BY se.scenario_start_time DESC
  `),
  create: db.prepare(`
    INSERT INTO ScenarioExecution (
      execution_id, execution_number, scenario_id, status, scenario_start_time,
      evidence_filepath, steps_summary, assertions_summary
    ) VALUES (
      @executionId, @executionNumber, @scenarioId, @status, @scenarioStartTime,
      @evidenceFilepath, @stepsSummary, @assertionsSummary
    )
  `),
  updateResult: db.prepare(`
    UPDATE ScenarioExecution SET
      status = @status,
      scenario_end_time = @scenarioEndTime,
      evidence_filepath = @evidenceFilepath,
      steps_summary = @stepsSummary,
      assertions_summary = @assertionsSummary,
      agent_summary = @agentSummary,
      agent_modified = @agentModified
    WHERE id = @id
  `),
  updateVerification: db.prepare(`
    UPDATE ScenarioExecution SET
      confidence_score = @confidenceScore,
      verifier_notes = @verifierNotes,
      flagged_for_review = @flaggedForReview
    WHERE id = @id
  `),
};

module.exports = {
  db,
  coverage: coverageQueries,
  execution: executionQueries,
  scenarioExecution: scenarioExecutionQueries,
};
