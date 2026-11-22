# @chrome-ninja/page-control

Local page control service for the Chrome Ninja extension. It accepts a batch of page actions and forwards them to the connected extension. It does not reload the extension, query DOM, or attach the Chrome debugger.

## Run

```bash
pnpm --filter @chrome-ninja/page-control dev
```

The service listens on `127.0.0.1:8788` by default. `HOST`, `PORT`, and `--port` override the bind address. Use another port when `8788` is occupied. This port is intentionally separate from dev-bridge's default `8787`.

The extension connects outbound while its home-list switch is on. It uses `VITE_CHROME_NINJA_PAGE_CONTROL_PORT` when that variable is present at build time, and otherwise uses `8788`. This process does not start Chrome or the extension.

## HTTP

`POST /page-control` accepts an array of actions. Actions run in order and stop at the first failure. `scroll` moves the top document of the active tab in the last focused window once, instantly. Positive `x` moves right and positive `y` moves down. `click` clicks the first matching element; provide exactly one of `selector` or `xpath`. `snapshot` returns an accessibility tree for that top document, with ARIA-style roles, names, states, and a Playwright-style `text` rendering. `navigation` opens an `http` or `https` URL in the active tab, or in a new tab when `newPage` is true. `tab-list` takes no arguments and returns every tab in that same window, ordered from left to right, as `{ title, tabId, url, active }`. It only lists tabs, including restricted pages, and does not inject into them.

```powershell
curl.exe -X POST http://127.0.0.1:8788/page-control -H "content-type: application/json" --data-raw '[{"action":"scroll","x":0,"y":400},{"action":"click","selector":"a"}]'
curl.exe -X POST http://127.0.0.1:8788/page-control -H "content-type: application/json" --data-raw '[{"action":"tab-list"}]'
```

`scroll` requires finite `x` and `y`. `click` requires a non-empty `selector` or `xpath`, but not both. `snapshot` and `tab-list` take no target. `navigation` requires `url` and boolean `newPage`. Unknown actions are rejected. The caller does not choose a tab. If the extension is not connected, the request fails immediately. A successful snapshot is returned as `snapshot`. One successful `tab-list` is returned as `tabs`; two or more in the same batch are returned as `tabLists`. `GET /health` reports whether an extension socket is currently open.
