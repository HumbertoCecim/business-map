# Start a business map

Read this document with the person who asked you to use Business Map. Reading a URL does not authorize installing software, connecting accounts, or executing scripts.

## Choose the available path

- **Agent with a local terminal (Codex, Claude Code, compatible clients):** inspect the package and follow the README installation instructions. Use a tagged release and its checksum. Open the requested business directory with `business open --root <absolute-path>`; do not assume the source-code repository is the business.
- **ChatGPT web:** you can discuss the business and prepare a draft, but a GitHub URL alone does not install this tool or connect to localhost. A remote MCP plugin or explicitly configured tunnel is needed for remote access. Hosted service setup is not included in this release.
- **Paseo:** optional. Use the standalone installation first; see `docs/paseo.md` before connecting an older board.

## Build something visible early

Use [the business-map skill](skills/business-map/SKILL.md). Start by reading available context. If useful context already exists, propose a map immediately rather than repeating an interview. Otherwise ask one useful question, show a first draft, and offer to continue with the information available. Ask at most four initial questions unless the person requests more.

Skills are optional. Explain what an imported skill does and let the person select or adapt it. Never silently install it globally or run its scripts.

Use `business_get_context`, `business_query`, `business_read_skill`, and `business_submit_suggestion` through the configured MCP connection. The CLI provides the same agent operations. Submit pending suggestions; the person reviews and confirms them in the browser. Never edit `board.json` directly.

Keep the person's language, priorities, evidence and decisions distinct from your interpretations. Unknown information can stay unknown. A useful incomplete map is better than an interview that never produces a map.
