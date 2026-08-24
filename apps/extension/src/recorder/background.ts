import {
  addHistoryItem,
  buildHistoryName,
  deleteHistoryItem,
  getHistory,
  getSessionTask,
  renameHistoryItem,
  setSessionTask
} from "@/recorder/storage"
import type { RecorderStep, RecorderTask } from "@/recorder/types"
import type {
  RecorderCommandMessage,
  RecorderEventMessage,
  RecorderReplayStepMessage,
  RecorderReplayStepResponse,
  RecorderStateMessage,
  RecorderSubscribeMessage
} from "@/recorder/messages"

function randomId(): string {
  return Math.random().toString(36).slice(2)
}

function taskDomain(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function isRecorderEnabled(options: unknown): boolean {
  return Boolean((options as { recorder?: { enabled?: unknown } } | undefined)?.recorder?.enabled)
}

let recorderEnabled: boolean | null = null
let taskMutationQueue = Promise.resolve()

async function getRecorderEnabled(): Promise<boolean> {
  if (recorderEnabled !== null) return recorderEnabled
  const { options } = await chrome.storage.local.get(["options"])
  recorderEnabled = isRecorderEnabled(options)
  return recorderEnabled
}

function runTaskMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const next = taskMutationQueue.then(
    () => mutation(),
    () => mutation()
  )
  taskMutationQueue = next.then(
    () => undefined,
    () => undefined
  )
  return next
}

async function stopTaskWhenDisabled(): Promise<void> {
  await runTaskMutation(async () => {
    const task = await getSessionTask()
    if (!task) return
    if (task.mode === "replay") {
      await setSessionTask(null)
    } else if (task.status !== "paused") {
      task.status = "paused"
      await setSessionTask(task)
    } else {
      return
    }
    await broadcastState()
  })
}

function canInjectRecorder(url?: string): boolean {
  if (!url) return false
  try {
    return ["http:", "https:", "file:", "ftp:"].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

function getRecorderScriptFiles(): { js: string; css?: string } | null {
  const entry = chrome.runtime.getManifest().content_scripts?.find(
    ({ js, matches }) => matches?.includes("<all_urls>") && js?.some((file) => file.includes("content.ts-loader"))
  )
  const js = entry?.js?.find((file) => file.includes("content.ts-loader"))
  if (!js) return null
  return { js, css: entry?.css?.[0] }
}

async function ensureActiveTabRecorder(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true, currentWindow: true })
  if (!tab?.id || !canInjectRecorder(tab.url)) return

  try {
    await chrome.tabs.sendMessage(tab.id, { target: "recorder-frame", type: "SYNC" }, { frameId: 0 })
  } catch {
    try {
      const files = getRecorderScriptFiles()
      if (!files) throw new Error("找不到录制脚本")
      const target = { tabId: tab.id, allFrames: true }
      if (files.css) await chrome.scripting.insertCSS({ target, files: [files.css] })
      await chrome.scripting.executeScript({ target, files: [files.js] })
    } catch {
      try {
        await chrome.tabs.reload(tab.id)
      } catch {
        // Browser-controlled pages cannot be injected or reloaded by the extension.
      }
    }
  }
}

async function broadcastState(subscribeTabId?: number): Promise<void> {
  const [task, history] = await Promise.all([getSessionTask(), getHistory()])
  const message: RecorderStateMessage = {
    target: "recorder-panel",
    type: "STATE",
    state: { enabled: true, task, history }
  }
  const targets = new Set<number>()
  if (task) targets.add(task.rootTabId)
  if (subscribeTabId !== undefined) targets.add(subscribeTabId)
  for (const tabId of targets) {
    chrome.tabs.sendMessage(tabId, message, { frameId: 0 }).catch(() => undefined)
  }
}

async function dispatchEvent(message: RecorderEventMessage, sender: chrome.runtime.MessageSender): Promise<void> {
  if (!(await getRecorderEnabled())) return
  await runTaskMutation(async () => {
    const task = await getSessionTask()
    if (!task || task.status !== "recording" || task.mode !== "record") return
    const frameId = sender.frameId ?? 0
    const tabId = sender.tab?.id ?? task.rootTabId
    const url = sender.tab?.url ?? task.rootUrl
    const base = { stepId: randomId(), tabId, frameId, url, capturedAt: Date.now() }
    let step: RecorderStep
    switch (message.event.kind) {
      case "click":
        step = { ...base, kind: "click", target: message.event.target, text: message.event.text }
        break
      case "input":
        step = { ...base, kind: "input", target: message.event.target, value: message.event.value }
        break
      case "scroll":
        step = {
          ...base,
          kind: "scroll",
          scrollTop: message.event.scrollTop,
          scrollLeft: message.event.scrollLeft,
          target: message.event.target
        }
        break
    }
    task.steps.push(step)
    await setSessionTask(task)
    await broadcastState(sender.tab?.id)
  })
}

async function sendToFrame(tabId: number, frameId: number, step: RecorderStep): Promise<RecorderReplayStepResponse> {
  const message: RecorderReplayStepMessage = { target: "recorder-frame", type: "EXECUTE", step }
  const response = await chrome.tabs.sendMessage(tabId, message, { frameId })
  return response as RecorderReplayStepResponse
}

function getReplayDelay(previous: RecorderStep | undefined, next: RecorderStep): number {
  if (!previous) return 0
  const delay = next.capturedAt - previous.capturedAt
  return Number.isFinite(delay) ? Math.max(0, delay) : 0
}

async function waitForReplayDelay(delayMs: number): Promise<void> {
  if (delayMs <= 0) return
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
}

async function advanceReplay(): Promise<void> {
  const first = await getSessionTask()
  if (!first || first.mode !== "replay" || first.status !== "replaying") return
  const taskId = first.taskId
  const runId = first.runId
  while (true) {
    const pending = await getSessionTask()
    if (!pending || pending.taskId !== taskId || pending.mode !== "replay" || pending.status !== "replaying" || pending.runId !== runId) return
    const nextStep = pending.steps[pending.currentStepIndex]
    if (nextStep) {
      await waitForReplayDelay(getReplayDelay(pending.steps[pending.currentStepIndex - 1], nextStep))
    }

    const scheduled = await runTaskMutation(async () => {
      const task = await getSessionTask()
      if (!task || task.taskId !== taskId || task.mode !== "replay" || task.status !== "replaying" || task.runId !== runId) return null
      const step = task.steps[task.currentStepIndex]
      if (!step) {
        await setSessionTask(null)
        await broadcastState(task.rootTabId)
        return null
      }
      // 调度前递增索引，标记已执行，避免暂停/恢复后重跑已发出的步骤
      task.currentStepIndex += 1
      await setSessionTask(task)
      return { step, tabId: task.rootTabId, frameId: step.frameId }
    })
    if (!scheduled) return

    const sent = { ...scheduled.step, tabId: scheduled.tabId, frameId: scheduled.frameId }
    let response: RecorderReplayStepResponse
    try {
      response = await sendToFrame(sent.tabId, sent.frameId, sent)
    } catch (error) {
      await runTaskMutation(async () => {
        const current = await getSessionTask()
        if (!current || current.taskId !== taskId || current.mode !== "replay" || current.status !== "replaying" || current.runId !== runId) return
        current.status = "paused"
        current.currentStepIndex -= 1
        current.error = error instanceof Error ? error.message : String(error)
        await setSessionTask(current)
        await broadcastState(current.rootTabId)
      })
      return
    }
    if (!response.ok) {
      await runTaskMutation(async () => {
        const current = await getSessionTask()
        if (!current || current.taskId !== taskId || current.mode !== "replay" || current.status !== "replaying" || current.runId !== runId) return
        current.status = "paused"
        current.currentStepIndex -= 1
        current.error = response.error
        await setSessionTask(current)
        await broadcastState(current.rootTabId)
      })
      return
    }
    const shouldContinue = await runTaskMutation(async () => {
      const current = await getSessionTask()
      if (!current || current.taskId !== taskId || current.mode !== "replay" || current.status !== "replaying" || current.runId !== runId) return false
      if (current.isStepMode) {
        if (current.currentStepIndex >= current.steps.length) {
          await setSessionTask(null)
          await broadcastState(current.rootTabId)
          return false
        }
        current.status = "paused"
        await setSessionTask(current)
        await broadcastState(current.rootTabId)
        return false
      }
      await broadcastState(current.rootTabId)
      return true
    })
    if (!shouldContinue) return
  }
}

async function startReplay(message: RecorderCommandMessage, sender: chrome.runtime.MessageSender): Promise<void> {
  const command = message.command
  if (command.name !== "replayAll" && command.name !== "replayStep") return
  const history = (await getHistory()).find((item) => item.id === command.historyId)
  if (!history) return

  let rootTabId: number
  let rootUrl: string
  if (command.inNewTab) {
    rootUrl = history.rootUrl
    const tab = await chrome.tabs.create({ url: rootUrl })
    rootTabId = tab.id ?? 0
    await new Promise<void>((resolve) => {
      const listener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
        if (tabId !== rootTabId || changeInfo.status !== "complete") return
        if (tab.url && taskDomain(tab.url) !== taskDomain(history.rootUrl)) return
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
      chrome.tabs.onUpdated.addListener(listener)
    })
  } else {
    rootTabId = sender.tab?.id ?? 0
    rootUrl = sender.tab?.url ?? ""
    if (taskDomain(rootUrl) !== history.rootDomain) {
      await broadcastState(sender.tab?.id)
      return
    }
  }

  const task: RecorderTask = {
    taskId: randomId(),
    mode: "replay",
    status: "replaying",
    runId: 1,
    rootTabId,
    rootUrl,
    steps: history.steps,
    currentStepIndex: 0,
    isStepMode: command.name === "replayStep"
  }
  const started = await runTaskMutation(async () => {
    if (await getSessionTask()) return false
    await setSessionTask(task)
    await broadcastState(sender.tab?.id)
    return true
  })
  if (started) await advanceReplay()
}

async function dispatchCommand(
  message: RecorderCommandMessage,
  sender: chrome.runtime.MessageSender
): Promise<void> {
  if (!(await getRecorderEnabled())) return
  const command = message.command
  switch (command.name) {
    case "startRecord": {
      await runTaskMutation(async () => {
        if (await getSessionTask()) return
        const task: RecorderTask = {
          taskId: randomId(),
          mode: "record",
          status: "recording",
          runId: 0,
          rootTabId: sender.tab?.id ?? 0,
          rootUrl: sender.tab?.url ?? "",
          steps: [],
          currentStepIndex: 0,
          isStepMode: false
        }
        await setSessionTask(task)
        await broadcastState(sender.tab?.id)
      })
      break
    }
    case "stopRecord": {
      await runTaskMutation(async () => {
        const task = await getSessionTask()
        if (!task || task.mode !== "record") {
          await broadcastState(sender.tab?.id)
          return
        }
        const item = {
          id: randomId(),
          name: buildHistoryName(task.rootUrl),
          rootUrl: task.rootUrl,
          rootDomain: taskDomain(task.rootUrl),
          steps: task.steps,
          createdAt: Date.now()
        }
        await addHistoryItem(item)
        await setSessionTask(null)
        await broadcastState(sender.tab?.id)
      })
      break
    }
    case "togglePause": {
      let resumeReplay = false
      await runTaskMutation(async () => {
        const task = await getSessionTask()
        if (!task) {
          await broadcastState(sender.tab?.id)
          return
        }
        if (task.status === "paused") {
          task.status = task.mode === "record" ? "recording" : "replaying"
          if (task.mode === "replay") {
            task.runId += 1
            resumeReplay = true
          }
        } else {
          task.status = "paused"
        }
        await setSessionTask(task)
        await broadcastState(sender.tab?.id)
      })
      if (resumeReplay) await advanceReplay()
      break
    }
    case "nextReplayStep": {
      let advanceStep = false
      await runTaskMutation(async () => {
        const task = await getSessionTask()
        if (!task || task.mode !== "replay" || task.status !== "paused") {
          await broadcastState(sender.tab?.id)
          return
        }
        task.status = "replaying"
        task.runId += 1
        await setSessionTask(task)
        await broadcastState(sender.tab?.id)
        advanceStep = true
      })
      if (advanceStep) await advanceReplay()
      break
    }
    case "stopReplay":
      await runTaskMutation(async () => {
        await setSessionTask(null)
        await broadcastState(sender.tab?.id)
      })
      break
    case "replayAll":
    case "replayStep":
      await startReplay(message, sender)
      break
    case "renameHistory":
      await renameHistoryItem(command.historyId, command.newName)
      await broadcastState(sender.tab?.id)
      break
    case "deleteHistory":
      await deleteHistoryItem(command.historyId)
      await broadcastState(sender.tab?.id)
      break
  }
}

export function registerRecorderBackground(): void {
  void getRecorderEnabled().then((enabled) => {
    if (!enabled) void stopTaskWhenDisabled()
    else void ensureActiveTabRecorder()
  })
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.options) {
      const wasEnabled = recorderEnabled
      recorderEnabled = isRecorderEnabled(changes.options.newValue)
      if (!recorderEnabled) void stopTaskWhenDisabled()
      else if (!wasEnabled) void ensureActiveTabRecorder()
    }
  })
  chrome.runtime.onMessage.addListener(
    (message: RecorderEventMessage | RecorderCommandMessage | RecorderSubscribeMessage, sender) => {
      if (message?.target !== "recorder") return
      switch (message.type) {
        case "EVENT":
          void dispatchEvent(message, sender)
          break
        case "COMMAND":
          void dispatchCommand(message, sender)
          break
        case "SUBSCRIBE":
          void broadcastState(sender.tab?.id)
          break
      }
    }
  )
}
