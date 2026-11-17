# FlareStarter foundation

This Cloudflare application is based on the public FlareStarter source at commit
`446571d2d7312e7f86bf25fced154a9d5e79abb7`:
https://github.com/FlareStarter/flarestarter

Its Apache-2.0 license is preserved in `LICENSE`. Business Map adds its own
manual workspace, private business storage, OAuth/MCP integration and embedded
MCP App. Modified upstream files are identified by the repository diff/history.
The commercial FlareStarter Pro source is not used. Billing and hosted model
inference are disabled in this pilot.

The portable schemas in `../shared/` and the existing Business Map visual
components come from the parent project, under its MIT `../LICENSE`. The cloud
build reuses these sources; no Paseo SDK or local agent processes run in Workers.
