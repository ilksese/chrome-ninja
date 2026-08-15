import { spawn } from "node:child_process"
import { watch } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url))
const extensionRoot = fileURLToPath(new URL("..", import.meta.url))
const srcRoot = fileURLToPath(new URL("../src", import.meta.url))
const isWindows = process.platform === "win32"
const pnpm = isWindows ? "pnpm.cmd" : "pnpm"
const hmrPort = process.env.PORT || "8787"
const reloadUrls = process.env.CHROME_NINJA_HMR_RELOAD_URL ? [process.env.CHROME_NINJA_HMR_RELOAD_URL] : [`https://127.0.0.1:${hmrPort}/reload`, `http://127.0.0.1:${hmrPort}/reload`]
const allContentScriptMatches = ["*://*/*"]
const bossContentScriptMatches = ["*://*.zhipin.com/*", "*://*.bosszhipin.com/*"]

let shuttingDown = false
let exitCode = 0
let closedCount = 0
let buildOutput = ""
let reloadTimer
let pendingReloadAction
let watchersClosed = false
const pendingChangedFiles = new Set()
const watchers = startChangeWatchers()

const children = [
  start("hmr", ["--filter", "@chrome-ninja/hmr", "dev"]),
  start("extension", ["--filter", "@chrome-ninja/extension", "dev:build"], {
    env: { VITE_CHROME_NINJA_HMR: "true" },
    onStdout: observeExtensionBuildOutput,
    onStderr: observeExtensionBuildOutput
  })
]

for (const child of children) {
	child.process.on("exit", (code, signal) => {
		closedCount += 1
		if (!shuttingDown) {
			shuttingDown = true
			exitCode = code ?? (signal ? 1 : 0)
			closeWatchers()
			stopChildren(child.name)
		}

    if (closedCount === children.length) {
      process.exit(exitCode)
    }
  })
}

process.on("SIGINT", () => shutdown(130))
process.on("SIGTERM", () => shutdown(143))

function start(name, args, options = {}) {
  const command = isWindows ? process.env.ComSpec || "cmd.exe" : pnpm
  const commandArgs = isWindows ? ["/d", "/s", "/c", pnpm, ...args] : args
  const shouldPipeOutput = options.onStdout || options.onStderr
  const child = spawn(command, commandArgs, {
    cwd: repoRoot,
    env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR || "1", ...options.env },
    stdio: shouldPipeOutput ? ["ignore", "pipe", "pipe"] : "inherit"
  })

  child.stdout?.on("data", (chunk) => {
    process.stdout.write(chunk)
    options.onStdout?.(chunk)
  })
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(chunk)
    options.onStderr?.(chunk)
  })

  child.on("error", (error) => {
    console.error(`[dev:${name}] failed to start`, error)
    shutdown(1)
  })

  return { name, process: child }
}

function shutdown(code) {
  if (shuttingDown) return
	shuttingDown = true
	exitCode = code
	if (reloadTimer !== undefined) globalThis.clearTimeout(reloadTimer)
	closeWatchers()
	stopChildren()
}

function observeExtensionBuildOutput(chunk) {
	buildOutput = `${buildOutput}${chunk.toString("utf8")}`
	if (buildOutput.length > 8192) buildOutput = buildOutput.slice(-8192)
	if (!buildOutput.includes("built in")) return

	const reloadAction = classifyChangedFiles()
	pendingChangedFiles.clear()
	buildOutput = ""
	scheduleReload(reloadAction)
}

function scheduleReload(action) {
	if (shuttingDown) return
	pendingReloadAction = mergeReloadActions(pendingReloadAction, action)
	if (reloadTimer !== undefined) globalThis.clearTimeout(reloadTimer)
	reloadTimer = globalThis.setTimeout(() => {
		const actionToSend = pendingReloadAction || { target: "extension", reason: "build" }
		pendingReloadAction = undefined
		reloadTimer = undefined
		void requestReload(actionToSend)
	}, 300)
}

async function requestReload(action) {
	for (const url of reloadUrls) {
		try {
			const response = await fetch(url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(action)
			})
			if (!response.ok) continue
			console.log(`[dev:extension] requested ${describeReloadAction(action)}`)
			return
		} catch {
			// Try the next local HMR URL.
		}
	}
}

function classifyChangedFiles() {
	const files = [...pendingChangedFiles].map(toExtensionRelativePath).filter(Boolean)
	if (files.length === 0) return { target: "extension", reason: "initial-build" }

	let clientScopes = new Set()
	let tabMatches = new Set()

	for (const file of files) {
		const action = classifyChangedFile(file)
		if (action.target === "extension") return { target: "extension", reason: `changed:${file}` }

		if (action.target === "clients") {
			for (const scope of action.scopes) clientScopes.add(scope)
			continue
		}

		if (action.target === "tabs") {
			for (const match of action.matches) tabMatches.add(match)
		}
	}

	if (clientScopes.size > 0 && tabMatches.size > 0) return { target: "extension", reason: "mixed-client-and-tab-change" }
	if (tabMatches.size > 0) return { target: "tabs", matches: [...tabMatches], reason: "content-script-change" }
	if (clientScopes.size > 0) return { target: "clients", scopes: [...clientScopes], reason: "ui-change" }

	return { target: "extension", reason: "unknown-change" }
}

function classifyChangedFile(file) {
	if (isExtensionReloadFile(file)) return { target: "extension" }

	if (file === "index.html" || file === "src/popup.tsx") return { target: "clients", scopes: ["popup"] }
	if (file === "src/options/index.html" || file === "src/options.tsx") return { target: "clients", scopes: ["options"] }

	if (file.startsWith("src/content-script/")) return { target: "tabs", matches: allContentScriptMatches }
	if (file === "src/user-agent/boss-loader.ts" || file === "src/user-agent/boss-anti-detection.js") return { target: "tabs", matches: bossContentScriptMatches }

	if (isUiOnlyFile(file)) return { target: "clients", scopes: ["popup", "options"] }

	return { target: "extension" }
}

function isExtensionReloadFile(file) {
	return (
		file === "manifest.config.ts" ||
		file === "vite.config.ts" ||
		file === "package.json" ||
		file.startsWith("tsconfig") ||
		file.startsWith("src/background/") ||
		file === "src/hmr/background.ts" ||
		file === "src/hmr/protocol.ts" ||
		file.startsWith("src/store/") ||
		file === "src/user-agent/index.ts" ||
		file === "src/user-agent/boss-navigation.ts" ||
		file.startsWith("src/assets/")
	)
}

function isUiOnlyFile(file) {
	return (
		file === "src/App.tsx" ||
		file === "src/index.css" ||
		file === "src/types.ts" ||
		file.startsWith("src/pages/") ||
		file.startsWith("src/components/") ||
		file.startsWith("src/hooks/")
	)
}

function mergeReloadActions(current, next) {
	if (!current) return next
	if (current.target === "extension" || next.target === "extension") return { target: "extension", reason: "merged-extension-change" }
	if (current.target !== next.target) return { target: "extension", reason: "merged-mixed-change" }

	if (current.target === "clients") {
		return { target: "clients", scopes: [...new Set([...(current.scopes || []), ...(next.scopes || [])])], reason: "merged-ui-change" }
	}

	return { target: "tabs", matches: [...new Set([...(current.matches || []), ...(next.matches || [])])], reason: "merged-content-script-change" }
}

function describeReloadAction(action) {
	if (action.target === "clients") return `client reload (${(action.scopes || []).join(",") || "all"})`
	if (action.target === "tabs") return `tab reload (${(action.matches || []).join(",") || "all"})`
	return "extension reload"
}

function startChangeWatchers() {
	const activeWatchers = []
	watchPath(srcRoot, { recursive: true }, activeWatchers, true)
	for (const file of ["index.html", "manifest.config.ts", "vite.config.ts", "package.json", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json"]) {
		watchPath(join(extensionRoot, file), {}, activeWatchers)
	}
	return activeWatchers
}

function watchPath(path, options, activeWatchers, isDirectory = false) {
	try {
		const watcher = watch(path, options, (_event, filename) => {
			recordChangedFile(isDirectory && filename ? join(path, filename.toString()) : path)
		})
		activeWatchers.push(watcher)
	} catch (error) {
		console.warn(`[dev:extension] failed to watch ${path}`, error)
	}
}

function recordChangedFile(file) {
	pendingChangedFiles.add(file)
}

function toExtensionRelativePath(file) {
	const relativePath = relative(extensionRoot, file).replace(/\\/g, "/")
	return relativePath.startsWith("..") || relativePath === "" ? undefined : relativePath
}

function closeWatchers() {
	if (watchersClosed) return
	watchersClosed = true
	for (const watcher of watchers) watcher.close()
}

function stopChildren(exceptName) {
  for (const child of children) {
    if (child.name === exceptName || child.process.killed || child.process.exitCode !== null) continue
    stopProcess(child.process)
  }
}

function stopProcess(child) {
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" })
    return
  }

  child.kill("SIGTERM")
}
