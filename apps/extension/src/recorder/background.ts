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
      step = { ...base, kind: "scroll", scrollTop: message.event.scrollTop, scrollLeft: message.event.scrollLeft, target: message.event.target }
      break
  }
  task.steps.push(step)
  await setSessionTask(task)
  await broadcastState()
}

async function sendToFrame(tabId: number, frameId: number, step: RecorderStep): Promise<RecorderReplayStepResponse> {
  const message: RecorderReplayStepMessage = { target: "recorder-frame", type: "EXECUTE", step }
  const response = await chrome.tabs.sendMessage(tabId, message, { frameId })
  return response as RecorderReplayStepResponse
}

async function advanceReplay(): Promise<void> {
  const first = await getSessionTask()
  if (!first || first.mode !== "replay" || first.status !== "replaying") return
  const runId = first.runId
  while (true) {
    const task = await getSessionTask()
    if (!task || task.mode !== "replay" || task.status !== "replaying" || task.runId !== runId) return
    const step = task.steps[task.currentStepIndex]
    if (!step) {
      await setSessionTask(null)
      await broadcastState()
      return
    }
    // 调度前递增索引，标记已执行，避免暂停/恢复后重跑已发出的步骤
    task.currentStepIndex += 1
    await setSessionTask(task)
    const sent = { ...step, tabId: task.rootTabId, frameId: step.frameId }
    let response: RecorderReplayStepResponse
    try {
      response = await sendToFrame(sent.tabId, sent.frameId, sent)
    } catch (error) {
      const current = await getSessionTask()
      if (!current || current.mode !== "replay" || current.status !== "replaying" || current.runId !== runId) return
      current.status = "paused"
      current.currentStepIndex -= 1
      current.error = error instanceof Error ? error.message : String(error)
      await setSessionTask(current)
      await broadcastState()
      return
    }
    if (!response.ok) {
      const current = await getSessionTask()
      if (!current || current.mode !== "replay" || current.status !== "replaying" || current.runId !== runId) return
      current.status = "paused"
      current.currentStepIndex -= 1
      current.error = response.error
      await setSessionTask(current)
      await broadcastState()
      return
    }
    const current = await getSessionTask()
    if (!current || current.mode !== "replay" || current.status !== "replaying" || current.runId !== runId) return
    if (current.isStepMode) {
      if (current.currentStepIndex >= current.steps.length) {
        await setSessionTask(null)
        await broadcastState()
        return
      }
      current.status = "paused"
      await setSessionTask(current)
      await broadcastState()
      return
    }
    await broadcastState()
  }
}

async function startReplay(message: RecorderCommandMessage, sender: chrome.runtime.MessageSender): Promise<void> {
  const command = message.command
  if (command.name !== "replayAll" && command.name !== "replayStep") return
  const history = (await getHistory()).find((item) => item.id === command.historyId)
  if (!history) return
  const existing = await getSessionTask()
  if (existing) return

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
  await setSessionTask(task)
  await broadcastState()
  await advanceReplay()
}

async function dispatchCommand(
  message: RecorderCommandMessage,
  sender: chrome.runtime.MessageSender
): Promise<void> {
  const command = message.command
  switch (command.name) {
    case "startRecord": {
      const existing = await getSessionTask()
      if (existing) return
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
      await broadcastState()
      break
    }
    case "stopRecord": {
      const task = await getSessionTask()
      if (!task || task.mode !== "record") return
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
      await broadcastState()
      break
    }
    case "togglePause": {
      const task = await getSessionTask()
      if (!task) return
      if (task.status === "paused") {
        task.status = task.mode === "record" ? "recording" : "replaying"
        if (task.mode === "replay") task.runId += 1
        await setSessionTask(task)
        await broadcastState()
        if (task.mode === "replay") await advanceReplay()
      } else {
        task.status = "paused"
        await setSessionTask(task)
        await broadcastState()
      }
      break
    }
    case "nextReplayStep": {
      const task = await getSessionTask()
      if (!task || task.mode !== "replay" || task.status !== "paused") return
      task.status = "replaying"
      task.runId += 1
      await setSessionTask(task)
      await broadcastState()
      await advanceReplay()
      break
    }
    case "stopReplay":
      await setSessionTask(null)
      await broadcastState()
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
