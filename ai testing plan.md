# Tables

## Scenario Executions

Columns:

- ID
- Execution#
- Scenario#
- Status
- ScenarioStartTime
- ScenarioEndTime
- EvidenceFilePath)
- Steps
- Assertions

## Coverage

Columns:

- ID
- SystemName
- FeatureName
- ScenarioName
- RiskTags
- Steps
- Assertions

## Execution Run

Columns:

- ID
- ExecutionStartTime
- ExecutionEndTime
- ExecutingModel

# Other files

Screenshot uploads
Evidence markdowns
Evidence markdown template
Auth file: instructions for auth
Env file: instructions for the env

# Frontend

View and filter coverage
Coverage shows last execution status and time with link to the execution
View and filter the executions
View an execution and view/filter the executed scenarios
View a scenario, its data, and see its executions history and evidence files
View an evidence file and see an online version of the markdown, complete with the inline screenshots the agent added
Modify scenarios: edit assertions, steps
View/modify auth file
View/modify env file

# Process

1. Setup the test env, seed data, make sure it's reachable 
2. Setup the execution: create an execution record
3. Setup scenario: create a scenario record, create the evidence markdown by copying the template filled out from reading the scenario record
4. Start the agent to test that scenario, advising it to follow the steps, complete the assertions, take screenshots, and provide the evidence that it succeeded or was blocked in the evidence file (within inline screenshots referencing the screenshot files)
5. Start X number of agents in parallel: setup scenario + start agent
6. Start the evidence verifier agent: read each evidence file and give it a confidence score that the test status and evidence match the intention of the scenario and sufficiently prove the test was completed and not hallucinated or changed.
7. Complete the execution.

# Notes

Steps 1, 2, 3, and 7 don't need any LLM involvement.
Steps 4 and 6 can be isolated independent agents, I believe.
I don't believe there's a need for an orchestrator agent.
Test agents can return a JSON with the status, whether the test was modified, and confirmation that each assertion passed. Can the JSON be dynamic (i.e. an array for assertions and an array for steps, which gets populated by the values in the coverage table)?

# First steps

Resolve ambiguities. Settle on templates. Etc.