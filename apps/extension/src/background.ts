// POC background service worker. Deliberately tiny — it exists to seed the
// Stage B pattern: MV3 workers are ephemeral (killed after ~30s idle), so any
// run state must live in chrome.storage and survive resurrection. Here that's
// just a per-tab page-load counter the panel displays.

chrome.runtime.onInstalled.addListener(() => {
  console.log("ApplyAssistUI POC installed");
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "hello" && sender.tab?.id != null) {
    const key = `loads-${sender.tab.id}`;
    chrome.storage.session.get(key).then((data) => {
      const count = ((data[key] as number) ?? 0) + 1;
      chrome.storage.session.set({ [key]: count });
      sendResponse({ count });
    });
    return true; // async response
  }
  return false;
});
