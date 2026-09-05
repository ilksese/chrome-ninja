import fs from "fs/promises"
import { env } from "node:process"
import path from "path"
import type { ManifestV3Export } from "@crxjs/vite-plugin"
import packageJson from "./package.json"

const { version, name, description, displayName } = packageJson
// Convert from Semver (example: 0.1.0-beta6)
const [major, minor, patch, label = "0"] = version
  // can only contain digits, dots, or dash
  .replace(/[^\d.-]+/g, "")
  // split into version parts
  .split(/[.-]/)

async function getAllFiles(dirPath: string, fileList: string[] = []) {
  const files = await fs.readdir(dirPath)

  for (const file of files) {
    const filePath = path.join(dirPath, file)
    const stats = await fs.stat(filePath)
    if (stats.isDirectory()) {
      fileList.push(...(await getAllFiles(filePath)))
    } else {
      fileList.push(filePath.replace(/\\/g, "/"))
    }
  }

  return fileList
}

const contentScriptFiles = async () => {
  return await getAllFiles("src/content-script")
}

const recorderScriptFiles = async () => {
  return await getAllFiles("src/recorder").then((files) =>
    files.filter((file) => file.endsWith(".css") || file.endsWith(".js"))
  )
}

export default {
  name: env.mode === "staging" ? `[INTERNAL] ${name}` : displayName || name,
  description,
  // up to four numbers separated by dots
  version: `${major}.${minor}.${patch}.${label}`,
  // semver is OK in "version_name"
  version_name: version,
  manifest_version: 3,
  // key: '',
  action: {
    default_popup: "index.html",
    default_icon: {
      16: "src/assets/xslogo.png",
      24: "src/assets/smlogo.png",
      32: "src/assets/mdlogo.png",
      128: "src/assets/lglogo.png"
    }
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module"
  },
  content_scripts: [
    {
      all_frames: true,
      js: ["src/user-agent/boss-loader.ts"],
      match_about_blank: true,
      match_origin_as_fallback: true,
      matches: ["*://*.zhipin.com/*", "*://*.bosszhipin.com/*"],
      run_at: "document_start"
    },
    {
      all_frames: false,
      js: ["src/content-script/index.ts"],
      matches: ["*://*/*"],
      run_at: "document_end"
    },
    {
      all_frames: true,
      js: ["src/video-sniffer/content.ts"],
      match_about_blank: true,
      match_origin_as_fallback: true,
      matches: ["<all_urls>"],
      run_at: "document_idle"
    },
    {
      all_frames: true,
      js: ["src/content-script/translate/index.ts"],
      matches: ["*://*/*"],
      run_at: "document_end"
    },
    {
      all_frames: true,
      js: ["src/recorder/content.ts"],
      match_about_blank: true,
      match_origin_as_fallback: true,
      matches: ["<all_urls>"],
      run_at: "document_idle"
    }
  ],
  // Full options page
  options_page: "src/options/index.html",
  // Embedded options page
  options_ui: {
    page: "src/options/index.html"
  },
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'; connect-src 'self' http: https: ws: wss:"
  },
  offline_enabled: true,
  host_permissions: ["<all_urls>"],
  permissions: ["contextMenus", "storage", "tabs", "background", "scripting", "activeTab", "declarativeNetRequest", "webNavigation", "cookies", "downloads", "webRequest", "clipboardWrite"],
  web_accessible_resources: [
    {
      matches: ["<all_urls>"],
      resources: [...(await contentScriptFiles()), ...(await recorderScriptFiles()), "src/user-agent/boss-anti-detection.js"]
    }
  ],
  icons: {
    16: "src/assets/xslogo.png",
    24: "src/assets/smlogo.png",
    32: "src/assets/mdlogo.png",
    128: "src/assets/lglogo.png"
  }
} as ManifestV3Export
