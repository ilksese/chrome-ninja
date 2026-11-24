# @chrome-ninja/page-control

Local page control service for the Chrome Ninja extension. It accepts a batch of page actions and forwards them to the connected extension. It does not reload the extension, query DOM, or attach the Chrome debugger.

## Run

```bash
pnpm --filter @chrome-ninja/page-control dev
```

The service listens on `127.0.0.1:8788` by default. `HOST`, `PORT`, and `--port` override the bind address. Use another port when `8788` is occupied. This port is intentionally separate from dev-bridge's default `8787`.

The extension connects outbound while its home-list switch is on. It uses `VITE_CHROME_NINJA_PAGE_CONTROL_PORT` when that variable is present at build time, and otherwise uses `8788`. This process does not start Chrome or the extension.

## HTTP

`POST /page-control` accepts an array of actions. Actions run in order and stop at the first failure. Every action except `tab-list` requires a positive integer `tabId`.

`snapshot` returns an accessibility tree for that top document, with ARIA-style roles, names, states, and a Playwright-style `text` rendering. Operable nodes get a stable `ref` (`e1`, `e2`, …) stored in `data-chrome-ninja-ref` and rendered as `[ref=e1]`. Refs stay the same while the document order of those nodes stays the same, and each snapshot rewrites them. `click`, `hover`, `fill`, and `select` require exactly one of `selector`, `xpath`, or `ref`. `click` scrolls the target into view, then dispatches pointer and mouse events, including `click`. `hover` scrolls into view and dispatches hover events; scripted events cannot set CSS `:hover`. `fill` writes string `value` into an input, textarea, or contenteditable, then dispatches `input` and `change`. `select` chooses one option of a native single select by exactly one of `value` or `label`.

`scroll` requires finite `x` and `y`. Positive `x` moves right and positive `y` moves down, instantly. Without a target it scrolls the top document. With exactly one of `selector`, `xpath`, or `ref`, it scrolls that element, or the nearest scrollable ancestor when the element itself cannot scroll. `press` accepts `Enter`, `Escape`, or `Tab`, optional boolean `altKey`, `ctrlKey`, `metaKey`, and `shiftKey`, and an optional target. Untrusted keys do not run browser defaults: Tab moves focus, and Enter without modifiers calls `requestSubmit` on a single-line input or button.

`wait` accepts `until` of `load`, `selector`, or `text`. `load` waits for the given tab to finish loading. If it is already complete, it waits up to 200ms for a navigation to start and otherwise returns. `selector` and `text` wait in that tab's top document. Optional integer `timeout` defaults to 5000 and cannot exceed 7000, leaving room inside the 8 second server budget. `navigation` opens an `http` or `https` URL in the given tab, or in a new child tab in that tab's window when `newPage` is true, without waiting for load. One opened tab is returned as `tabId`; more than one in a batch is `tabIds`. `activate` focuses the given tab's window and makes that tab active. `history` accepts `direction` of `back`, `forward`, or `reload` for the given tab and does not wait. `reload` uses the tabs API. `back` and `forward` call `history.back()` and `history.forward()` in the page. `back` fails when `history.length` is 1. `forward` does not check that a later entry exists. `screenshot` requires `tabId`. `captureVisibleTab` can only see the window's visible tab, so a background tab is activated for the capture and the previous tab is restored without focusing its window. The result is a jpeg data URL at quality 60. It does not attach the debugger. One screenshot is `screenshot`; more than one in a batch is `screenshots`.

`tab-list` takes no arguments and rejects `tabId`. It returns every tab in the last focused window, ordered from left to right, as `{ title, tabId, url, active }`. It only lists tabs, including restricted pages, and does not inject into them. A returned `tabId` targets a later action.

```powershell
curl.exe -X POST http://127.0.0.1:8788/page-control -H "content-type: application/json" --data-raw '[{"action":"snapshot","tabId":1},{"action":"click","tabId":1,"ref":"e1"}]'
curl.exe -X POST http://127.0.0.1:8788/page-control -H "content-type: application/json" --data-raw '[{"action":"tab-list"}]'
```

Unknown actions are rejected. If the extension is not connected, the request fails immediately. A successful snapshot is returned as `snapshot`. One screenshot is `screenshot`; two or more are `screenshots`. One tab opened by `navigation` is `tabId`; two or more are `tabIds`. One successful `tab-list` is returned as `tabs`; two or more in the same batch are returned as `tabLists`. `GET /health` reports whether an extension socket is currently open.
