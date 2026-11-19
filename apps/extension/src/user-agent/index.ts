import type { UserAgentType } from "@/types"

export const USER_AGENT_RULE_ID = 1001

export const USER_AGENT_OPTIONS: Array<{ label: string; value: UserAgentType; ua: string }> = [
  {
    label: "默认",
    value: "default",
    ua: ""
  },
  {
    label: "Chrome Desktop",
    value: "chrome-desktop",
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
  },
  {
    label: "Chrome Android",
    value: "chrome-android",
    ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36"
  },
  {
    label: "Safira Desktop",
    value: "safira-desktop",
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
  },
  {
    label: "Safira IOS",
    value: "safira-ios",
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
  }
]

export function getUserAgentOption(value: UserAgentType) {
  return USER_AGENT_OPTIONS.find((option) => option.value === value) ?? USER_AGENT_OPTIONS[0]
}

/**
 * 浏览器预设在单标签页上模拟具体 UA 期间，全局改写必须让位：两者同时生效会给同一请求
 * 产生互相矛盾的 User-Agent。这里按「正在模拟的标签页数」计数，只有归零时才恢复。
 */
let suspensionCount = 0

/** 用户最近一次选择的全局 UA。暂停期间照常记录，恢复时按最新意图下发，不丢用户的改动。 */
let requestedUserAgent: UserAgentType | null = null

/**
 * 暂停全局改写并立即移除现有规则。全局设置的变更监听照常调用 `applyUserAgentRule`，
 * 它会把新选择记下来但不写规则，因此不会被这次暂停覆盖掉。
 */
export async function suspendUserAgentRule() {
  suspensionCount += 1
  if (suspensionCount > 1) return
  await writeUserAgentRule("default")
}

/** 恢复全局改写：计数归零后按用户最新的选择重新下发规则。 */
export async function resumeUserAgentRule() {
  suspensionCount = Math.max(0, suspensionCount - 1)
  if (suspensionCount > 0 || requestedUserAgent === null) return
  await writeUserAgentRule(requestedUserAgent)
}

export async function applyUserAgentRule(value: UserAgentType) {
  requestedUserAgent = value
  // 让位给标签页级模拟：只记住意图，规则由 `resumeUserAgentRule` 在退出后补发。
  if (suspensionCount > 0) return
  await writeUserAgentRule(value)
}

async function writeUserAgentRule(value: UserAgentType) {
  const option = getUserAgentOption(value)

  if (option.value === "default") {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [USER_AGENT_RULE_ID]
    })
    return
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [USER_AGENT_RULE_ID],
    addRules: [
      {
        id: USER_AGENT_RULE_ID,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders: [
            {
              header: "User-Agent",
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: option.ua
            }
          ]
        },
        condition: {
          urlFilter: "|http",
          resourceTypes: [
            chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
            chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
            chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
            chrome.declarativeNetRequest.ResourceType.SCRIPT,
            chrome.declarativeNetRequest.ResourceType.IMAGE,
            chrome.declarativeNetRequest.ResourceType.STYLESHEET,
            chrome.declarativeNetRequest.ResourceType.FONT,
            chrome.declarativeNetRequest.ResourceType.MEDIA,
            chrome.declarativeNetRequest.ResourceType.WEBSOCKET,
            chrome.declarativeNetRequest.ResourceType.OTHER
          ]
        }
      }
    ]
  })
}
