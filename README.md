# Getting Started

Five steps from zero to your first automated test execution.

---

## 1. Prerequisites

- **Node.js 18+**
- **Opencode CLI** installed (`npm install -g opencode` or see [opencode.ai](https://opencode.ai))
- **API key** for your LLM provider (e.g., Anthropic, OpenAI)
- **Your app running locally** at a known URL

---

## 2. Install

```bash
git clone <your-repo-url> tester-agent
cd tester-agent
npm install
```

---

## 3. Configure Opencode

Create or edit `~/.config/opencode/opencode.json` and add the Playwright MCP server:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-3-5-sonnet-20241022",
  "mcp": {
    "playwright": {
      "type": "local",
      "command": ["npx", "-y", "@playwright/mcp@latest", "--isolated"],
      "enabled": true
    }
  }
}
```

Set your API key:

```bash
export ANTHROPIC_API_KEY=your-key-here
```

*(Or add it to your shell profile. Opencode reads standard provider env vars.)*

---

## 4. Write Your Onboarding Docs

Edit these three files so the agent knows how to access your app:

| File | What to write |
|------|---------------|
| `docs/auth.md` | Login URL, test credentials, how to log in |
| `docs/env.md` | Base URL, any environment-specific notes |
| `docs/sitemap.md` | Key pages and how to navigate to them |

**Example `docs/auth.md`:**
```markdown
# Authentication

- Login page: http://localhost:3000/login
- Test user: test@example.com / password123
- Click "Sign In" button after filling the form
```

**Don't know your sitemap?** Use the prompt in `prompts/create-sitemap-instructions.md` to have an agent explore your app and write it for you.

---

## 5. Add Test Scenarios

### Option A: Via the Dashboard

```bash
npm start
```

Open `http://localhost:3456`, go to the **Coverage** tab, click **+ Add Scenario**, and fill in the form.

### Option B: Let an Agent Generate Them

Use the prompt in `prompts/update-coverage-instructions.md`. Copy-paste it into an Opencode session and point it at your app. The agent will write scenarios directly into the SQLite database.

### Option C: SQL

```bash
sqlite3 data/tester.db "INSERT INTO Coverage (system_name, feature_name, scenario_name, risk_tags, steps, assertions) VALUES ('My App', 'Auth', 'User can log in', 'critical,smoke', '[\"Navigate to login\", \"Enter credentials\", \"Click login\"]', '[\"Redirected to dashboard\"]');"
```

---

## 6. Run Your First Execution

```bash
npm start
```

1. Open `http://localhost:3456`
2. Go to the **Coverage** tab
3. Click **Run All**
4. Confirm the model prompt (or leave blank for default)
5. Wait for execution to complete
6. Check **Executions** tab for results

---

## 7. Review Results

- **Green / passed** = Agent completed steps and assertions
- **Red / failed** = Agent hit an error or assertion failed
- **⚠️ Modified** = Agent deviated from the original test. Click **Evidence** to see why.
- **Flagged for review** = Verifier confidence was low or test was modified. Human eyes needed.

---

## Common Issues

| Problem | Fix |
|---------|-----|
| `Opencode server not found` | Make sure `opencode` CLI is installed and `ANTHROPIC_API_KEY` is set |
| `Port 4097 in use` | Kill existing opencode processes: `pkill -f opencode` |
| Agent can't find login page | Check `docs/sitemap.md` and `docs/auth.md` are accurate |
| Screenshots missing | Agent may not have write permissions to `./evidence/`. Check `ls -la evidence/` |

---

## Next Steps

- Edit `config.js` to change the default model, concurrency, or verifier threshold
- Customize agent behavior by editing `prompts/agent-test-prompt.md`
- Run filtered executions by tag (e.g., only `critical` scenarios)
- Use the verifier to catch hallucinated results
