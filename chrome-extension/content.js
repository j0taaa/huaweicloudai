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
  const chatHistory = [];
  let isSending = false;
  let pendingChoice = null;
  let pendingChoiceForm = null;
  let activeServerUrl = DEFAULT_SERVER_URL;
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
    messages.scrollTop = messages.scrollHeight;
    return bubble;
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
    messages.scrollTop = messages.scrollHeight;
  };

  const updateAssistantBubble = (bubble, text) => {
    bubble.innerHTML = `<div class="hwc-chat-markdown">${renderMarkdown(
      text,
    )}</div>`;
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

  const sendMessages = async (messagesToSend, { allowFallback = true } = {}) => {
    const trimmedAccessKey = accessKeyInput.value.trim();
    const trimmedSecretKey = secretKeyInput.value.trim();
    const serverUrl = normalizeServerUrl(activeServerUrl);
    const payload = {
      messages: [...messagesToSend],
      context: {
        accessKey: trimmedAccessKey,
        secretKey: trimmedSecretKey,
      },
    };

    try {
      const data = await requestServer(serverUrl, "/api/chat", payload);
      return { data, usedFallback: false, serverUrl };
    } catch (error) {
      if (allowFallback && /^https:\/\//i.test(serverUrl)) {
        const fallbackUrl = serverUrl.replace(/^https:\/\//i, "http://");
        const data = await requestServer(fallbackUrl, "/api/chat", payload);
        serverUrlInput.value = fallbackUrl;
        activeServerUrl = fallbackUrl;
        storageSet({ serverUrl: fallbackUrl });
        return { data, usedFallback: true, serverUrl: fallbackUrl };
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
    messages.scrollTop = messages.scrollHeight;

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

      const assistantBubble = renderBubble("assistant", "Thinking...");

      try {
        const { data } = await sendMessages(chatHistory, {
          allowFallback: false,
        });
        await handleResponse(data, assistantBubble);
        setStatus("Connected", "success");
      } catch (error) {
        assistantBubble.textContent =
          error instanceof Error
            ? error.message
            : "Unable to reach server.";
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

      if (!reply && toolCalls.length === 0) {
        activeBubble.textContent = "No response returned.";
        return;
      }

      if (reply) {
        updateAssistantBubble(activeBubble, reply);
      } else {
        activeBubble.textContent = "Received tool calls. Review details below.";
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

      activeBubble = renderBubble("assistant", "Thinking...");
      const { data } = await sendMessages(chatHistory, { allowFallback: false });
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

    updateSaveStatus("Saved", true);
    saveButton.disabled = false;
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

    const assistantBubble = renderBubble("assistant", "Thinking...");

    try {
      isSending = true;
      sendButton.disabled = true;
      setStatus("Connecting to server...", "loading");

      const { data, usedFallback, serverUrl } = await sendMessages(
        chatHistory,
        {
          allowFallback: true,
        },
      );
      activeServerUrl = serverUrl;
      await handleResponse(data, assistantBubble);
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
    activeServerUrl = serverUrlInput.value;
    updateSaveButton();
  });
}
