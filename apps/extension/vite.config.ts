import { fileURLToPath, URL } from "node:url"
import { crx } from "@crxjs/vite-plugin"
import preact from "@preact/preset-vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import svgr from "vite-plugin-svgr"
import manifest from "./manifest.config"

const isHmrDevBuild = process.env.VITE_CHROME_NINJA_HMR === "true"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    preact(),
    tailwindcss(),
    svgr(),
    crx({
      manifest,
      contentScripts: {
        injectCss: true
      }
    })
  ],
  build: {
    emptyOutDir: !isHmrDevBuild,
    modulePreload: false,
    rollupOptions: {
      input: {
        qr: fileURLToPath(new URL("./src/qr/index.html", import.meta.url))
      }
    }
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@assets": fileURLToPath(new URL("src/assets", import.meta.url)),
      "@components": fileURLToPath(new URL("src/components", import.meta.url)),
      "@hooks": fileURLToPath(new URL("src/hooks", import.meta.url)),
      "@store": fileURLToPath(new URL("src/store", import.meta.url)),
    }
  }
})
