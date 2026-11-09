import { fileURLToPath } from "node:url"
import preact from "@preact/preset-vite"
import { defineConfig } from "vitest/config"

const extensionSrc = fileURLToPath(new URL("./apps/extension/src", import.meta.url))
const webSrc = fileURLToPath(new URL("./apps/web/src", import.meta.url))

// Keep CRX, manifest scanning and development HMR out of the test process.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "packages",
          environment: "node",
          include: ["packages/**/*.test.ts"],
          restoreMocks: true
        }
      },
      {
        plugins: [preact()],
        resolve: {
          alias: {
            "@": extensionSrc,
            "@assets": `${extensionSrc}/assets`,
            "@components": `${extensionSrc}/components`,
            "@hooks": `${extensionSrc}/hooks`,
            "@store": `${extensionSrc}/store`
          }
        },
        test: {
          name: "extension",
          environment: "node",
          server: { deps: { inline: ["jotai"] } },
          include: ["apps/extension/tests/**/*.test.ts"],
          restoreMocks: true,
          unstubGlobals: true
        }
      },
      {
        plugins: [preact()],
        resolve: {
          alias: {
            "@": extensionSrc,
            "@assets": `${extensionSrc}/assets`,
            "@components": `${extensionSrc}/components`,
            "@hooks": `${extensionSrc}/hooks`,
            "@store": `${extensionSrc}/store`
          }
        },
        test: {
          name: "extension-ui",
          environment: "jsdom",
          server: { deps: { inline: ["jotai"] } },
          include: ["apps/extension/tests/**/*.test.tsx"],
          setupFiles: ["./tests/setup-dom.ts"],
          restoreMocks: true,
          unstubGlobals: true
        }
      },
      {
        plugins: [preact()],
        resolve: { alias: { "@": webSrc } },
        test: {
          name: "web",
          environment: "jsdom",
          include: ["apps/web/tests/**/*.test.{ts,tsx}"],
          setupFiles: ["./tests/setup-dom.ts"],
          restoreMocks: true,
          unstubGlobals: true
        }
      }
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,mjs}"],
      exclude: ["**/*.d.ts"]
    }
  }
})
