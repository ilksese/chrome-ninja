import { getHmrErrorMessage, HMR_CLIENT_PORT_PREFIX, HMR_ENABLED, normalizeHmrResult, type HmrClientScope, type HmrExecuteJsMessage, type HmrReloadClientMessage } from "./protocol"

export function connectHmrClient(scope: HmrClientScope) {
  if (!HMR_ENABLED) return
  if (typeof chrome === "undefined" || !chrome.runtime?.connect) return

  let reconnectTimer: ReturnType<typeof globalThis.setTimeout> | undefined

  const connect = () => {
    let port: chrome.runtime.Port
    try {
      port = chrome.runtime.connect({ name: `${HMR_CLIENT_PORT_PREFIX}${scope}` })
    } catch {
      reconnectTimer = globalThis.setTimeout(connect, 1000)
      return
    }

		port.postMessage({ type: "hmr:client:hello", scope })
		port.onMessage.addListener((message: unknown) => {
			if (isReloadClientMessage(message, scope)) {
				reloadClient()
				return
			}
			if (isExecuteMessage(message)) void executeCode(port, scope, message)
		})
    port.onDisconnect.addListener(() => {
      reconnectTimer = globalThis.setTimeout(connect, 1000)
    })
  }

  connect()

  return () => {
    if (reconnectTimer !== undefined) globalThis.clearTimeout(reconnectTimer)
  }
}

async function executeCode(port: chrome.runtime.Port, scope: HmrClientScope, message: HmrExecuteJsMessage) {
  try {
    const result = await Promise.resolve(globalThis.eval(message.code))
    postResult(port, {
      type: "hmr:client:execute-result",
      requestId: message.requestId,
      scope,
      ok: true,
      result: normalizeHmrResult(result)
    })
  } catch (error) {
    postResult(port, {
      type: "hmr:client:execute-result",
      requestId: message.requestId,
      scope,
      ok: false,
      error: getHmrErrorMessage(error)
    })
  }
}

function postResult(port: chrome.runtime.Port, message: unknown) {
  try {
    port.postMessage(message)
  } catch {
    // The background port can disappear while a script is running.
  }
}

function reloadClient() {
  globalThis.setTimeout(() => {
    globalThis.location.reload()
  }, 0)
}

function isReloadClientMessage(message: unknown, scope: HmrClientScope): message is HmrReloadClientMessage {
  if (!message || typeof message !== "object") return false
  const candidate = message as Partial<HmrReloadClientMessage>
  return candidate.type === "hmr:reload-client" && (!Array.isArray(candidate.scopes) || candidate.scopes.includes(scope))
}

function isExecuteMessage(message: unknown): message is HmrExecuteJsMessage {
  if (!message || typeof message !== "object") return false
  const candidate = message as Partial<HmrExecuteJsMessage>
  return candidate.type === "hmr:execute-js" && typeof candidate.requestId === "string" && typeof candidate.code === "string"
}
