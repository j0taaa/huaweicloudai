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

const requestServer = async (serverUrl, endpoint, payload, method = "POST") => {
  const requestInit = {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (method !== "GET") {
    requestInit.body = JSON.stringify(payload || {});
  }

  const response = await fetch(`${serverUrl}${endpoint}`, requestInit);

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

  const { serverUrl, payload, endpoint = "/api/chat", method = "POST" } = message;

  (async () => {
    try {
      const data = await requestServer(serverUrl, endpoint, payload, method);
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
