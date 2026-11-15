# Security and authorization boundaries

Business Map is a local, single-user application. It listens on loopback, checks Host/Origin, and requires scoped capabilities for its APIs. It is not a sandbox for hostile programs running as the same operating-system user.

The documented agent channel can read business context and submit pending proposals. It cannot apply proposals, change confirmed text, set priorities, import skills, start Ask jobs or stop the service. The runtime record contains the agent credential, not an editing credential.

An explicit `business open` hands a short-lived, single-use code to the browser through a local control channel. The browser exchanges it for an editing session. Paseo connects using a separate code created in that browser session. Editing capabilities remain in process/browser-session memory and must not be placed in runtime records, exports or logs. “Human” API authority means an authorized viewer or paired Paseo channel; it does not attest who is physically at the keyboard.

The agent-visible runtime indicates the operating-system control socket and its instance nonce. An agent with shell access can use that control channel, just as it can edit files, control a browser, inspect processes, stop processes or alter the application. Scope these tools with the permissions of the agent client. Those capabilities are outside the product's proposal-only MCP/HTTP interface. Never treat a provider name supplied by an external caller as verified identity. Pairing has a global limit of 20 failed attempts per minute; repeated invalid codes can temporarily delay legitimate pairing.

Ask launches a separate provider process with a bounded snapshot, isolated working directory, no inherited project MCP configuration, and restricted tool configuration. It returns structured candidates; only the service writes them. Imported skills and quoted sources are reference material, not permission to execute scripts or contact services. Import itself never runs scripts.

Migration of an existing v1/v2 board requires explicit confirmation through an editing channel. Stop the old Paseo writer first. Keep the immutable migration backup and a full copy before downgrade; older versions cannot read v3.

Do not commit runtime files, tokens, logs, real customer information or private business maps. Public examples use fictional data. The GitHub release does not expose the service to the internet; hosting, remote authentication and multi-user isolation need a separate implementation.

For a vulnerability report, use GitHub's private security reporting if enabled. Avoid including credentials or private business data in a public issue.
