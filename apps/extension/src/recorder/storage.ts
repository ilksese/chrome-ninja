import type { RecorderHistoryItem, RecorderTask } from "./types"

export const HISTORY_LIMIT = 20
export const REPLAY_WAIT_MS = 5000

const SESSION_TASK_KEY = "recorder:task"
const LOCAL_HISTORY_KEY = "recorder:history"

export async function getSessionTask(): Promise<RecorderTask | null> {
  const res = await chrome.storage.session.get([SESSION_TASK_KEY])
  return (res[SESSION_TASK_KEY] as RecorderTask | undefined) ?? null
}

export async function setSessionTask(task: RecorderTask | null): Promise<void> {
  await chrome.storage.session.set({ [SESSION_TASK_KEY]: task })
}

export async function getHistory(): Promise<RecorderHistoryItem[]> {
  const res = await chrome.storage.local.get([LOCAL_HISTORY_KEY])
  return (res[LOCAL_HISTORY_KEY] as RecorderHistoryItem[] | undefined) ?? []
}

async function setHistory(items: RecorderHistoryItem[]): Promise<void> {
  await chrome.storage.local.set({ [LOCAL_HISTORY_KEY]: items })
}

export async function addHistoryItem(item: RecorderHistoryItem): Promise<void> {
  const items = await getHistory()
  await setHistory([item, ...items].slice(0, HISTORY_LIMIT))
}

export async function renameHistoryItem(historyId: string, newName: string): Promise<void> {
  const items = await getHistory()
  await setHistory(items.map((item) => (item.id === historyId ? { ...item, name: newName } : item)))
}

export async function deleteHistoryItem(historyId: string): Promise<void> {
  const items = await getHistory()
  await setHistory(items.filter((item) => item.id !== historyId))
}

export function buildHistoryName(rootUrl: string): string {
  let host = ""
  try {
    host = new URL(rootUrl).host
  } catch {
    host = rootUrl
  }
  const ts = new Date().toLocaleString("zh-CN", { hour12: false })
  return `${host} ${ts}`
}
