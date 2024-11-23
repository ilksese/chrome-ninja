console.log("background runing")

chrome.runtime.onMessage.addListener(handleMessages)

async function handleMessages(message: any) {
  // Return early if this message isn't meant for the background script
  if (message.target !== "background") {
    return
  }

  // Dispatch the message to an appropriate handler.
  switch (message.type) {
    case "executeScript":
      chrome.tabs.query({ active: true, lastFocusedWindow: true, currentWindow: true }).then(([tab]) => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          files: message.files,
          func: message.func
        })
      })
      break
    default:
      console.warn(`Unexpected message type received: '${message.type}'.`)
  }
}
