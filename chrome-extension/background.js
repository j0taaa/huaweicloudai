const requestChat = async (serverUrl, endpoint, payload) => {
  const response = await fetch(`${serverUrl}${endpoint}`, {
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

const streamChat = async (port, serverUrl, endpoint, payload) => {
  const controller = new AbortController();
  port.onDisconnect.addListener(() => {
    controller.abort();
  });

  try {
    const response = await fetch(`${serverUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      port.postMessage({ type: "error", error: errorText || "Server error." });
      port.disconnect();
      return;
    }

    if (!response.body) {
      port.postMessage({
        type: "error",
        error: "No response stream available.",
      });
      port.disconnect();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      port.postMessage({
        type: "chunk",
        chunk: decoder.decode(value, { stream: true }),
      });
    }

    port.postMessage({ type: "done" });
    port.disconnect();
  } catch (error) {
    if (controller.signal.aborted) {
      port.postMessage({ type: "error", error: "Request aborted." });
    } else {
      port.postMessage({
        type: "error",
        error: error instanceof Error ? error.message : "Stream failed.",
      });
    }
    port.disconnect();
  }
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "hwc-chat-request") {
    return false;
  }

  const { serverUrl, payload, endpoint = "/api/chat" } = message;

  (async () => {
    try {
      const data = await requestChat(serverUrl, endpoint, payload);
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

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "hwc-chat-stream") {
    return;
  }

  port.onMessage.addListener((message) => {
    if (message?.type !== "start") {
      return;
    }

    const { serverUrl, payload, endpoint = "/api/chat" } = message;
    streamChat(port, serverUrl, endpoint, payload);
  });
});
