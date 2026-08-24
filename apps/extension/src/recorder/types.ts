export type RecorderLocator = {
  tag: string
  id?: string
  name?: string
  ariaLabel?: string
  role?: string
  text?: string
  css?: string
  path?: string
}

export type RecorderBaseStep = {
  stepId: string
  tabId: number
  frameId: number
  url: string
  capturedAt: number
}

export type RecorderStep =
  | (RecorderBaseStep & { kind: "click"; target: RecorderLocator; text?: string })
  | (RecorderBaseStep & { kind: "input"; target: RecorderLocator; value: string })
  | (RecorderBaseStep & { kind: "scroll"; scrollTop: number; scrollLeft: number; target?: RecorderLocator })

export type RecorderTaskMode = "record" | "replay"
export type RecorderTaskStatus = "paused" | "recording" | "replaying"

export type RecorderTask = {
  taskId: string
  mode: RecorderTaskMode
  status: RecorderTaskStatus
  runId: number
  rootTabId: number
  rootUrl: string
  steps: RecorderStep[]
  currentStepIndex: number
  isStepMode: boolean
  error?: string
}

export type RecorderHistoryItem = {
  id: string
  name: string
  rootUrl: string
  rootDomain: string
  steps: RecorderStep[]
  createdAt: number
}
