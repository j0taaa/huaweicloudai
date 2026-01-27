const WIDGET_ID = "hwc-chat-widget";

const existingWidget = document.getElementById(WIDGET_ID);
if (!existingWidget) {
  const widget = document.createElement("div");
  widget.id = WIDGET_ID;
  widget.className = "hwc-chat-widget";

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "hwc-chat-toggle";
  toggleButton.setAttribute("aria-expanded", "false");
  toggleButton.innerHTML = `
    <span class="hwc-chat-toggle-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <defs>
          <linearGradient id="hwc-ai-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#7c3aed" />
            <stop offset="50%" stop-color="#2563eb" />
            <stop offset="100%" stop-color="#06b6d4" />
          </linearGradient>
        </defs>
        <path
          d="M12 2l1.8 4.7L19 8.2l-4 3.6 1.2 5.1L12 14.6 7.8 16.9 9 11.8 5 8.2l5.2-1.5L12 2z"
          fill="url(#hwc-ai-gradient)"
        />
        <path
          d="M12 6.5l.9 2.2 2.4.7-1.8 1.6.6 2.3L12 12.2 9.9 13.3l.6-2.3-1.8-1.6 2.4-.7L12 6.5z"
          fill="#fff"
          opacity="0.7"
        />
      </svg>
    </span>
    <span class="hwc-visually-hidden">Toggle Huawei Cloud AI assistant</span>
  `;

  const panel = document.createElement("div");
  panel.className = "hwc-chat-panel hwc-chat-hidden";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Huawei Cloud AI chat");

  const header = document.createElement("div");
  header.className = "hwc-chat-header";

  const title = document.createElement("div");
  title.className = "hwc-chat-title";
  title.textContent = "Huawei Cloud AI";

  const status = document.createElement("div");
  status.className = "hwc-chat-status";
  status.textContent = "Ready to connect";

  header.append(title, status);

  const credentials = document.createElement("div");
  credentials.className = "hwc-chat-credentials hwc-chat-credentials-collapsed";

  const credentialsToggle = document.createElement("button");
  credentialsToggle.type = "button";
  credentialsToggle.className = "hwc-chat-section-title";
  credentialsToggle.setAttribute("aria-expanded", "false");
  credentialsToggle.textContent = "AK/SK Credentials";

  const credentialsBody = document.createElement("div");
  credentialsBody.className = "hwc-chat-credentials-body";

  const serverUrlLabel = document.createElement("label");
  serverUrlLabel.className = "hwc-chat-label";
  serverUrlLabel.textContent = "Server URL";

  const serverUrlInput = document.createElement("input");
  serverUrlInput.type = "text";
  serverUrlInput.className = "hwc-chat-input";
  serverUrlInput.placeholder = "http://1.178.45.234:3000";
  serverUrlInput.autocomplete = "off";
  serverUrlLabel.append(serverUrlInput);

  const accessKeyLabel = document.createElement("label");
  accessKeyLabel.className = "hwc-chat-label";
  accessKeyLabel.textContent = "Access Key (AK)";

  const accessKeyInput = document.createElement("input");
  accessKeyInput.type = "text";
  accessKeyInput.className = "hwc-chat-input";
  accessKeyInput.placeholder = "Enter your Huawei Cloud AK";
  accessKeyInput.autocomplete = "off";
  accessKeyLabel.append(accessKeyInput);

  const secretKeyLabel = document.createElement("label");
  secretKeyLabel.className = "hwc-chat-label";
  secretKeyLabel.textContent = "Secret Key (SK)";

  const secretKeyInput = document.createElement("input");
  secretKeyInput.type = "password";
  secretKeyInput.className = "hwc-chat-input";
  secretKeyInput.placeholder = "Enter your Huawei Cloud SK";
  secretKeyInput.autocomplete = "off";
  secretKeyLabel.append(secretKeyInput);

  const credentialsFooter = document.createElement("div");
  credentialsFooter.className = "hwc-chat-credentials-footer";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "hwc-chat-save";
  saveButton.textContent = "Save credentials";

  const saveStatus = document.createElement("span");
  saveStatus.className = "hwc-chat-save-status";
  saveStatus.textContent = "Stored locally";

  credentialsFooter.append(saveButton, saveStatus);
  credentialsBody.append(
    serverUrlLabel,
    accessKeyLabel,
    secretKeyLabel,
    credentialsFooter,
  );

  credentials.append(credentialsToggle, credentialsBody);

  const messages = document.createElement("div");
  messages.className = "hwc-chat-messages";

  const form = document.createElement("form");
  form.className = "hwc-chat-form";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "hwc-chat-input hwc-chat-message";
  input.placeholder = "Ask about Huawei Cloud services...";

  const sendButton = document.createElement("button");
  sendButton.type = "submit";
  sendButton.className = "hwc-chat-send";
  sendButton.textContent = "Send";

  form.append(input, sendButton);
  panel.append(header, credentials, messages, form);
  widget.append(toggleButton, panel);
  document.body.append(widget);

  const hasChromeStorage =
    typeof chrome !== "undefined" &&
    typeof chrome.storage !== "undefined" &&
    typeof chrome.storage.local !== "undefined";

  const storageGet = (keys) =>
    new Promise((resolve) => {
      if (hasChromeStorage) {
        chrome.storage.local.get(keys, resolve);
        return;
      }

      const result = {};
      keys.forEach((key) => {
        result[key] = localStorage.getItem(key) ?? "";
      });
      resolve(result);
    });

  const storageSet = (values) =>
    new Promise((resolve) => {
      if (hasChromeStorage) {
        chrome.storage.local.set(values, resolve);
        return;
      }

      Object.entries(values).forEach(([key, value]) => {
        localStorage.setItem(key, value);
      });
      resolve();
    });

  const DEFAULT_SERVER_URL = "http://1.178.45.234:3000";
  const chatHistory = [];
  let isSending = false;

  const updateSaveButton = () => {
    const hasValues =
      accessKeyInput.value.trim() && secretKeyInput.value.trim();
    saveButton.disabled = !hasValues;
  };

  const updateSaveStatus = (message, isSuccess = false) => {
    saveStatus.textContent = message;
    saveStatus.dataset.state = isSuccess ? "success" : "neutral";
  };

  const setStatus = (message, state = "neutral") => {
    status.textContent = message;
    status.dataset.state = state;
  };

  const renderBubble = (role, text) => {
    const bubble = document.createElement("div");
    bubble.className = `hwc-chat-bubble hwc-chat-bubble-${role}`;
    bubble.textContent = text;
    messages.append(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  };

  const normalizeServerUrl = (value) => {
    const trimmed = value.trim();
    const withProtocol =
      trimmed && !/^https?:\/\//i.test(trimmed)
        ? `http://${trimmed}`
        : trimmed;

    try {
      const url = new URL(withProtocol || DEFAULT_SERVER_URL);
      return `${url.protocol}//${url.host}`;
    } catch (error) {
      return DEFAULT_SERVER_URL;
    }
  };

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

  const connectToServer = async () => {
    const trimmedAccessKey = accessKeyInput.value.trim();
    const trimmedSecretKey = secretKeyInput.value.trim();
    const serverUrl = normalizeServerUrl(serverUrlInput.value);
    const payload = {
      messages: [
        ...(trimmedAccessKey || trimmedSecretKey
          ? [
              {
                role: "system",
                content: `Huawei Cloud Access Key (AK): ${
                  trimmedAccessKey || "[not provided]"
                }`,
              },
              {
                role: "system",
                content: `Huawei Cloud Secret Key (SK): ${
                  trimmedSecretKey || "[not provided]"
                }`,
              },
            ]
          : []),
        ...chatHistory,
      ],
    };

    try {
      const data = await requestChat(serverUrl, payload);
      return { data, usedFallback: false };
    } catch (error) {
      if (/^https:\/\//i.test(serverUrl)) {
        const fallbackUrl = serverUrl.replace(/^https:\/\//i, "http://");
        const data = await requestChat(fallbackUrl, payload);
        serverUrlInput.value = fallbackUrl;
        storageSet({ serverUrl: fallbackUrl });
        return { data, usedFallback: true };
      }
      throw error;
    }
  };

  toggleButton.addEventListener("click", () => {
    panel.classList.toggle("hwc-chat-hidden");
    const isOpen = !panel.classList.contains("hwc-chat-hidden");
    toggleButton.setAttribute("aria-expanded", `${isOpen}`);
    if (isOpen) {
      input.focus();
    }
  });

  credentialsToggle.addEventListener("click", () => {
    credentials.classList.toggle("hwc-chat-credentials-collapsed");
    const isOpen = !credentials.classList.contains(
      "hwc-chat-credentials-collapsed",
    );
    credentialsToggle.setAttribute("aria-expanded", `${isOpen}`);
  });

  accessKeyInput.addEventListener("input", updateSaveButton);
  secretKeyInput.addEventListener("input", updateSaveButton);
  serverUrlInput.addEventListener("change", () => {
    const normalized = normalizeServerUrl(serverUrlInput.value);
    serverUrlInput.value = normalized;
    storageSet({ serverUrl: normalized });
  });

  saveButton.addEventListener("click", async () => {
    const accessKey = accessKeyInput.value.trim();
    const secretKey = secretKeyInput.value.trim();

    if (!accessKey || !secretKey) {
      updateSaveStatus("Enter AK and SK to save.");
      return;
    }

    saveButton.disabled = true;
    updateSaveStatus("Saving...");

    await storageSet({ accessKey, secretKey });

    updateSaveStatus("Saved", true);
    saveButton.disabled = false;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSending) {
      return;
    }

    const value = input.value.trim();
    if (!value) {
      return;
    }

    const userMessage = { role: "user", content: value };
    chatHistory.push(userMessage);
    renderBubble("user", value);
    input.value = "";
    input.focus();

    const assistantBubble = renderBubble("assistant", "Thinking...");

    try {
      isSending = true;
      sendButton.disabled = true;
      setStatus("Connecting to server...", "loading");

      const { data, usedFallback } = await connectToServer();
      const reply = data?.reply?.trim();
      const toolCalls = data?.toolCalls ?? [];

      if (!reply && toolCalls.length === 0) {
        assistantBubble.textContent = "No response returned.";
        setStatus("Server replied with no content.", "warning");
        return;
      }

      if (reply) {
        assistantBubble.textContent = reply;
        chatHistory.push({ role: "assistant", content: reply });
      } else {
        assistantBubble.textContent =
          "Received tool calls. Check the server for results.";
      }

      setStatus(
        usedFallback ? "Connected (HTTP fallback)" : "Connected",
        "success",
      );
    } catch (error) {
      assistantBubble.textContent =
        error instanceof Error
          ? error.message
          : "Unable to reach server.";
      setStatus("Connection failed", "error");
    } finally {
      isSending = false;
      sendButton.disabled = false;
    }
  });

  storageGet(["accessKey", "secretKey", "serverUrl"]).then((values) => {
    if (typeof values.accessKey === "string") {
      accessKeyInput.value = values.accessKey;
    }
    if (typeof values.secretKey === "string") {
      secretKeyInput.value = values.secretKey;
    }
    if (typeof values.serverUrl === "string" && values.serverUrl.trim()) {
      serverUrlInput.value = normalizeServerUrl(values.serverUrl);
    } else {
      serverUrlInput.value = DEFAULT_SERVER_URL;
    }
    updateSaveButton();
  });
}
