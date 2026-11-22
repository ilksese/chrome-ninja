const devBridgePort = import.meta.env.VITE_CHROME_NINJA_DEV_BRIDGE_PORT || "8787"
export const DEV_BRIDGE_HEALTH_URLS = [
  `https://127.0.0.1:${devBridgePort}/health`,
  `http://127.0.0.1:${devBridgePort}/health`
]
export const DEV_BRIDGE_EXECUTE_TIMEOUT_MS = 10000
export const DEV_BRIDGE_ENABLED = import.meta.env.DEV || import.meta.env.VITE_CHROME_NINJA_DEV_BRIDGE === "true"
