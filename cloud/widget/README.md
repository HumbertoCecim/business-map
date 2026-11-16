# Business Map MCP App

`node widget/build.mjs` creates `widget/dist/map.html`, the trusted, self-contained React/ReactFlow/ELK app registered at `ui://business-map/map-v3.html`. The former `map-v1.html` and `map-v2.html` URIs remain compatibility aliases serving the corrected widget. Build the widget before the Cloudflare application, which imports that HTML as a raw resource. No model-generated HTML, skill scripts, external fonts, analytics, or content-derived scripts are loaded.

The client uses the official [`App` bridge](https://apps.extensions.modelcontextprotocol.io/api/classes/app.App.html). It reads canonical data only from tool result `_meta.businessMap`, requests `business_get_ui_state` on initialization and every 15 seconds while visible, and refreshes after mutations. Fullscreen appears only when advertised by the host.

Only `business_show_map` advertises a UI resource. Proposal submission and app-only refresh/apply/reject/undo return data without a template, so the host does not recreate a component on every refresh. After metadata changes, refresh the connector in ChatGPT's app details and open a new map. This follows the official [decoupled UI pattern](https://developers.openai.com/plugins/build/chatgpt-ui#decoupled-pattern) and [connector refresh guidance](https://developers.openai.com/api/docs/guides/custom-mcp-server).

The result contract is `{ snapshot, proposalPreview?, approvalAvailable, capabilities: { apply?, reject?, undo? } }`. Approval capabilities remain exclusively inside the transport closure. They never enter React state, model context, browser storage, DOM attributes, URLs, or logs. A new revision invalidates the reviewed preview. User confirmation invokes `business_apply_proposal` or `business_reject_proposal`; the domain server decides authorization, revision validity and atomicity.

The widget supports viewing, selecting, searching, zooming, reviewing, confirming, rejecting and undoing. Manual editing belongs to the `/business` website. Confirmation takes place inside the widget.

Inline layout has an intrinsic 600px height (560px on narrow screens), including borders. The SDK's document observer is disabled (`autoResize: false`): the app sends only this explicit inline design height, initially and after a width breakpoint/mode change. Host-injected document styles cannot feed measured viewport height back to the host. Fullscreen alone fills the host viewport and sends no size reports. Details scroll inside the bounded panel. Canvas resizing and unchanged refreshes preserve the chosen viewport; content/area changes fit the new layout, and superseded fit timers are cancelled. The footer shows interface version `v0.1.2` to distinguish new code from cached conversation components.

## Verification

Run from `cloud/`:

```sh
node widget/build.mjs
pnpm exec vitest run --project node src/features/business/widget-transport.node.test.ts
pnpm exec playwright test --config widget/playwright.config.ts
```

The isolated browser harness serves the real manual UI and built widget in memory. Test data and mocked server results exist only in the Playwright tests. The embedded test uses the official `AppBridge` and `PostMessageTransport` to verify the App handshake, fullscreen negotiation, hidden metadata, proposal review and in-widget confirmation. The host applies size notifications to the iframe, exercising the feedback path rather than keeping a fixed test frame. Regression tests cover stable height, preserved zoom, and narrow dark/fullscreen views. It does not call a model or a real account. `BUSINESS_MAP_TEST_BROWSER` can select an already installed Chromium executable.
