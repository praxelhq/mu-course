# Import and connect the Session 8 Make tool

This scenario is the **hand** in the Session 8 agent. It accepts structured lead details, applies explicit rules, and returns a draft. It does not need an app connection and it never sends or writes externally.

## Import it

1. In Make, create a new scenario.
2. Open the three-dot menu and choose **Import blueprint**.
3. Upload `praxelpay-safe-lead-tool.blueprint.json`.
4. Open **Scenario inputs** and confirm the six inputs are visible.
5. Open **Scenario outputs** and confirm the nine outputs are visible.
6. Set the scenario schedule to **On demand** and activate it.

If Make asks you to recreate an input or output after import, use the names and types already shown in the modules. Do not rename them; the test cases depend on the contract.

## Test it before MCP

Run the seven cases in `../fixtures/mcp-tool-test-cases.json`. The expected `status`, `route`, `reason`, `action_taken`, and draft fields must match the real scenario output. Then inspect the canvas: it must contain exactly two modules—`Start scenario` and `Return outputs`—with no email, CRM, payment, or other action module. The returned `action_taken` value is a declared contract field, not proof that an external action did not occur.

## Expose it as an MCP tool

1. In Make, open **MCP Toolboxes** and create a toolbox named `MU Session 8`.
2. Add this scenario as a tool.
3. Tool name: `prepare_qualified_lead_draft`.
4. Tool description: `Apply PraxelPay consent and approval rules, classify a lead, and prepare a draft for human review. Never sends or writes externally.`
5. Mark the tool read-only if Make offers that control.
6. Create an access token for the toolbox and connect the instructor's MCP client.

Never project or paste the access token. A token is a credential, not a classroom handout.

## Instructor demo prompt

> A founder from Northstar Labs asks about Enterprise. The company has 140 employees, the contact is founder@northstar.example, verified consent is recorded, and no risk flag is present. Use the lead-draft tool and tell me what happened. Do not claim that an email was sent or that approval was granted.

Expected result: `approval_required`, `manual_review`, and `draft_prepared_no_external_send`. The tool cannot accept or grant human approval; that requires a separate human-controlled flow.
