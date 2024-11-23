import { fileURLToPath, URL } from "node:url"
import { crx } from "@crxjs/vite-plugin"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import Pages from "vite-plugin-pages"
import svgr from "vite-plugin-svgr"
import manifest from "./manifest.config"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    Pages(),
    svgr(),
    crx({
      manifest,
      contentScripts: {
        injectCss: true
      }
    })
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@assets": fileURLToPath(new URL("src/assets", import.meta.url)),
      "@components": fileURLToPath(new URL("src/components", import.meta.url)),
      "@lib": fileURLToPath(new URL("src/lib", import.meta.url)),
      "@hooks": fileURLToPath(new URL("src/hooks", import.meta.url)),
    }
  }
})
