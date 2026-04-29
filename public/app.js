// Global state
let currentDoc = 'auth';
let coverageTable, executionsTable, executionDetailTable, scenarioHistoryTable;
let previousSection = 'coverage';

// Initialize
async function init() {
  await loadCoverage();
  await loadExecutions();
  await loadDoc('auth');
}

function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(name + '-section').classList.add('active');

  document.querySelectorAll('.nav-tabs button').forEach(b => b.classList.remove('active'));
  const tabMap = { coverage: 0, executions: 1, docs: 2 };
  if (tabMap[name] !== undefined) {
    document.querySelectorAll('.nav-tabs button')[tabMap[name]]?.classList.add('active');
  }

  if (['coverage', 'executions', 'docs'].includes(name)) {
    previousSection = name;
  }
}

function historyBack() {
  showSection(previousSection);
}

// Coverage
async function loadCoverage() {
  const res = await fetch('/api/coverage');
  const data = await res.json();

  if (coverageTable) coverageTable.destroy();

  coverageTable = new Tabulator('#coverage-table', {
    data,
    layout: 'fitColumns',
    columns: [
      { title: 'System', field: 'system_name', headerFilter: 'input' },
      { title: 'Feature', field: 'feature_name', headerFilter: 'input' },
      { title: 'Scenario', field: 'scenario_name', headerFilter: 'input' },
      { title: 'Tags', field: 'risk_tags', formatter: cell => {
        const tags = (cell.getValue() || '').split(',').filter(Boolean);
        return tags.map(t => `<span class="tag">${t.trim()}</span>`).join('');
      }},
      { title: 'Last Status', formatter: cell => {
        const latest = cell.getRow().getData().latest_execution;
        if (!latest) return '<span class="status-pending">Never run</span>';
        const cls = `status-${latest.status}`;
        const time = new Date(latest.scenario_start_time).toLocaleString();
        return `<span class="${cls}">${latest.status}</span> <small>(${time})</small>`;
      }},
      { title: 'Actions', formatter: cell => {
        const d = cell.getRow().getData();
        const latest = d.latest_execution;
        let links = `<button class="secondary outline" onclick="viewScenario(${d.id})">View</button> `;
        links += `<button class="secondary outline" onclick="editCoverage(${d.id})">Edit</button> `;
        if (latest?.evidence_filepath) {
          links += `<button class="secondary outline" onclick="viewEvidence('${latest.evidence_filepath}')">Evidence</button>`;
        }
        return links;
      }, width: 220 }
    ],
    rowClick: (e, row) => viewScenario(row.getData().id)
  });
}

function filterCoverage() {
  const val = document.getElementById('coverage-filter').value;
  coverageTable.setFilter([
    { field: 'system_name', type: 'like', value: val },
    { field: 'feature_name', type: 'like', value: val },
    { field: 'scenario_name', type: 'like', value: val },
    { field: 'risk_tags', type: 'like', value: val }
  ]);
}

function openCoverageEditor() {
  document.getElementById('coverage-id').value = '';
  document.getElementById('coverage-system').value = '';
  document.getElementById('coverage-feature').value = '';
  document.getElementById('coverage-scenario').value = '';
  document.getElementById('coverage-tags').value = '';
  document.getElementById('coverage-steps').value = '';
  document.getElementById('coverage-assertions').value = '';
  document.getElementById('coverage-editor-title').textContent = 'Add Scenario';
  document.getElementById('btn-delete-coverage').style.display = 'none';
  showSection('coverage-editor');
}

async function editCoverage(id) {
  const res = await fetch(`/api/coverage/${id}`);
  const data = await res.json();
  document.getElementById('coverage-id').value = data.id;
  document.getElementById('coverage-system').value = data.system_name;
  document.getElementById('coverage-feature').value = data.feature_name;
  document.getElementById('coverage-scenario').value = data.scenario_name;
  document.getElementById('coverage-tags').value = data.risk_tags || '';
  document.getElementById('coverage-steps').value = data.steps.join('\n');
  document.getElementById('coverage-assertions').value = data.assertions.join('\n');
  document.getElementById('coverage-editor-title').textContent = 'Edit Scenario';
  document.getElementById('btn-delete-coverage').style.display = 'inline-block';
  showSection('coverage-editor');
}

async function saveCoverage(e) {
  e.preventDefault();
  const id = document.getElementById('coverage-id').value;
  const body = {
    systemName: document.getElementById('coverage-system').value,
    featureName: document.getElementById('coverage-feature').value,
    scenarioName: document.getElementById('coverage-scenario').value,
    riskTags: document.getElementById('coverage-tags').value,
    steps: document.getElementById('coverage-steps').value.split('\n').filter(Boolean),
    assertions: document.getElementById('coverage-assertions').value.split('\n').filter(Boolean)
  };

  if (id) {
    await fetch(`/api/coverage/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } else {
    await fetch('/api/coverage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  showSection('coverage');
  await loadCoverage();
}

async function deleteCoverage() {
  const id = document.getElementById('coverage-id').value;
  if (!id) return;
  if (!confirm('Delete this scenario?')) return;
  await fetch(`/api/coverage/${id}`, { method: 'DELETE' });
  showSection('coverage');
  await loadCoverage();
}

async function viewScenario(id) {
  const res = await fetch(`/api/coverage/${id}`);
  const data = await res.json();

  document.getElementById('scenario-detail-title').textContent = data.scenario_name;
  document.getElementById('scenario-info').innerHTML = `
    <p><strong>System:</strong> ${data.system_name}</p>
    <p><strong>Feature:</strong> ${data.feature_name}</p>
    <p><strong>Tags:</strong> ${(data.risk_tags || '').split(',').map(t => `<span class="tag">${t.trim()}</span>`).join('')}</p>
    <h4>Steps</h4>
    <ol>${data.steps.map(s => `<li>${s}</li>`).join('')}</ol>
    <h4>Assertions</h4>
    <ol>${data.assertions.map(a => `<li>${a}</li>`).join('')}</ol>
  `;

  const histRes = await fetch(`/api/scenario-executions/${id}/history`);
  const history = await histRes.json();

  if (scenarioHistoryTable) scenarioHistoryTable.destroy();
  scenarioHistoryTable = new Tabulator('#scenario-history-table', {
    data: history,
    layout: 'fitColumns',
    columns: [
      { title: 'Execution', field: 'execution_number' },
      { title: 'Status', field: 'status', formatter: cell => `<span class="status-${cell.getValue()}">${cell.getValue()}</span>` },
      { title: 'Started', field: 'scenario_start_time', formatter: cell => cell.getValue() ? new Date(cell.getValue()).toLocaleString() : '-' },
      { title: 'Model', field: 'executing_model' },
      { title: 'Modified', field: 'agent_modified', formatter: cell => cell.getValue() ? 'Yes' : 'No' },
      { title: 'Confidence', field: 'confidence_score' },
      { title: 'Actions', formatter: cell => {
        const d = cell.getRow().getData();
        if (d.evidence_filepath) {
          return `<button class="secondary outline" onclick="viewEvidence('${d.evidence_filepath}')">Evidence</button>`;
        }
        return '';
      }}
    ]
  });

  showSection('scenario-detail');
}

// Executions
async function loadExecutions() {
  const res = await fetch('/api/executions');
  const data = await res.json();

  if (executionsTable) executionsTable.destroy();

  executionsTable = new Tabulator('#executions-table', {
    data,
    layout: 'fitColumns',
    columns: [
      { title: '#', field: 'execution_number', width: 60 },
      { title: 'Status', field: 'status', formatter: cell => `<span class="status-${cell.getValue()}">${cell.getValue()}</span>` },
      { title: 'Model', field: 'executing_model' },
      { title: 'Started', field: 'execution_start_time', formatter: cell => new Date(cell.getValue()).toLocaleString() },
      { title: 'Ended', field: 'execution_end_time', formatter: cell => cell.getValue() ? new Date(cell.getValue()).toLocaleString() : '-' },
      { title: 'Filter', field: 'filter_tags' },
      { title: 'Actions', formatter: cell => {
        const d = cell.getRow().getData();
        return `<button class="secondary outline" onclick="viewExecution(${d.id})">View</button>`;
      }}
    ],
    rowClick: (e, row) => viewExecution(row.getData().id)
  });
}

function filterExecutions() {
  const val = document.getElementById('execution-filter').value;
  executionsTable.setFilter([
    { field: 'status', type: 'like', value: val },
    { field: 'executing_model', type: 'like', value: val },
    { field: 'filter_tags', type: 'like', value: val }
  ]);
}

async function viewExecution(id) {
  const res = await fetch(`/api/executions/${id}`);
  const data = await res.json();

  document.getElementById('execution-detail-title').textContent = `Execution #${data.execution_number} (${data.status})`;

  if (executionDetailTable) executionDetailTable.destroy();
  executionDetailTable = new Tabulator('#execution-detail-table', {
    data: data.scenarios,
    layout: 'fitColumns',
    columns: [
      { title: 'Scenario ID', field: 'scenario_id' },
      { title: 'Status', field: 'status', formatter: cell => `<span class="status-${cell.getValue()}">${cell.getValue()}</span>` },
      { title: 'Started', field: 'scenario_start_time', formatter: cell => cell.getValue() ? new Date(cell.getValue()).toLocaleString() : '-' },
      { title: 'Ended', field: 'scenario_end_time', formatter: cell => cell.getValue() ? new Date(cell.getValue()).toLocaleString() : '-' },
      { title: 'Modified', field: 'agent_modified', formatter: cell => cell.getValue() ? 'Yes' : 'No' },
      { title: 'Confidence', field: 'confidence_score' },
      { title: 'Flagged', field: 'flagged_for_review', formatter: cell => cell.getValue() ? '<span class="status-failed">YES</span>' : 'No' },
      { title: 'Actions', formatter: cell => {
        const d = cell.getRow().getData();
        let links = '';
        if (d.evidence_filepath) {
          links += `<button class="secondary outline" onclick="viewEvidence('${d.evidence_filepath}')">Evidence</button> `;
        }
        return links;
      }}
    ]
  });

  showSection('execution-detail');
}

// Evidence viewer
async function viewEvidence(filepath) {
  // Convert absolute path to relative URL path
  const evidenceBase = '/evidence/';
  const relativePath = filepath.replace(/.*evidence[/\\]/, '');
  const url = `/api/evidence/${relativePath}`;

  const res = await fetch(url);
  const markdown = await res.text();

  // Rewrite image paths to be absolute
  const baseDir = relativePath.split('/').slice(0, -1).join('/');
  const fixedMarkdown = markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
    if (src.startsWith('http') || src.startsWith('/')) return match;
    return `![${alt}](/evidence/${baseDir}/${src})`;
  });

  document.getElementById('evidence-content').innerHTML = marked.parse(fixedMarkdown);
  showSection('evidence');
}

// Trigger execution
async function triggerExecution() {
  await runExecution();
}

async function triggerFilteredExecution() {
  const tags = prompt('Enter tags to filter by (comma-separated):');
  if (tags === null) return;
  await runExecution(tags);
}

async function runExecution(filterTags) {
  const model = prompt('Model override (leave blank for default):') || undefined;
  if (!confirm(`Start execution${filterTags ? ` with tags: ${filterTags}` : ''}?`)) return;

  const res = await fetch('/api/executions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filterTags, model })
  });

  if (res.ok) {
    const data = await res.json();
    alert(`Execution #${data.executionNumber} started with ${data.scenarioCount} scenarios.`);
    setTimeout(loadExecutions, 2000);
  } else {
    const err = await res.json();
    alert('Error: ' + err.error);
  }
}

// Docs
async function loadDoc(name) {
  currentDoc = name;
  document.getElementById('doc-title').textContent = name.charAt(0).toUpperCase() + name.slice(1);

  try {
    const res = await fetch(`/api/docs/${name}`);
    if (res.ok) {
      document.getElementById('doc-content').value = await res.text();
    } else {
      document.getElementById('doc-content').value = '';
    }
  } catch (e) {
    document.getElementById('doc-content').value = '';
  }
}

async function saveCurrentDoc() {
  const content = document.getElementById('doc-content').value;
  await fetch(`/api/docs/${currentDoc}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: content
  });
  alert(`${currentDoc} saved.`);
}

// Start
init();
