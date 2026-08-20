import { useEffect, useState } from "preact/hooks"
import type { RecorderCommand, RecorderViewState } from "./messages"

const EMPTY_STATE: RecorderViewState = { enabled: false, task: null, history: [] }

function sendCommand(command: RecorderCommand) {
  chrome.runtime.sendMessage({ target: "recorder", type: "COMMAND", command })
}

const STATUS_TEXT: Record<string, string> = {
  recording: "录制中",
  paused: "已暂停",
  replaying: "复现中"
}

function Panel() {
  const [view, setView] = useState<RecorderViewState>(EMPTY_STATE)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState("")

  useEffect(() => {
    chrome.runtime.sendMessage({ target: "recorder", type: "SUBSCRIBE" })
    const onMessage = (message: unknown) => {
      const msg = message as { target?: string; type?: string; state?: RecorderViewState }
      if (msg?.target === "recorder-panel" && msg.type === "STATE" && msg.state) {
        setView(msg.state)
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => chrome.runtime.onMessage.removeListener(onMessage)
  }, [])

  const { task, history } = view
  const active = task !== null

  const startRename = (historyId: string, current: string) => {
    setRenameId(historyId)
    setRenameName(current)
  }
  const submitRename = (historyId: string) => {
    const name = renameName.trim()
    if (name) {
      sendCommand({ name: "renameHistory", historyId, newName: name })
    }
    setRenameId(null)
    setRenameName("")
  }

  return (
    <div className="fixed right-4 top-4 z-[2147483647] flex w-[300px] max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[14px] border border-slate-200 bg-white text-sm leading-5 text-[#101828] shadow-[0_14px_34px_rgba(16,24,40,0.18)]">
      <div className="flex items-center justify-between border-b border-slate-200 bg-[linear-gradient(135deg,#101828,#123b66_62%,#0c5fb8)] px-4 py-3 text-white">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/62">recorder</span>
        <h2 className="text-base font-semibold leading-5">步骤记录器</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {active && (
          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {STATUS_TEXT[task.status] ?? task.status}
              </span>
              <span className="text-xs text-slate-500">
                步骤 {task.currentStepIndex}/{task.steps.length}
              </span>
            </div>
            {task.error && <p className="mb-2 text-xs text-red-600">{task.error}</p>}
            <div className="flex gap-2">
              {task.mode === "record" && (
                <>
                  <button
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 transition-all hover:bg-slate-100 active:bg-slate-200"
                    type="button"
                    onClick={() => sendCommand({ name: "togglePause" })}>
                    {task.status === "paused" ? "继续录制" : "暂停"}
                  </button>
                  <button
                    className="flex-1 rounded-lg bg-[#101828] px-3 py-1.5 text-sm font-semibold text-white transition-all hover:bg-[#1d2939] active:bg-[#344054]"
                    type="button"
                    onClick={() => sendCommand({ name: "stopRecord" })}>
                    停止录制
                  </button>
                </>
              )}
              {task.mode === "replay" && (
                <>
                  {task.status === "paused" ? (
                    <button
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 transition-all hover:bg-slate-100 active:bg-slate-200"
                      type="button"
                      onClick={() =>
                        sendCommand(task.isStepMode ? { name: "nextReplayStep" } : { name: "togglePause" })
                      }>
                      {task.isStepMode ? "下一步" : "继续"}
                    </button>
                  ) : (
                    <button
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 transition-all hover:bg-slate-100 active:bg-slate-200"
                      type="button"
                      onClick={() => sendCommand({ name: "togglePause" })}>
                      暂停
                    </button>
                  )}
                  <button
                    className="flex-1 rounded-lg bg-[#101828] px-3 py-1.5 text-sm font-semibold text-white transition-all hover:bg-[#1d2939] active:bg-[#344054]"
                    type="button"
                    onClick={() => sendCommand({ name: "stopReplay" })}>
                    停止复现
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {!active && (
          <button
            className="mb-3 w-full rounded-xl bg-[#101828] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#1d2939] active:bg-[#344054]"
            type="button"
            onClick={() => sendCommand({ name: "startRecord" })}>
            开始录制
          </button>
        )}

        {active && <p className="mb-2 text-xs text-slate-400">有活动任务，历史操作需先停止。</p>}

        {history.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#005bd1]">历史记录</p>
            {history.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                {renameId === item.id ? (
                  <div className="mb-2 flex items-center gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 outline-none focus:border-[#0077ff]"
                      type="text"
                      value={renameName}
                      onInput={(e) => setRenameName((e.target as HTMLInputElement).value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitRename(item.id)
                        if (e.key === "Escape") setRenameId(null)
                      }}
                    />
                    <button
                      className="rounded-lg bg-[#101828] px-2.5 py-1 text-xs font-semibold text-white"
                      type="button"
                      onClick={() => submitRename(item.id)}>
                      保存
                    </button>
                  </div>
                ) : (
                  <p className="mb-0.5 truncate text-sm font-semibold text-slate-900">{item.name}</p>
                )}
                <p className="mb-2 text-xs text-slate-500">{item.steps.length} 个步骤</p>
                <div className="flex gap-2">
                  <button
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900 transition-all hover:bg-slate-100 disabled:opacity-50"
                    type="button"
                    disabled={active}
                    onClick={() => sendCommand({ name: "replayAll", historyId: item.id, inNewTab: false })}>
                    复现
                  </button>
                  <button
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900 transition-all hover:bg-slate-100 disabled:opacity-50"
                    type="button"
                    disabled={active}
                    onClick={() => sendCommand({ name: "replayStep", historyId: item.id, inNewTab: false })}>
                    单步
                  </button>
                  <button
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900 transition-all hover:bg-slate-100 disabled:opacity-50"
                    type="button"
                    disabled={active}
                    onClick={() => startRename(item.id, item.name)}>
                    重命名
                  </button>
                  <button
                    className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-600 transition-all hover:bg-red-50"
                    type="button"
                    onClick={() => sendCommand({ name: "deleteHistory", historyId: item.id })}>
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Panel
