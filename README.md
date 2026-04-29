# Testing Agent

AI-driven scenario testing platform with coverage tracking, parallel agent execution, and evidence verification.

This is a **template repository**. Create your own copy to manage your team's test scenarios, execution history, and evidence.

---

## Workflow

```
Template Repo (this)
        |
        | Use this template
        v
   Your Private Repo
        |
        | git clone
        v
   Local Development
```

Your scenarios, execution history (`data/tester.db`), screenshots, and evidence are all committed to your private repo so your team can share them.

---

## 1. Create Your Own Repo from This Template

Click **"Use this template"** on GitHub, or use the CLI:

```bash
gh repo create my-team-tests --template Snogren/testing-agent --private
```

Then clone your new repo:

```bash
git clone https://github.com/yourname/my-team-tests.git
cd my-team-tests
npm install
```

**Why template instead of fork?** A fork implies contributing back. A template clone creates a clean, independent repo for your team's test data.

---

## 2. Configure Opencode

Install and configure Opencode: [https://opencode.ai/docs](https://opencode.ai/docs)

Create or edit `~/.config/opencode/opencode.json` and add the Playwright MCP server:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "playwright": {
      "type": "local",
      "command": ["npx", "-y", "@playwright/mcp@latest", "--isolated"],
      "enabled": true
    }
  }
}
```

Set your provider API key (Opencode reads standard provider env vars):

```bash
export ANTHROPIC_API_KEY=your-key-here
# or
export OPENAI_API_KEY=your-key-here
# or whichever provider you configured
```

---

## 3. Write Your Onboarding Docs

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

## 4. Add Test Scenarios

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

## 5. Run Your First Execution

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

## 6. Review Results

- **Green / passed** = Agent completed steps and assertions
- **Red / failed** = Agent hit an error or assertion failed
- **⚠️ Modified** = Agent deviated from the original test. Click **Evidence** to see why.
- **Flagged for review** = Verifier confidence was low or test was modified. Human eyes needed.

---

## Sharing Test Results with Your Team

Because `data/` and `evidence/` are tracked in git, your team's test history travels with the repo:

```bash
# After running tests, commit the results
git add data/ evidence/ docs/
git commit -m "Add login flow tests and evidence from execution #3"
git push origin main

# teammate pulls and sees everything
git pull origin main
npm start
# They see all scenarios, execution history, and evidence in the dashboard
```

---

## Pulling Updates from the Original Template

When the original template gets improvements (new features, bug fixes, better prompts), pull them into your repo:

```bash
# One-time setup
git remote add upstream https://github.com/Snogren/testing-agent.git

# Pull updates
git fetch upstream
git merge upstream/main
```

Resolve any conflicts, then push to your repo.

---

## Common Issues

| Problem | Fix |
|---------|-----|
| `Opencode server not found` | Make sure `opencode` CLI is installed and your provider API key is set |
| `Port 4097 in use` | Kill existing opencode processes: `pkill -f opencode` |
| Agent can't find login page | Check `docs/sitemap.md` and `docs/auth.md` are accurate |
| Screenshots missing | Agent may not have write permissions to `./evidence/`. Check `ls -la evidence/` |

---

## Next Steps

- Edit `config.js` to change the default model, concurrency, or verifier threshold
- Customize agent behavior by editing `prompts/agent-test-prompt.md`
- Run filtered executions by tag (e.g., only `critical` scenarios)
- Use the verifier to catch hallucinated results
