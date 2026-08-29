import { ninjaLog } from "@chrome-ninja/utils"
import { mergeOptions } from "@/store/options"
import { TRANSLATE_MAX_LENGTH } from "@/translate/constants"

type TranslateMessage =
  | {
      target: "translate"
      type: "TRANSLATE"
      text: string
    }
  | {
      target: "translate"
      type: "GET_MODELS"
      baseUrl: string
      apiKey: string
    }

type TranslateResponse = {
  ok: boolean
  data?: string
  truncated?: boolean
  error?: string
}

type GetModelsResponse = {
  ok: boolean
  models?: string[]
  error?: string
}

export function registerTranslateBackground(): void {
  chrome.runtime.onMessage.addListener((message: TranslateMessage, _sender, sendResponse) => {
    if (message?.target !== "translate") return
    if (message.type === "TRANSLATE") {
      void handleTranslate(message.text).then(sendResponse)
      return true
    }
    if (message.type === "GET_MODELS") {
      void handleGetModels(message.baseUrl, message.apiKey).then(sendResponse)
      return true
    }
  })
}

async function handleTranslate(text: string): Promise<TranslateResponse> {
  const { options } = await chrome.storage.local.get(["options"])
  const translate = mergeOptions(options).translate
  if (!translate.enabled) return { ok: false, error: "AI 翻译未开启" }
  if (!translate.apiKey) return { ok: false, error: "请先在插件弹窗配置 AI 接口" }

  const truncated = text.length > TRANSLATE_MAX_LENGTH
  const input = truncated ? text.slice(0, TRANSLATE_MAX_LENGTH) : text

  try {
    const baseUrl = translate.baseUrl.replace(/\/+$/, "")
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${translate.apiKey}`
      },
      body: JSON.stringify({
        model: translate.model,
        temperature: 0,
        messages: [{ role: "user", content: `请把以下文本翻译成${translate.targetLang}，只输出翻译结果，不要解释：\n${input}` }]
      })
    })
    if (!res.ok) return { ok: false, error: `接口请求失败（HTTP ${res.status}）` }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) return { ok: false, error: "接口返回为空" }
    return { ok: true, data: content, truncated }
  } catch (error) {
    ninjaLog("translate failed", error)
    return { ok: false, error: error instanceof Error ? error.message : "翻译请求失败" }
  }
}

async function handleGetModels(baseUrl: string, apiKey: string): Promise<GetModelsResponse> {
  const base = baseUrl.trim().replace(/\/+$/, "")
  if (!base || !apiKey.trim()) return { ok: false, error: "请先填写 Base URL 和 API Key" }
  try {
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey.trim()}` }
    })
    if (!res.ok) return { ok: false, error: `接口请求失败（HTTP ${res.status}）` }
    const data = (await res.json()) as { data?: { id?: string }[] }
    const models = Array.isArray(data.data)
      ? data.data.map((item) => item.id).filter((id): id is string => Boolean(id)).sort()
      : []
    if (models.length === 0) return { ok: false, error: "接口返回中没有模型列表" }
    return { ok: true, models }
  } catch (error) {
    ninjaLog("translate get models failed", error)
    return { ok: false, error: error instanceof Error ? error.message : "获取模型列表失败" }
  }
}
