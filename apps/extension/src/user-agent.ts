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

export async function applyUserAgentRule(value: UserAgentType) {
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
