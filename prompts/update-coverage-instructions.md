# How to Populate the Coverage Table

The Coverage table defines what scenarios the agents will test. Each row is an independent test case.

## Table Schema

| Column | Description |
|--------|-------------|
| `system_name` | The name of the application under test (e.g., "Demo App", "ACME Portal") |
| `feature_name` | The feature area within the system (e.g., "Authentication", "Checkout", "Profile") |
| `scenario_name` | A unique, descriptive name for this test scenario |
| `risk_tags` | Comma-separated tags for filtering executions (e.g., "critical,smoke,regression") |
| `steps` | JSON array of strings. Each string is one step the agent should execute |
| `assertions` | JSON array of strings. Each string is one thing the agent should verify |

## Process for Adding Coverage

### Option 1: Via the Dashboard
1. Open the Tester Agent dashboard at `http://localhost:3456`
2. Go to the **Coverage** tab
3. Click **+ Add Scenario**
4. Fill in all fields
5. Click **Save**

### Option 2: Via an Agent
You can ask an Opencode agent to explore your application and generate coverage rows directly into the database.

The agent has access to the `bash` tool and can execute `sqlite3` commands against the database file at `data/tester.db`.

**Prompt template:**
```
Explore the application at [URL]. Identify all major user flows and features.
For each flow, break it down into:
1. A scenario name
2. The exact steps a user would take
3. The assertions that prove the flow works

Write each scenario directly to the SQLite database using the bash tool.

Database file: data/tester.db
Table: Coverage
Columns: system_name, feature_name, scenario_name, risk_tags, steps, assertions

Use this SQL format:
INSERT INTO Coverage (system_name, feature_name, scenario_name, risk_tags, steps, assertions)
VALUES (
  'App Name',
  'Feature Name',
  'Scenario Name',
  'critical,smoke',
  '["step 1", "step 2"]',
  '["assertion 1", "assertion 2"]'
);

Run the INSERT commands via sqlite3:
sqlite3 data/tester.db "INSERT INTO Coverage ..."

Make sure scenario names are unique. Tag critical paths as "critical".
```

### Option 3: Direct SQL
```sql
INSERT INTO Coverage (system_name, feature_name, scenario_name, risk_tags, steps, assertions)
VALUES (
  'Demo App',
  'Authentication',
  'User can log in with valid credentials',
  'critical,smoke',
  '["Navigate to login page", "Enter valid username and password", "Click login button"]',
  '["User is redirected to dashboard", "Welcome message displays username"]'
);
```

## Best Practices

- **Scenario names must be unique.** The database enforces this.
- **Steps should be atomic.** One action per step. Avoid "and" in steps.
- **Assertions should be verifiable.** An agent with browser tools must be able to check them.
- **Use risk_tags wisely.** Tag critical paths as `critical` so you can run them in isolation.
- **Start small.** Add 3-5 core scenarios first, verify they run, then expand.

## Example Well-Written Scenario

```json
{
  "system_name": "E-Commerce App",
  "feature_name": "Checkout",
  "scenario_name": "Guest user can complete checkout with credit card",
  "risk_tags": "critical,smoke",
  "steps": [
    "Navigate to product page",
    "Click Add to Cart",
    "Click Proceed to Checkout",
    "Enter shipping address",
    "Select credit card payment",
    "Enter card details",
    "Click Place Order"
  ],
  "assertions": [
    "Order confirmation page is displayed",
    "Order number is shown",
    "Confirmation email is mentioned"
  ]
}
```
