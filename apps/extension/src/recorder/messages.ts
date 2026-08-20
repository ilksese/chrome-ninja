import type { RecorderHistoryItem, RecorderLocator, RecorderStep, RecorderTask } from "./types"

export const PANEL_HOST_ATTR = "data-recorder-panel"
export const PANEL_HOST_SELECTOR = `[${PANEL_HOST_ATTR}]`

export type CapturedEvent =
  | { kind: "click"; target: RecorderLocator; text?: string }
  | { kind: "input"; target: RecorderLocator; value: string }
  | { kind: "scroll"; scrollTop: number; scrollLeft: number; target?: RecorderLocator }

export type RecorderCommand =
  | { name: "startRecord" }
  | { name: "stopRecord" }
  | { name: "togglePause" }
  | { name: "stopReplay" }
  | { name: "nextReplayStep" }
  | { name: "replayAll"; historyId: string; inNewTab: boolean }
  | { name: "replayStep"; historyId: string; inNewTab: boolean }
  | { name: "renameHistory"; historyId: string; newName: string }
  | { name: "deleteHistory"; historyId: string }

export type RecorderViewState = {
  enabled: boolean
  task: RecorderTask | null
  history: RecorderHistoryItem[]
}

export type RecorderEventMessage = {
  target: "recorder"
  type: "EVENT"
  event: CapturedEvent
}

export type RecorderCommandMessage = {
  target: "recorder"
  type: "COMMAND"
  command: RecorderCommand
}

export type RecorderReplayStepMessage = {
  target: "recorder-frame"
  type: "EXECUTE"
  step: RecorderStep
}

export type RecorderReplayStepResponse = { ok: true } | { ok: false; error: string }

export type RecorderStateMessage = {
  target: "recorder-panel"
  type: "STATE"
  state: RecorderViewState
}

export type RecorderSubscribeMessage = {
  target: "recorder"
  type: "SUBSCRIBE"
}
