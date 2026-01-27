const requestChat = async (serverUrl, payload) => {
  const response = await fetch(`${serverUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Server error.");
  }

  return response.json();
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "hwc-chat-request") {
    return false;
  }

  const { serverUrl, payload } = message;

  (async () => {
    try {
      const data = await requestChat(serverUrl, payload);
      sendResponse({ ok: true, data });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unable to reach server.",
      });
    }
  })();

  return true;
});
