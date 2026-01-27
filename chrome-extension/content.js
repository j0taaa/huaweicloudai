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

  const headerTop = document.createElement("div");
  headerTop.className = "hwc-chat-header-top";

  const title = document.createElement("div");
  title.className = "hwc-chat-title";
  title.textContent = "Huawei Cloud AI";

  const newChatButton = document.createElement("button");
  newChatButton.type = "button";
  newChatButton.className = "hwc-chat-new";
  newChatButton.setAttribute("aria-label", "Start new conversation");
  newChatButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  `;

  const status = document.createElement("div");
  status.className = "hwc-chat-status";
  status.textContent = "Ready to connect";

  headerTop.append(title, newChatButton);
  header.append(headerTop, status);

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

  const inferenceSection = document.createElement("div");
  inferenceSection.className = "hwc-chat-inference";

  const inferenceTitle = document.createElement("p");
  inferenceTitle.className = "hwc-chat-inference-title";
  inferenceTitle.textContent = "Inference";

  const inferenceToggle = document.createElement("div");
  inferenceToggle.className = "hwc-chat-toggle-group";

  const inferenceDefaultButton = document.createElement("button");
  inferenceDefaultButton.type = "button";
  inferenceDefaultButton.className = "hwc-chat-toggle-option";
  inferenceDefaultButton.dataset.mode = "default";
  inferenceDefaultButton.textContent = "Built-in";

  const inferenceCustomButton = document.createElement("button");
  inferenceCustomButton.type = "button";
  inferenceCustomButton.className = "hwc-chat-toggle-option";
  inferenceCustomButton.dataset.mode = "custom";
  inferenceCustomButton.textContent = "Custom";

  inferenceToggle.append(inferenceDefaultButton, inferenceCustomButton);

  const inferenceFields = document.createElement("div");
  inferenceFields.className = "hwc-chat-inference-fields";

  const inferenceBaseUrlLabel = document.createElement("label");
  inferenceBaseUrlLabel.className = "hwc-chat-label";
  inferenceBaseUrlLabel.textContent = "LLM Base URL";

  const inferenceBaseUrlInput = document.createElement("input");
  inferenceBaseUrlInput.type = "text";
  inferenceBaseUrlInput.className = "hwc-chat-input";
  inferenceBaseUrlInput.placeholder = "https://openrouter.ai/api/v1";
  inferenceBaseUrlInput.autocomplete = "off";
  inferenceBaseUrlLabel.append(inferenceBaseUrlInput);

  const inferenceModelLabel = document.createElement("label");
  inferenceModelLabel.className = "hwc-chat-label";
  inferenceModelLabel.textContent = "Model";

  const inferenceModelInput = document.createElement("input");
  inferenceModelInput.type = "text";
  inferenceModelInput.className = "hwc-chat-input";
  inferenceModelInput.placeholder = "openrouter/auto";
  inferenceModelInput.autocomplete = "off";
  inferenceModelLabel.append(inferenceModelInput);

  const inferenceApiKeyLabel = document.createElement("label");
  inferenceApiKeyLabel.className = "hwc-chat-label";
  inferenceApiKeyLabel.textContent = "API key";

  const inferenceApiKeyInput = document.createElement("input");
  inferenceApiKeyInput.type = "password";
  inferenceApiKeyInput.className = "hwc-chat-input";
  inferenceApiKeyInput.placeholder = "Enter your provider key";
  inferenceApiKeyInput.autocomplete = "off";
  inferenceApiKeyLabel.append(inferenceApiKeyInput);

  const inferenceHelp = document.createElement("p");
  inferenceHelp.className = "hwc-chat-inference-help";
  inferenceHelp.textContent =
    "Custom settings are stored locally and used only when Custom is selected.";

  inferenceFields.append(
    inferenceBaseUrlLabel,
    inferenceModelLabel,
    inferenceApiKeyLabel,
    inferenceHelp,
  );

  inferenceSection.append(inferenceTitle, inferenceToggle, inferenceFields);

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
    inferenceSection,
    credentialsFooter,
  );

  credentials.append(credentialsToggle, credentialsBody);

  const messages = document.createElement("div");
  messages.className = "hwc-chat-messages";
  const SCROLL_BOTTOM_THRESHOLD = 24;
  const THINKING_COLLAPSE_THRESHOLD = 1200;
  const THINKING_PREVIEW_CHARS = 320;
  let shouldAutoScroll = true;
  const updateAutoScroll = () => {
    const distanceFromBottom =
      messages.scrollHeight - messages.scrollTop - messages.clientHeight;
    shouldAutoScroll = distanceFromBottom <= SCROLL_BOTTOM_THRESHOLD;
  };
  const scrollToBottomIfNeeded = () => {
    if (!shouldAutoScroll) {
      return;
    }
    messages.scrollTop = messages.scrollHeight;
  };
  messages.addEventListener("scroll", updateAutoScroll, { passive: true });
  updateAutoScroll();

  const form = document.createElement("form");
  form.className = "hwc-chat-form";

  const input = document.createElement("textarea");
  input.className = "hwc-chat-input hwc-chat-message";
  input.placeholder = "Ask about Huawei Cloud services...";
  input.rows = 1;

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
  const PROJECT_IDS_STORAGE_KEY = "projectIds";
  const INFERENCE_MODE_STORAGE_KEY = "inferenceMode";
  const INFERENCE_SETTINGS_STORAGE_KEY = "inferenceSettings";
  const chatHistory = [];
  let isSending = false;
  let pendingChoice = null;
  let pendingChoiceForm = null;
  let activeServerUrl = DEFAULT_SERVER_URL;
  let storedProjectIds = [];
  let inferenceMode = "default";
  let inferenceSettings = {
    baseUrl: "",
    model: "",
    apiKey: "",
  };
  const toolCards = new Map();

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

  const escapeHtml = (value) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const renderInlineMarkdown = (value) => {
    let output = escapeHtml(value);
    output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
    output = output.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
    output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    output = output.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    output = output.replace(/_([^_]+)_/g, "<em>$1</em>");
    return output;
  };

  const parseTableRow = (line) => {
    const trimmed = line.trim().replace(/^(\|)/, "").replace(/(\|)$/, "");
    return trimmed.split("|").map((cell) => cell.trim());
  };

  const isTableDivider = (line) =>
    /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line);

  const renderMarkdown = (text) => {
    const lines = text.split(/\r?\n/);
    const blocks = [];
    let paragraph = [];
    let list = null;
    let inCode = false;
    let codeLang = "";
    let codeLines = [];

    const flushParagraph = () => {
      if (paragraph.length === 0) return;
      blocks.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    };

    const flushList = () => {
      if (!list) return;
      const items = list.items
        .map((item) => `<li>${renderInlineMarkdown(item)}</li>`)
        .join("");
      blocks.push(`<${list.type}>${items}</${list.type}>`);
      list = null;
    };

    const flushCode = () => {
      const languageClass = codeLang ? ` class="language-${codeLang}"` : "";
      const code = escapeHtml(codeLines.join("\n"));
      blocks.push(`<pre><code${languageClass}>${code}</code></pre>`);
      codeLines = [];
      codeLang = "";
    };

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.trim().startsWith("```")) {
        if (inCode) {
          inCode = false;
          flushCode();
          continue;
        }
        flushParagraph();
        flushList();
        inCode = true;
        codeLang = line.trim().slice(3).trim();
        continue;
      }

      if (inCode) {
        codeLines.push(line);
        continue;
      }

      if (!line.trim()) {
        flushParagraph();
        flushList();
        continue;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        flushParagraph();
        flushList();
        const level = headingMatch[1].length;
        blocks.push(
          `<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`,
        );
        continue;
      }

      const nextLine = lines[index + 1];
      if (
        line.includes("|") &&
        typeof nextLine === "string" &&
        isTableDivider(nextLine)
      ) {
        flushParagraph();
        flushList();
        const headers = parseTableRow(line);
        index += 1;
        const rows = [];
        for (let rowIndex = index + 1; rowIndex < lines.length; rowIndex += 1) {
          const rowLine = lines[rowIndex];
          if (!rowLine.trim()) {
            index = rowIndex;
            break;
          }
          if (!rowLine.includes("|")) {
            index = rowIndex - 1;
            break;
          }
          rows.push(parseTableRow(rowLine));
          index = rowIndex;
        }

        const headerCells = headers
          .map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`)
          .join("");
        const bodyRows = rows
          .map((row) => {
            const cells = row
              .map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`)
              .join("");
            return `<tr>${cells}</tr>`;
          })
          .join("");
        blocks.push(
          `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`,
        );
        continue;
      }

      const unorderedMatch = line.match(/^\s*[-*]\s+(.*)$/);
      if (unorderedMatch) {
        flushParagraph();
        if (!list || list.type !== "ul") {
          flushList();
          list = { type: "ul", items: [] };
        }
        list.items.push(unorderedMatch[1]);
        continue;
      }

      const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/);
      if (orderedMatch) {
        flushParagraph();
        if (!list || list.type !== "ol") {
          flushList();
          list = { type: "ol", items: [] };
        }
        list.items.push(orderedMatch[1]);
        continue;
      }

      paragraph.push(line.trim());
    }

    if (inCode) {
      flushCode();
    }
    flushParagraph();
    flushList();

    return blocks.join("");
  };

  const renderBubble = (role, text, { markdown = false } = {}) => {
    const bubble = document.createElement("div");
    bubble.className = `hwc-chat-bubble hwc-chat-bubble-${role}`;
    if (markdown) {
      bubble.innerHTML = `<div class="hwc-chat-markdown">${renderMarkdown(
        text,
      )}</div>`;
    } else {
      bubble.textContent = text;
    }
    messages.append(bubble);
    scrollToBottomIfNeeded();
    return bubble;
  };

  const updateThinkingBlock = (container, thinkingText) => {
    const trimmed = thinkingText?.trim();
    if (!trimmed) {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }

    const isLong = trimmed.length > THINKING_COLLAPSE_THRESHOLD;
    const preview = isLong
      ? trimmed.slice(-THINKING_PREVIEW_CHARS)
      : trimmed;

    container.hidden = false;
    const previewHtml = `
      <pre class="hwc-chat-thinking-preview">${escapeHtml(preview)}</pre>
    `;
    const detailsHtml = isLong
      ? `
        <details class="hwc-chat-thinking-details">
          <summary>Show full thinking</summary>
          <pre>${escapeHtml(trimmed)}</pre>
        </details>
      `
      : "";

    container.innerHTML = `
      <p class="hwc-chat-thinking-title">Model thinking</p>
      ${previewHtml}
      ${detailsHtml}
    `;
  };

  const createAssistantBubble = () => {
    const bubble = document.createElement("div");
    bubble.className = "hwc-chat-bubble hwc-chat-bubble-assistant";

    const status = document.createElement("div");
    status.className = "hwc-chat-thinking-status";
    status.innerHTML = `
      <span class="hwc-chat-thinking-spinner" aria-hidden="true"></span>
      <span>Thinking...</span>
    `;

    const content = document.createElement("div");
    content.className = "hwc-chat-markdown";

    const thinking = document.createElement("div");
    thinking.className = "hwc-chat-thinking-block";
    thinking.hidden = true;

    bubble.append(status, content, thinking);
    messages.append(bubble);
    scrollToBottomIfNeeded();
    return { bubble, status, content, thinking };
  };

  const finalizeAssistantBubble = (bubbleState, text) => {
    bubbleState.status.hidden = true;
    bubbleState.content.textContent = text;
    updateThinkingBlock(bubbleState.thinking, "");
  };

  const parseToolArguments = (toolCall) => {
    const rawArgs = toolCall?.function?.arguments ?? "";
    if (!rawArgs) {
      return { parsed: null, raw: "" };
    }

    try {
      return { parsed: JSON.parse(rawArgs), raw: rawArgs };
    } catch (error) {
      return { parsed: null, raw: rawArgs };
    }
  };

  const parseToolPayload = (toolCall) => {
    let payload = {};

    try {
      payload = JSON.parse(toolCall.function?.arguments || "{}");
    } catch (error) {
      return {
        error: `Error parsing tool arguments: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
      };
    }

    if (toolCall.function?.name === "eval_code") {
      if (!payload.code) {
        return { error: "Error: No code provided for eval_code." };
      }
      return { code: payload.code };
    }

    if (toolCall.function?.name === "ask_multiple_choice") {
      if (!payload.question || !Array.isArray(payload.options)) {
        return { error: "Error: Invalid payload for ask_multiple_choice." };
      }
      return { question: payload.question, options: payload.options };
    }

    return {
      error: `Error: Unsupported tool payload for ${toolCall.function?.name}.`,
    };
  };

  const summarizeToolCall = (toolCall) => {
    const payload = parseToolPayload(toolCall);
    if (payload.error) {
      return "Unable to summarize tool details.";
    }

    if (toolCall.function.name === "ask_multiple_choice") {
      return payload.question
        ? `Asks the user: ${payload.question}`
        : "Requests a multiple choice response.";
    }

    if (toolCall.function.name === "eval_code") {
      return payload.code ? "Runs the provided code snippet." : "Runs code.";
    }

    return "Runs a tool with the provided arguments.";
  };

  const updateToolCardStatus = (toolCallId, status) => {
    const card = toolCards.get(toolCallId);
    if (!card) {
      return;
    }

    const statusTextMap = {
      running: "Running",
      waiting: "Waiting",
      complete: "Complete",
      error: "Error",
    };

    card.statusBadge.dataset.state = status;
    card.statusText.textContent = statusTextMap[status] ?? "Pending";
    card.spinner.hidden = status === "complete" || status === "error";
  };

  const updateToolCardResult = (toolCallId, result) => {
    const card = toolCards.get(toolCallId);
    if (!card) {
      return;
    }

    card.resultPre.textContent = result || "No result returned.";
  };

  const renderToolCalls = (toolCalls) => {
    if (!toolCalls.length) {
      return;
    }

    const container = document.createElement("div");
    container.className = "hwc-chat-tool-calls";

    toolCalls.forEach((toolCall) => {
      const card = document.createElement("div");
      card.className = "hwc-chat-tool-card";

      const headerRow = document.createElement("div");
      headerRow.className = "hwc-chat-tool-header";

      const headerMeta = document.createElement("div");
      headerMeta.className = "hwc-chat-tool-meta";

      const label = document.createElement("p");
      label.className = "hwc-chat-tool-label";
      label.textContent = "Tool run";

      const name = document.createElement("p");
      name.className = "hwc-chat-tool-name";
      name.textContent = toolCall.function?.name || "Tool call";

      headerMeta.append(label, name);

      const statusBadge = document.createElement("span");
      statusBadge.className = "hwc-chat-tool-status";

      const spinner = document.createElement("span");
      spinner.className = "hwc-chat-tool-spinner";
      spinner.setAttribute("aria-hidden", "true");

      const statusText = document.createElement("span");
      statusText.className = "hwc-chat-tool-status-text";
      statusText.textContent = "Running";

      statusBadge.append(spinner, statusText);

      const detailsToggle = document.createElement("button");
      detailsToggle.type = "button";
      detailsToggle.className = "hwc-chat-tool-toggle";
      detailsToggle.setAttribute("aria-expanded", "false");
      detailsToggle.textContent = "Details";

      headerRow.append(headerMeta, statusBadge, detailsToggle);

      const summary = document.createElement("p");
      summary.className = "hwc-chat-tool-summary";
      summary.textContent = summarizeToolCall(toolCall);

      const details = document.createElement("div");
      details.className = "hwc-chat-tool-details hwc-chat-tool-details-collapsed";

      const detailsLabel = document.createElement("p");
      detailsLabel.className = "hwc-chat-tool-details-label";
      detailsLabel.textContent = "Tool arguments";

      const pre = document.createElement("pre");
      pre.className = "hwc-chat-tool-arguments";
      const { raw } = parseToolArguments(toolCall);
      pre.textContent = raw || "No arguments provided.";

      const resultLabel = document.createElement("p");
      resultLabel.className = "hwc-chat-tool-details-label";
      resultLabel.textContent = "Tool result";

      const resultPre = document.createElement("pre");
      resultPre.className = "hwc-chat-tool-result";
      resultPre.textContent = "Awaiting response from the tool...";

      details.append(summary, detailsLabel, pre, resultLabel, resultPre);
      card.append(headerRow, details);
      container.append(card);

      toolCards.set(toolCall.id, {
        statusBadge,
        statusText,
        spinner,
        details,
        resultPre,
      });

      detailsToggle.addEventListener("click", () => {
        const isCollapsed = details.classList.toggle(
          "hwc-chat-tool-details-collapsed",
        );
        detailsToggle.setAttribute("aria-expanded", `${!isCollapsed}`);
      });

      if (toolCall.function?.name === "ask_multiple_choice") {
        updateToolCardStatus(toolCall.id, "waiting");
      } else {
        updateToolCardStatus(toolCall.id, "running");
      }
    });

    messages.append(container);
    scrollToBottomIfNeeded();
  };

  const updateAssistantBubble = (bubbleState, text, thinkingText = "") => {
    const trimmed = text?.trim() ?? "";
    bubbleState.status.hidden = Boolean(trimmed || thinkingText?.trim());
    bubbleState.content.innerHTML = trimmed ? renderMarkdown(text) : "";
    updateThinkingBlock(bubbleState.thinking, thinkingText);
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

  const createSseParser = (onEvent) => {
    let buffer = "";
    let eventName = "message";
    let dataLines = [];

    const flushEvent = () => {
      if (dataLines.length === 0) return;
      const data = dataLines.join("\n");
      dataLines = [];
      onEvent({ event: eventName || "message", data });
      eventName = "message";
    };

    return (chunk) => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
        buffer = buffer.slice(newlineIndex + 1);

        if (!line.trim()) {
          flushEvent();
        } else if (line.startsWith("event:")) {
          eventName = line.slice(6).trim() || "message";
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }

        newlineIndex = buffer.indexOf("\n");
      }
    };
  };

  const requestServer = async (serverUrl, endpoint, payload) => {
    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function"
    ) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "hwc-chat-request", serverUrl, endpoint, payload },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }

            if (!response) {
              reject(new Error("No response from extension background."));
              return;
            }

            if (!response.ok) {
              reject(new Error(response.error || "Server error."));
              return;
            }

            resolve(response.data);
          },
        );
      });
    }

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

  const sendMessages = async (
    messagesToSend,
    { allowFallback = true, onStreamUpdate } = {},
  ) => {
    const trimmedAccessKey = accessKeyInput.value.trim();
    const trimmedSecretKey = secretKeyInput.value.trim();
    const serverUrl = normalizeServerUrl(activeServerUrl);
    const payload = {
      messages: [...messagesToSend],
      context: {
        accessKey: trimmedAccessKey,
        secretKey: trimmedSecretKey,
        projectIds: storedProjectIds,
      },
      inference:
        inferenceMode === "custom"
          ? {
              mode: "custom",
              baseUrl: inferenceSettings.baseUrl.trim(),
              model: inferenceSettings.model.trim(),
              apiKey: inferenceSettings.apiKey.trim(),
            }
          : { mode: "default" },
    };

    const streamFromServer = async (targetUrl) => {
      let reply = "";
      let thinking = "";
      let toolCalls = [];

      const parser = createSseParser(({ event, data }) => {
        if (data === "[DONE]") {
          return;
        }
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = { chunk: data };
        }

        if (event === "content") {
          const chunk = parsed?.chunk ?? "";
          if (chunk) {
            reply += chunk;
            onStreamUpdate?.({ content: reply, thinking });
          }
        } else if (event === "thinking") {
          const chunk = parsed?.chunk ?? "";
          if (chunk) {
            thinking += chunk;
            onStreamUpdate?.({ content: reply, thinking });
          }
        } else if (event === "done") {
          reply = parsed?.reply ?? reply;
          thinking = parsed?.thinking ?? thinking;
          toolCalls = parsed?.toolCalls ?? toolCalls;
        } else if (event === "error") {
          throw new Error(parsed?.message ?? "Stream error.");
        }
      });

      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        typeof chrome.runtime.connect === "function"
      ) {
        await new Promise((resolve, reject) => {
          const port = chrome.runtime.connect({ name: "hwc-chat-stream" });

          port.onMessage.addListener((message) => {
            if (message?.type === "chunk") {
              parser(message.chunk || "");
            } else if (message?.type === "done") {
              resolve();
            } else if (message?.type === "error") {
              reject(new Error(message.error || "Server error."));
            }
          });

          port.onDisconnect.addListener(() => {
            resolve();
          });

          port.postMessage({
            type: "start",
            serverUrl: targetUrl,
            endpoint: "/api/chat",
            payload,
          });
        });
      } else {
        const response = await fetch(`${targetUrl}/api/chat`, {
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

        if (!response.body) {
          throw new Error("No response stream available.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parser(decoder.decode(value, { stream: true }));
        }
      }

      return { reply, toolCalls, thinking };
    };

    try {
      const data = await streamFromServer(serverUrl);
      return { data, usedFallback: false, serverUrl };
    } catch (error) {
      if (allowFallback && /^https:\/\//i.test(serverUrl)) {
        const fallbackUrl = serverUrl.replace(/^https:\/\//i, "http://");
        const data = await streamFromServer(fallbackUrl);
        serverUrlInput.value = fallbackUrl;
        activeServerUrl = fallbackUrl;
        storageSet({ serverUrl: fallbackUrl });
        return { data, usedFallback: true, serverUrl: fallbackUrl };
      }
      throw error;
    }
  };

  const fetchProjectIds = async (accessKey, secretKey) => {
    const serverUrl = normalizeServerUrl(activeServerUrl);
    const payload = { accessKey, secretKey };

    try {
      const data = await requestServer(serverUrl, "/api/project-ids", payload);
      return { data, serverUrl };
    } catch (error) {
      if (/^https:\/\//i.test(serverUrl)) {
        const fallbackUrl = serverUrl.replace(/^https:\/\//i, "http://");
        const data = await requestServer(fallbackUrl, "/api/project-ids", payload);
        serverUrlInput.value = fallbackUrl;
        activeServerUrl = fallbackUrl;
        storageSet({ serverUrl: fallbackUrl });
        return { data, serverUrl: fallbackUrl };
      }
      throw error;
    }
  };

  const executeEvalTool = async (toolCall) => {
    const payload = parseToolPayload(toolCall);
    if (payload.error) {
      return {
        role: "tool",
        content: payload.error,
        tool_call_id: toolCall.id,
      };
    }

    try {
      const data = await requestServer(activeServerUrl, "/api/eval", {
        code: payload.code,
      });
      return {
        role: "tool",
        content:
          data?.error ?? data?.result ?? "No result returned from server.",
        tool_call_id: toolCall.id,
      };
    } catch (error) {
      return {
        role: "tool",
        content: `Error executing eval_code: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
        tool_call_id: toolCall.id,
      };
    }
  };

  const runToolCalls = async (toolCalls) => {
    return Promise.all(
      toolCalls.map(async (toolCall) => {
        if (toolCall.function?.name === "eval_code") {
          return executeEvalTool(toolCall);
        }

        return {
          role: "tool",
          content: `Error: Unsupported tool: ${toolCall.function?.name}`,
          tool_call_id: toolCall.id,
        };
      }),
    );
  };

  const clearPendingChoice = () => {
    if (pendingChoiceForm) {
      pendingChoiceForm.remove();
      pendingChoiceForm = null;
    }
    pendingChoice = null;
    input.disabled = false;
    sendButton.disabled = false;
  };

  const renderMultipleChoice = (toolCall, payload) => {
    clearPendingChoice();

    const form = document.createElement("form");
    form.className = "hwc-chat-choice";

    const label = document.createElement("p");
    label.className = "hwc-chat-choice-label";
    label.textContent = "Multiple choice";

    const question = document.createElement("p");
    question.className = "hwc-chat-choice-question";
    question.textContent = payload.question;

    const options = document.createElement("div");
    options.className = "hwc-chat-choice-options";

    const customId = `hwc-choice-custom-${toolCall.id}`;

    payload.options.forEach((option, index) => {
      const optionLabel = document.createElement("label");
      optionLabel.className = "hwc-chat-choice-option";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `hwc-choice-${toolCall.id}`;
      radio.value = option;
      radio.className = "hwc-chat-choice-radio";

      const text = document.createElement("span");
      text.textContent = option;

      optionLabel.append(radio, text);
      options.append(optionLabel);
      if (index === 0) {
        radio.checked = true;
      }
    });

    const customLabel = document.createElement("label");
    customLabel.className = "hwc-chat-choice-option";

    const customRadio = document.createElement("input");
    customRadio.type = "radio";
    customRadio.name = `hwc-choice-${toolCall.id}`;
    customRadio.value = "custom";
    customRadio.className = "hwc-chat-choice-radio";

    const customText = document.createElement("span");
    customText.textContent = "Other (type your answer)";

    customLabel.append(customRadio, customText);
    options.append(customLabel);

    const customInput = document.createElement("input");
    customInput.type = "text";
    customInput.className = "hwc-chat-choice-custom";
    customInput.placeholder = "Type your answer";
    customInput.setAttribute("aria-describedby", customId);
    customInput.disabled = true;

    const errorText = document.createElement("p");
    errorText.className = "hwc-chat-choice-error";
    errorText.id = customId;

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "hwc-chat-choice-submit";
    submit.textContent = "Send answer";

    form.append(label, question, options, customInput, errorText, submit);
    messages.append(form);
    scrollToBottomIfNeeded();

    const updateCustomState = () => {
      const selected = form.querySelector(
        `input[name="hwc-choice-${toolCall.id}"]:checked`,
      );
      const isCustom = selected?.value === "custom";
      customInput.disabled = !isCustom;
      if (!isCustom) {
        errorText.textContent = "";
      }
    };

    form.addEventListener("change", updateCustomState);
    updateCustomState();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!pendingChoice) {
        return;
      }

      const selected = form.querySelector(
        `input[name="hwc-choice-${toolCall.id}"]:checked`,
      );
      if (!selected) {
        errorText.textContent = "Please choose an option.";
        return;
      }

      let answer = selected.value;
      if (answer === "custom") {
        answer = customInput.value.trim();
        if (!answer) {
          errorText.textContent = "Enter your custom answer to continue.";
          customInput.focus();
          return;
        }
      }

      isSending = true;
      sendButton.disabled = true;
      input.disabled = true;
      setStatus("Sending tool response...", "loading");

      const toolMessage = {
        role: "tool",
        content: answer,
        tool_call_id: toolCall.id,
      };
      chatHistory.push(toolMessage);
      updateToolCardResult(toolCall.id, answer);
      updateToolCardStatus(toolCall.id, "complete");
      clearPendingChoice();

      const assistantBubble = createAssistantBubble();

      try {
        const { data } = await sendMessages(chatHistory, {
          allowFallback: false,
          onStreamUpdate: ({ content, thinking }) => {
            updateAssistantBubble(assistantBubble, content, thinking);
          },
        });
        await handleResponse(data, assistantBubble);
        setStatus("Connected", "success");
      } catch (error) {
        finalizeAssistantBubble(
          assistantBubble,
          error instanceof Error ? error.message : "Unable to reach server.",
        );
        setStatus("Connection failed", "error");
      } finally {
        isSending = false;
        sendButton.disabled = false;
        input.disabled = false;
      }
    });

    pendingChoiceForm = form;
    pendingChoice = { toolCall, payload };
    input.disabled = true;
    sendButton.disabled = true;
  };

  const handleResponse = async (response, assistantBubble) => {
    let currentResponse = response;
    let activeBubble = assistantBubble;

    while (true) {
      const reply = currentResponse?.reply?.trim() ?? "";
      const toolCalls = currentResponse?.toolCalls ?? [];
      const thinking = currentResponse?.thinking ?? "";

      if (!reply && toolCalls.length === 0) {
        finalizeAssistantBubble(activeBubble, "No response returned.");
        return;
      }

      if (reply) {
        updateAssistantBubble(activeBubble, reply, thinking);
      } else {
        updateAssistantBubble(
          activeBubble,
          "Received tool calls. Review details below.",
          thinking,
        );
      }

      chatHistory.push({
        role: "assistant",
        content: reply,
        tool_calls: toolCalls,
      });

      if (toolCalls.length === 0) {
        return;
      }

      renderToolCalls(toolCalls);

      const multipleChoiceCall = toolCalls.find(
        (toolCall) => toolCall.function?.name === "ask_multiple_choice",
      );
      const nonChoiceCalls = toolCalls.filter(
        (toolCall) => toolCall.function?.name !== "ask_multiple_choice",
      );

      if (nonChoiceCalls.length > 0) {
        const toolMessages = await runToolCalls(nonChoiceCalls);
        toolMessages.forEach((toolMessage) => {
          chatHistory.push(toolMessage);
          const isError =
            typeof toolMessage.content === "string" &&
            toolMessage.content.toLowerCase().startsWith("error");
          updateToolCardResult(toolMessage.tool_call_id, toolMessage.content);
          updateToolCardStatus(
            toolMessage.tool_call_id,
            isError ? "error" : "complete",
          );
        });
      }

      if (multipleChoiceCall) {
        const payload = parseToolPayload(multipleChoiceCall);
        if (payload.error) {
          const errorMessage = {
            role: "tool",
            content: payload.error,
            tool_call_id: multipleChoiceCall.id,
          };
          chatHistory.push(errorMessage);
          updateToolCardResult(multipleChoiceCall.id, payload.error);
          updateToolCardStatus(multipleChoiceCall.id, "error");
        } else {
          renderMultipleChoice(multipleChoiceCall, payload);
          return;
        }
      }

      activeBubble = createAssistantBubble();
      const { data } = await sendMessages(chatHistory, {
        allowFallback: false,
        onStreamUpdate: ({ content, thinking }) => {
          updateAssistantBubble(activeBubble, content, thinking);
        },
      });
      currentResponse = data;
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

  const resetConversation = () => {
    chatHistory.length = 0;
    messages.innerHTML = "";
    toolCards.clear();
    clearPendingChoice();
    setStatus("Ready to connect");
    input.value = "";
    input.style.height = "auto";
    input.focus();
  };

  newChatButton.addEventListener("click", () => {
    if (isSending) {
      return;
    }
    resetConversation();
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
    activeServerUrl = normalized;
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

    try {
      updateSaveStatus("Fetching project IDs...");
      const { data } = await fetchProjectIds(accessKey, secretKey);
      if (data?.error) {
        throw new Error(data.error);
      }
      storedProjectIds = Array.isArray(data?.entries) ? data.entries : [];
      await storageSet({
        [PROJECT_IDS_STORAGE_KEY]: JSON.stringify(storedProjectIds),
      });

      if (storedProjectIds.length === 0) {
        updateSaveStatus("No project IDs found. Check your AK/SK.");
      } else {
        updateSaveStatus("Saved", true);
      }
    } catch (error) {
      storedProjectIds = [];
      await storageSet({ [PROJECT_IDS_STORAGE_KEY]: JSON.stringify([]) });
      updateSaveStatus(
        error instanceof Error
          ? error.message
          : "Unable to fetch project IDs.",
      );
    } finally {
      saveButton.disabled = false;
    }
  });

  const resizeInput = () => {
    input.style.height = "auto";
    const maxHeight = 120;
    const nextHeight = Math.min(input.scrollHeight, maxHeight);
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > maxHeight ? "auto" : "hidden";
  };

  input.addEventListener("input", () => {
    resizeInput();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSending || pendingChoice) {
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
    resizeInput();
    input.focus();

    const assistantBubble = createAssistantBubble();

    try {
      isSending = true;
      sendButton.disabled = true;
      setStatus("Connecting to server...", "loading");

      const { data, usedFallback, serverUrl } = await sendMessages(
        chatHistory,
        {
          allowFallback: true,
          onStreamUpdate: ({ content, thinking }) => {
            updateAssistantBubble(assistantBubble, content, thinking);
          },
        },
      );
      activeServerUrl = serverUrl;
      await handleResponse(data, assistantBubble);
      setStatus(
        usedFallback ? "Connected (HTTP fallback)" : "Connected",
        "success",
      );
    } catch (error) {
      finalizeAssistantBubble(
        assistantBubble,
        error instanceof Error ? error.message : "Unable to reach server.",
      );
      setStatus("Connection failed", "error");
    } finally {
      isSending = false;
      sendButton.disabled = false;
    }
  });

  const setInferenceMode = (mode) => {
    inferenceMode = mode;
    inferenceDefaultButton.classList.toggle(
      "hwc-chat-toggle-option-active",
      mode === "default",
    );
    inferenceCustomButton.classList.toggle(
      "hwc-chat-toggle-option-active",
      mode === "custom",
    );
    inferenceFields.style.display = mode === "custom" ? "flex" : "none";
    storageSet({ [INFERENCE_MODE_STORAGE_KEY]: mode });
  };

  const updateInferenceSettings = () => {
    inferenceSettings = {
      baseUrl: inferenceBaseUrlInput.value.trim(),
      model: inferenceModelInput.value.trim(),
      apiKey: inferenceApiKeyInput.value.trim(),
    };
    storageSet({
      [INFERENCE_SETTINGS_STORAGE_KEY]: JSON.stringify(inferenceSettings),
    });
  };

  inferenceDefaultButton.addEventListener("click", () => {
    setInferenceMode("default");
  });

  inferenceCustomButton.addEventListener("click", () => {
    setInferenceMode("custom");
  });

  [inferenceBaseUrlInput, inferenceModelInput, inferenceApiKeyInput].forEach(
    (field) => {
      field.addEventListener("input", updateInferenceSettings);
    },
  );

  storageGet([
    "accessKey",
    "secretKey",
    "serverUrl",
    PROJECT_IDS_STORAGE_KEY,
    INFERENCE_MODE_STORAGE_KEY,
    INFERENCE_SETTINGS_STORAGE_KEY,
  ]).then((values) => {
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
    if (typeof values[PROJECT_IDS_STORAGE_KEY] === "string") {
      try {
        const parsed = JSON.parse(values[PROJECT_IDS_STORAGE_KEY]);
        if (Array.isArray(parsed)) {
          storedProjectIds = parsed;
        }
      } catch {
        storedProjectIds = [];
      }
    }
    if (typeof values[INFERENCE_MODE_STORAGE_KEY] === "string") {
      inferenceMode = values[INFERENCE_MODE_STORAGE_KEY] === "custom" ? "custom" : "default";
    }
    if (typeof values[INFERENCE_SETTINGS_STORAGE_KEY] === "string") {
      try {
        const parsed = JSON.parse(values[INFERENCE_SETTINGS_STORAGE_KEY]);
        inferenceSettings = {
          baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : "",
          model: typeof parsed.model === "string" ? parsed.model : "",
          apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
        };
      } catch {
        inferenceSettings = { baseUrl: "", model: "", apiKey: "" };
      }
    }
    inferenceBaseUrlInput.value = inferenceSettings.baseUrl;
    inferenceModelInput.value = inferenceSettings.model;
    inferenceApiKeyInput.value = inferenceSettings.apiKey;
    setInferenceMode(inferenceMode);
    activeServerUrl = serverUrlInput.value;
    updateSaveButton();
  });
}
