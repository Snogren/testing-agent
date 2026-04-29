/**
 * Central configuration file for all CLI fallbacks and defaults.
 * Edit this file to change default behavior without passing CLI args.
 */

const path = require('path');

const config = {
  // Server settings
  port: parseInt(process.env.PORT, 10) || 3456,

  // Opencode server connection
  opencode: {
    // Set to null to auto-start a dedicated opencode server.
    // Set to a URL like "http://localhost:4096" to connect to an existing one.
    serverUrl: process.env.OPENCODE_SERVER_URL || null,
    hostname: process.env.OPENCODE_HOSTNAME || '127.0.0.1',
    port: parseInt(process.env.OPENCODE_PORT, 10) || 4097,
    timeout: parseInt(process.env.OPENCODE_TIMEOUT, 10) || 30000,
  },

  // Model configuration
  model: {
    // CLI arg --model overrides this
    provider: process.env.MODEL_PROVIDER || 'anthropic',
    model: process.env.MODEL || 'claude-3-5-sonnet-20241022',
  },

  // Concurrency
  concurrency: parseInt(process.env.CONCURRENCY, 10) || 3,

  // Timeouts (ms)
  timeouts: {
    scenarioPrompt: parseInt(process.env.SCENARIO_TIMEOUT, 10) || 300000, // 5 min
    verifierPrompt: parseInt(process.env.VERIFIER_TIMEOUT, 10) || 300000, // 5 min
  },

  // Paths
  paths: {
    db: process.env.DB_PATH || path.join(__dirname, 'data', 'tester.db'),
    evidence: process.env.EVIDENCE_PATH || path.join(__dirname, 'evidence'),
    logs: process.env.LOGS_PATH || path.join(__dirname, 'logs'),
    docs: process.env.DOCS_PATH || path.join(__dirname, 'docs'),
  },

  // Verifier threshold
  verifier: {
    confidenceThreshold: parseFloat(process.env.VERIFIER_THRESHOLD) || 0.7,
  },

  // Playwright MCP config for opencode server
  playwrightMcp: {
    enabled: true,
    command: ['npx', '-y', '@playwright/mcp@latest', '--isolated'],
  },
};

module.exports = config;
