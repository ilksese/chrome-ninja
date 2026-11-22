/// <reference types="vite/client" />
/// <reference types="@crxjs/vite-plugin/client" />
/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
  readonly VITE_CHROME_NINJA_DEV_BRIDGE?: string
  readonly VITE_CHROME_NINJA_DEV_BRIDGE_PORT?: string
  readonly VITE_CHROME_NINJA_PAGE_CONTROL_PORT?: string
}
