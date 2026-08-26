# Session 8 source ledger

Checked on 26 August 2026.

| Topic | Current authority | Used for |
| --- | --- | --- |
| MCP architecture | [MCP specification: Architecture](https://modelcontextprotocol.io/specification/2025-06-18/architecture) | Host, client, server model; capability negotiation |
| MCP server features | [MCP specification: Server features](https://modelcontextprotocol.io/specification/2025-06-18/server/index) | Tools, resources, and prompts distinction |
| MCP current direction | [MCP roadmap, August 2026](https://blog.modelcontextprotocol.io/posts/mcp-roadmap/) | Current ecosystem context, not classroom mechanics |
| Make MCP | [Introduction to MCP](https://help.make.com/introduction-to-mcp) | Scenarios can be exposed as tools |
| Make MCP Toolboxes | [MCP Toolboxes](https://help.make.com/mcp-toolboxes) | Selected tools, individual access tokens, read/write control, on-demand scenarios |
| Make scenario contracts | [Scenario inputs and outputs](https://help.make.com/scenario-inputs-and-outputs) | Structured tool inputs and outputs |
| Make blueprint import | [Blueprints](https://help.make.com/blueprints) | Import behavior and connection caveat |
| Make formula syntax | [General functions](https://help.make.com/general-functions), [Text and binary functions](https://help.make.com/text-and-binary-functions) | Current `if`, `switch`, `lower`, and `trim` syntax; avoids unsupported concatenation helpers |
| RAG simulator | [MU Forge RAG simulator](https://rag-simulator-production.up.railway.app/experiment) | Existing hands-on retrieval exercise |

## Deliberate scope choices

- The core class does not depend on a paid ChatGPT or Claude plan. The instructor may demonstrate an MCP client; students can still inspect, test, and expose the Make scenario.
- The Make scenario has no app connection and no irreversible action. It demonstrates a trustworthy tool contract before students build write-capable automations.
- The three PraxelPay knowledge files are fictional teaching fixtures, not external facts.
- Production state: authored and statically validated. A real Make import, activation, Toolbox invocation, and instructor rehearsal remain required before classroom use.
