# @chrome-ninja/hmr

Local HMR and debug service for the Chrome Ninja extension.

The service listens on `127.0.0.1:8787` by default and connects to the extension background service worker over WebSocket. It is intended for local development only.

Package subpaths:

- `@chrome-ninja/hmr` and `@chrome-ninja/hmr/server`: local Node HMR service.
- `@chrome-ninja/hmr/client`: extension-side background and runtime clients.
- `@chrome-ninja/hmr/protocol`: shared browser-safe protocol types and constants.

## Start

```bash
pnpm --filter @chrome-ninja/hmr dev
```

Environment variables:

- `HOST`: bind host, defaults to `127.0.0.1`.
- `PORT`: bind port, defaults to `8787`.
- `CHROME_NINJA_HMR_CERT` / `CHROME_NINJA_DEBUG_CERT`: optional HTTPS cert path.
- `CHROME_NINJA_HMR_KEY` / `CHROME_NINJA_DEBUG_KEY`: optional HTTPS key path.
- `CHROME_NINJA_HMR_EXECUTE_TIMEOUT_MS`: command/execute timeout, defaults to `15000`.

## Health

```bash
curl http://127.0.0.1:8787/health
```

Returns service metadata, supported features, WebSocket URL, and connected extension client counts.

## Generic Command API

Use `POST /command` for CSP-safe debugging. This endpoint sends a whitelisted command to the extension instead of evaluating arbitrary JavaScript.

Request shape:

```json
{
  "target": "background",
  "command": "storage:get",
  "payload": {},
  "tabId": 123,
  "allFrames": false
}
```

Supported targets:

- `background`
- `content`
- `popup`
- `options`

Supported commands:

- `storage:get`
- `storage:set`
- `tabs:query`
- `tabs:reload`
- `dom:query`

### storage:get

Runs in the background service worker.

```bash
curl -X POST http://127.0.0.1:8787/command \
  -H "content-type: application/json" \
  -d '{"target":"background","command":"storage:get","payload":{"area":"local","keys":["options"]}}'
```

Payload:

- `area`: `local`, `sync`, or `session`; defaults to `local`.
- `keys`: Chrome storage `get` keys.

### storage:set

Runs in the background service worker.

```bash
curl -X POST http://127.0.0.1:8787/command \
  -H "content-type: application/json" \
  -d '{"target":"background","command":"storage:set","payload":{"area":"local","merge":true,"value":{"options":{"baidu":{"clearSearch":true}}}}}'
```

Payload:

- `area`: `local`, `sync`, or `session`; defaults to `local`.
- `value`: object passed to Chrome storage.
- `merge`: when `true`, deep merges JSON objects per top-level storage key before writing.

`merge` is generic JSON merging. It does not know about `options`, `baidu`, or any feature-specific schema.

### tabs:query

Runs in the background service worker and returns safe tab fields only.

```bash
curl -X POST http://127.0.0.1:8787/command \
  -H "content-type: application/json" \
  -d '{"target":"background","command":"tabs:query","payload":{"active":true,"currentWindow":true}}'
```

Payload supports `active`, `currentWindow`, and `url`.

Returned tab fields are limited to `id`, `url`, `title`, `active`, and `windowId`.

### tabs:reload

Runs in the background service worker.

```bash
curl -X POST http://127.0.0.1:8787/command \
  -H "content-type: application/json" \
  -d '{"target":"background","command":"tabs:reload","payload":{"bypassCache":true}}'
```

Payload:

- `tabId`: optional tab id; defaults to the active tab.
- `bypassCache`: optional boolean.

### dom:query

Runs in a connected extension client such as `content`, `popup`, or `options`. It queries CSS selectors without using `eval`.

```bash
curl -X POST http://127.0.0.1:8787/command \
  -H "content-type: application/json" \
  -d '{"target":"content","command":"dom:query","payload":{"selectors":{"css":"link[href*=\"baidu/search.css\"]","right":"#content_right","ai":".ai-entry"},"include":["count","exists","visible","display","text","rect","computedStyle"]}}'
```

Payload:

- `selectors`: object mapping names to CSS selectors, max 50 selectors.
- `include`: optional list of fields: `exists`, `visible`, `display`, `visibility`, `text`, `href`, `src`, `count`, `node`, `attributes`, `dataset`, `rect`, `box`, `computedStyle`, `outerHTML`, `children`, `cssPath`.
- `limitText`: text truncation length, defaults to 160 and maxes at 1000.
- `limitHtml`: `outerHTML` truncation length, defaults to 2000 and maxes at 10000.
- `childrenLimit`: direct child summary limit, defaults to 20 and maxes at 100.
- `computedStyle`: optional CSS property list for `computedStyle`, max 80 properties. Property names can be kebab-case or camelCase.

Popup example with layout and style details:

```bash
curl -X POST http://127.0.0.1:8787/command \
  -H "content-type: application/json" \
  -d '{"target":"popup","command":"dom:query","payload":{"selectors":{"root":"#root","primary":"button"},"include":["count","node","attributes","dataset","visible","rect","box","computedStyle","children","cssPath"],"computedStyle":["display","position","width","height","margin","padding","color","backgroundColor","fontSize","zIndex"],"childrenLimit":10}}'
```

The popup must be open while running the command. Check `clients.popup` from `/health` before querying popup DOM.

## Legacy Execute API

`POST /execute` is kept for compatibility with the existing debug page. It evaluates JavaScript in the requested target and can be blocked by CSP. Prefer `/command` for reliable debugging.

## Reload API

`POST /reload` supports:

- `target: "extension"`
- `target: "clients"`
- `target: "tabs"`

Use this for development reload flows. The command API is for debugging state and DOM, not replacing reload behavior.

## Safety

- Keep the service bound to `127.0.0.1` unless there is a specific local-network debugging need.
- Do not add module-specific commands such as `baidu:*` or `bilibili:*`.
- Do not add arbitrary runtime message forwarding or DOM interaction commands without a separate design review.
- Prefer small, generic primitives that can be composed by scripts or agents using `curl`.
