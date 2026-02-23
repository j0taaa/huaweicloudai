const parseNdjson = (text) => {
  const events = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  if (events.length === 0) {
    return {};
  }

  const finalEvent = [...events].reverse().find((event) => event?.type === "final");
  if (finalEvent) {
    return finalEvent;
  }

  const errorEvent = [...events].reverse().find((event) => event?.type === "error");
  if (errorEvent) {
    return errorEvent;
  }

  return events[events.length - 1];
};

const parseServerResponse = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/x-ndjson")) {
    const text = await response.text();
    return parseNdjson(text);
  }

  return response.json();
};

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

  return parseServerResponse(response);
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
