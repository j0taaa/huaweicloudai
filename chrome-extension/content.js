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
        <path
          d="M7.5 18.5c-2 0-3.5-1.5-3.5-3.5V8.5C4 6.5 5.5 5 7.5 5h9c2 0 3.5 1.5 3.5 3.5V15c0 2-1.5 3.5-3.5 3.5h-4.2l-2.8 2c-.8.6-1.8 0-1.8-1v-1.5H7.5z"
          fill="currentColor"
        />
        <path
          d="M9.2 9.8l.5 1.2 1.3.4-1 .9.3 1.3-1.1-.7-1.1.7.3-1.3-1-.9 1.3-.4.5-1.2zm5.6-1.8l.6 1.5 1.6.5-1.2 1.1.4 1.6-1.4-.9-1.4.9.4-1.6-1.2-1.1 1.6-.5.6-1.5z"
          fill="#e0f2fe"
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
  sendButton.className = "hwc-chat-send";
  const sendIconMarkup = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  `;
  const stopIconMarkup = `
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  `;

  form.append(input, sendButton);
  panel.append(header, credentials, messages, form);

  const resizeDirections = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  const resizeHandles = resizeDirections.map((direction) => {
    const handle = document.createElement("div");
    handle.className = "hwc-chat-resize-handle";
    handle.dataset.direction = direction;
    return handle;
  });
  panel.append(...resizeHandles);
  widget.append(toggleButton, panel);
  document.body.append(widget);

  widget.style.right = "auto";
  widget.style.left = "16px";
  widget.style.top = "16px";

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
  const CREDENTIALS_STORAGE_KEY = "huaweicloudai-credentials";
  const PROJECT_IDS_STORAGE_KEY = "projectIds";
  const INFERENCE_MODE_STORAGE_KEY = "inferenceMode";
  const INFERENCE_SETTINGS_STORAGE_KEY = "inferenceSettings";
  const WIDGET_POSITION_STORAGE_KEY = "widgetPosition";
  const DEV_MODE_STORAGE_KEY = "huaweicloudai-dev-mode";
  const chatHistory = [];
  let isSending = false;
  let hasRunningToolCalls = false;
  let pendingChoice = null;
  let pendingChoiceForm = null;
  let activeServerUrl = DEFAULT_SERVER_URL;
  let storedProjectIds = [];
  let inferenceMode = "default";
  let isDevMode = false;
  let inferenceSettings = {
    baseUrl: "",
    model: "",
    apiKey: "",
  };
  const toolCards = new Map();
  let activeAbortController = null;
  let activeRequestId = 0;
  let activeAssistantBubble = null;
  let skipToggleClick = false;

  const clampValue = (value, min, max) => Math.min(Math.max(value, min), max);
  const widgetPadding = 24;
  const getPanelConstraints = () => {
    const style = window.getComputedStyle(panel);
    return {
      minWidth: Number.parseFloat(style.minWidth) || 260,
      minHeight: Number.parseFloat(style.minHeight) || 360,
    };
  };
  const setWidgetPosition = ({ left, top }) => {
    widget.style.left = `${left}px`;
    widget.style.top = `${top}px`;
  };
  const getWidgetPosition = () => {
    const rect = widget.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  };
  const saveWidgetPosition = () =>
    storageSet({
      [WIDGET_POSITION_STORAGE_KEY]: JSON.stringify(getWidgetPosition()),
    });
  const setPanelOffset = (offset) => {
    panel.style.setProperty("--hwc-panel-offset", `${offset}px`);
  };
  const updatePanelOffset = () => {
    if (panel.classList.contains("hwc-chat-hidden")) {
      setPanelOffset(0);
      return;
    }
    setPanelOffset(0);
    const panelRect = panel.getBoundingClientRect();
    const minOffset = widgetPadding - panelRect.left;
    const maxOffset = window.innerWidth - widgetPadding - panelRect.right;
    const lowerBound = Math.min(minOffset, maxOffset);
    const upperBound = Math.max(minOffset, maxOffset);
    const offset = clampValue(0, lowerBound, upperBound);
    setPanelOffset(offset);
  };
  const positionWidgetToRight = () => {
    const widgetRect = widget.getBoundingClientRect();
    const left = Math.max(
      widgetPadding,
      window.innerWidth - widgetRect.width - widgetPadding,
    );
    setWidgetPosition({ left, top: widgetPadding });
  };
  const ensureWidgetOnScreen = ({ preserveHorizontal = false } = {}) => {
    const widgetRect = widget.getBoundingClientRect();
    let left = widgetRect.left;
    let top = widgetRect.top;
    if (!preserveHorizontal) {
      left = clampValue(
        left,
        widgetPadding,
        window.innerWidth - widgetRect.width - widgetPadding,
      );
    }
    top = clampValue(
      top,
      widgetPadding,
      window.innerHeight - widgetRect.height - widgetPadding,
    );
    setWidgetPosition({ left, top });
  };

  window.addEventListener("resize", () => {
    ensureWidgetOnScreen();
    updatePanelOffset();
  });

  let activeResize = null;
  const handleResizeMove = (event) => {
    if (!activeResize) {
      return;
    }
    const { direction, startX, startY, startRect, minWidth, minHeight } =
      activeResize;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    const padding = 16;
    const maxWidth = window.innerWidth - padding * 2;
    const maxHeight = window.innerHeight - padding * 2;
    const startRight = startRect.right;
    const startBottom = startRect.bottom;
    let newWidth = startRect.width;
    let newHeight = startRect.height;
    let newLeft = startRect.left;
    let newTop = startRect.top;

    if (direction.includes("e")) {
      newWidth = startRect.width + deltaX;
    }
    if (direction.includes("s")) {
      newHeight = startRect.height + deltaY;
    }
    if (direction.includes("w")) {
      newWidth = startRect.width - deltaX;
      newLeft = startRight - newWidth;
    }
    if (direction.includes("n")) {
      newHeight = startRect.height - deltaY;
      newTop = startBottom - newHeight;
    }

    newWidth = clampValue(newWidth, minWidth, maxWidth);
    newHeight = clampValue(newHeight, minHeight, maxHeight);

    if (direction.includes("w")) {
      newLeft = startRight - newWidth;
    }
    if (direction.includes("n")) {
      newTop = startBottom - newHeight;
    }

    if (newLeft < padding) {
      newLeft = padding;
      if (direction.includes("w")) {
        newWidth = startRight - newLeft;
      }
    }
    if (newTop < padding) {
      newTop = padding;
      if (direction.includes("n")) {
        newHeight = startBottom - newTop;
      }
    }

    if (newLeft + newWidth > window.innerWidth - padding) {
      if (direction.includes("e")) {
        newWidth = window.innerWidth - padding - newLeft;
      } else {
        newLeft = window.innerWidth - padding - newWidth;
      }
    }

    if (newTop + newHeight > window.innerHeight - padding) {
      if (direction.includes("s")) {
        newHeight = window.innerHeight - padding - newTop;
      } else {
        newTop = window.innerHeight - padding - newHeight;
      }
    }

    panel.style.width = `${newWidth}px`;
    panel.style.height = `${newHeight}px`;
    setWidgetPosition({ left: newLeft, top: newTop });
    updatePanelOffset();
  };
  const stopResize = () => {
    if (activeResize) {
      saveWidgetPosition();
    }
    activeResize = null;
    window.removeEventListener("pointermove", handleResizeMove);
    window.removeEventListener("pointerup", stopResize);
  };
  const startResize = (event) => {
    event.preventDefault();
    const direction = event.currentTarget.dataset.direction;
    const rect = panel.getBoundingClientRect();
    const { minWidth, minHeight } = getPanelConstraints();
    activeResize = {
      direction,
      startX: event.clientX,
      startY: event.clientY,
      startRect: rect,
      minWidth,
      minHeight,
    };
    window.addEventListener("pointermove", handleResizeMove);
    window.addEventListener("pointerup", stopResize);
  };
  resizeHandles.forEach((handle) => {
    handle.addEventListener("pointerdown", startResize);
  });

  let dragState = null;
  const handleToggleMove = (event) => {
    if (!dragState) {
      return;
    }
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 3) {
      skipToggleClick = true;
    }
    const widgetRect = widget.getBoundingClientRect();
    const left = clampValue(
      dragState.startLeft + deltaX,
      widgetPadding,
      window.innerWidth - widgetRect.width - widgetPadding,
    );
    const top = clampValue(
      dragState.startTop + deltaY,
      widgetPadding,
      window.innerHeight - widgetRect.height - widgetPadding,
    );
    setWidgetPosition({ left, top });
  };
  const stopToggleMove = () => {
    if (dragState) {
      saveWidgetPosition();
    }
    dragState = null;
    window.removeEventListener("pointermove", handleToggleMove);
    window.removeEventListener("pointerup", stopToggleMove);
  };
  toggleButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const rect = widget.getBoundingClientRect();
    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
    };
    skipToggleClick = false;
    window.addEventListener("pointermove", handleToggleMove);
    window.addEventListener("pointerup", stopToggleMove);
  });

  const updateFormState = () => {
    const isBusy = isSending || hasRunningToolCalls;
    const hasText = Boolean(input.value.trim());
    input.disabled = Boolean(pendingChoice);
    sendButton.disabled = (!isBusy && !hasText) || Boolean(pendingChoice);
    sendButton.type = isBusy ? "button" : "submit";
    sendButton.setAttribute(
      "aria-label",
      isBusy ? "Cancel response" : "Send message",
    );
    sendButton.innerHTML = isBusy ? stopIconMarkup : sendIconMarkup;
  };

  const startRequest = () => {
    activeRequestId += 1;
    if (activeAbortController) {
      activeAbortController.abort();
    }
    activeAbortController = new AbortController();
    return { requestId: activeRequestId, signal: activeAbortController.signal };
  };

  const cancelActiveRequest = () => {
    if (!isSending && !hasRunningToolCalls) {
      return;
    }
    if (activeAbortController) {
      activeAbortController.abort();
    }
    activeRequestId += 1;
    isSending = false;
    hasRunningToolCalls = false;
    if (activeAssistantBubble) {
      finalizeAssistantBubble(activeAssistantBubble, "Response stopped.");
      activeAssistantBubble = null;
    }
    setStatus("Stopped", "neutral");
    updateFormState();
  };

  updateFormState();

  const updateSaveButton = () => {
    const hasValues =
      accessKeyInput.value.trim() && secretKeyInput.value.trim();
    saveButton.disabled = !hasValues;
  };

  const updateSaveStatus = (message, isSuccess = false) => {
    saveStatus.textContent = message;
    saveStatus.dataset.state = isSuccess ? "success" : "neutral";
  };

  const persistCredentials = async (accessKey, secretKey, projectIds) => {
    await storageSet({
      accessKey,
      secretKey,
      [PROJECT_IDS_STORAGE_KEY]: projectIds,
      [CREDENTIALS_STORAGE_KEY]: JSON.stringify({
        accessKey,
        secretKey,
        projectIds,
      }),
    });
  };

  const setStatus = (message, state = "neutral") => {
    status.textContent = message;
    status.dataset.state = state;
  };

  const setDevMode = (enabled) => {
    isDevMode = enabled;
    storageSet({ [DEV_MODE_STORAGE_KEY]: enabled ? "true" : "false" });
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

  const parseChartData = (rawChartData) => {
    try {
      const parsed = JSON.parse(rawChartData);
      if (!Array.isArray(parsed)) {
        return null;
      }

      const normalizedData = parsed
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }

          const label = entry.label;
          const value = entry.value;
          const numericValue =
            typeof value === "number"
              ? value
              : typeof value === "string"
                ? Number(value)
                : Number.NaN;

          if (typeof label !== "string" || !Number.isFinite(numericValue)) {
            return null;
          }

          return {
            label: label.trim(),
            value: numericValue,
          };
        })
        .filter((entry) => Boolean(entry && entry.label.length > 0));

      return normalizedData.length > 0 ? normalizedData : null;
    } catch {
      return null;
    }
  };

  const renderChartBlock = (data) => {
    const maxValue = Math.max(...data.map((entry) => entry.value), 0);
    const formatter = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
    });

    const bars = data
      .map((entry, index) => {
        const heightPercent =
          maxValue > 0 ? Math.max((entry.value / maxValue) * 100, 0) : 0;
        const formattedValue = formatter.format(entry.value);
        const safeLabel = escapeHtml(entry.label);
        const safeTitle = escapeHtml(`${entry.label}: ${formattedValue}`);

        return `
          <div class="hwc-chat-chart-block__item" data-index="${index}">
            <span class="hwc-chat-chart-block__value">${formattedValue}</span>
            <div class="hwc-chat-chart-block__bar-wrap">
              <div
                class="hwc-chat-chart-block__bar"
                style="height: ${heightPercent}%;"
                title="${safeTitle}"
              ></div>
            </div>
            <span class="hwc-chat-chart-block__label">${safeLabel}</span>
          </div>
        `;
      })
      .join("");

    return `<div class="hwc-chat-chart-block"><div class="hwc-chat-chart-block__bars">${bars}</div></div>`;
  };

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
        .map((item) => {
          if (list.type === "task") {
            const checkedAttribute = item.checked ? " checked" : "";
            return `<li class="hwc-chat-task-item"><input type="checkbox" disabled${checkedAttribute} /><span>${renderInlineMarkdown(item.text)}</span></li>`;
          }
          return `<li>${renderInlineMarkdown(item)}</li>`;
        })
        .join("");
      const listTag = list.type === "task" ? "ul" : list.type;
      const listClass = list.type === "task" ? ' class="hwc-chat-task-list"' : "";
      blocks.push(`<${listTag}${listClass}>${items}</${listTag}>`);
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

      const taskMatch = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/);
      if (taskMatch) {
        flushParagraph();
        if (!list || list.type !== "task") {
          flushList();
          list = { type: "task", items: [] };
        }
        list.items.push({ checked: taskMatch[1].toLowerCase() === "x", text: taskMatch[2] });
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

  const renderAssistantMessageContent = (content) => {
    const chartBlockPattern = /```chart\s*([\s\S]*?)```/g;
    const blocks = [];
    let lastIndex = 0;
    let match = chartBlockPattern.exec(content);

    while (match) {
      const markdownContent = content.slice(lastIndex, match.index).trim();
      if (markdownContent) {
        blocks.push(renderMarkdown(markdownContent));
      }

      const rawChartData = (match[1] || "").trim();
      const chartData = parseChartData(rawChartData);

      if (chartData) {
        blocks.push(renderChartBlock(chartData));
      } else {
        blocks.push(renderMarkdown(`\`\`\`chart\n${rawChartData}\n\`\`\``));
      }

      lastIndex = chartBlockPattern.lastIndex;
      match = chartBlockPattern.exec(content);
    }

    const remainingContent = content.slice(lastIndex).trim();
    if (remainingContent) {
      blocks.push(renderMarkdown(remainingContent));
    }

    return blocks.length > 0 ? blocks.join("") : renderMarkdown(content);
  };

  const renderBubble = (role, text, { markdown = false } = {}) => {
    const bubble = document.createElement("div");
    bubble.className = `hwc-chat-bubble hwc-chat-bubble-${role}`;
    if (markdown) {
      bubble.innerHTML = `<div class="hwc-chat-markdown">${renderAssistantMessageContent(
        text,
      )}</div>`;
    } else {
      bubble.textContent = text;
    }
    messages.append(bubble);
    scrollToBottomIfNeeded();
    return bubble;
  };

  const renderThinkingBubble = (label = "Thinking...") => {
    const bubble = document.createElement("div");
    bubble.className =
      "hwc-chat-bubble hwc-chat-bubble-assistant hwc-chat-bubble-thinking";
    bubble.innerHTML = `
      <span class="hwc-chat-thinking-spinner" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    `;
    messages.append(bubble);
    scrollToBottomIfNeeded();
    return bubble;
  };

  const updateThinkingBubble = (bubble, label) => {
    if (!bubble) {
      return;
    }

    bubble.classList.add("hwc-chat-bubble-thinking");
    bubble.textContent = "";

    const spinner = document.createElement("span");
    spinner.className = "hwc-chat-thinking-spinner";
    spinner.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.textContent = label;

    bubble.append(spinner, text);
  };

  const finalizeAssistantBubble = (bubble, text) => {
    bubble.classList.remove("hwc-chat-bubble-thinking");
    bubble.textContent = text;
  };

  const parseToolArguments = (toolCall) => {
    const rawArgs = toolCall?.function?.arguments ?? "";
    if (!rawArgs) {
      return { parsed: null, raw: "" };
    }

    try {
      return { parsed: JSON.parse(rawArgs), raw: rawArgs };
    } catch {
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

    const normalizedTitle =
      typeof payload.title === "string" && payload.title.trim().length > 0
        ? payload.title.trim()
        : undefined;

    if (toolCall.function?.name === "eval_code") {
      if (!payload.code) {
        return { error: "Error: No code provided for eval_code." };
      }
      return { title: normalizedTitle, code: payload.code };
    }

    if (toolCall.function?.name === "ask_multiple_choice") {
      if (!payload.question || !Array.isArray(payload.options)) {
        return { error: "Error: Invalid payload for ask_multiple_choice." };
      }
      return { title: normalizedTitle, question: payload.question, options: payload.options };
    }

    if (toolCall.function?.name === "get_all_apis") {
      if (!payload.productShort) {
        return { error: "Error: productShort is required for get_all_apis." };
      }
      return { title: normalizedTitle, productShort: payload.productShort, regionId: payload.regionId };
    }

    if (toolCall.function?.name === "get_api_details") {
      if (!payload.productShort || !payload.action) {
        return { error: "Error: productShort and action are required for get_api_details." };
      }
      return { title: normalizedTitle, productShort: payload.productShort, action: payload.action, regionId: payload.regionId };
    }

    if (toolCall.function?.name === "search_rag_docs") {
      if (!payload.query) {
        return { error: "Error: query is required for search_rag_docs." };
      }

      return {
        title: normalizedTitle,
        query: payload.query,
        product: payload.product,
        top_k: payload.top_k,
      };
    }

    if (toolCall.function?.name === "create_sub_agent") {
      if (!payload.task) {
        return { error: "Error: task is required for create_sub_agent." };
      }

      return { title: normalizedTitle, task: payload.task };
    }

    if (toolCall.function?.name === "wait") {
      if (typeof payload.seconds !== "number" || !Number.isFinite(payload.seconds)) {
        return { error: "Error: seconds must be a finite number for wait." };
      }

      return { title: normalizedTitle, seconds: payload.seconds };
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

    if (payload.title) {
      return payload.title;
    }

    if (toolCall.function.name === "ask_multiple_choice") {
      return payload.question
        ? `Asks the user: ${payload.question}`
        : "Requests a multiple choice response.";
    }

    if (toolCall.function.name === "eval_code") {
      return payload.code ? "Runs the provided code snippet." : "Runs code.";
    }

    if (toolCall.function.name === "get_all_apis") {
      return payload.productShort ? `Lists all APIs for ${payload.productShort} service.` : "Lists all APIs for a service.";
    }

    if (toolCall.function.name === "get_api_details") {
      return payload.productShort && payload.action ? `Gets details for ${payload.productShort} API: ${payload.action}.` : "Gets API details.";
    }

    if (toolCall.function.name === "search_rag_docs") {
      return payload.query
        ? `Searches RAG docs for: ${payload.query}`
        : "Searches RAG documentation.";
    }

    if (toolCall.function.name === "create_sub_agent") {
      return payload.task
        ? `Creates a focused sub-agent to complete: ${payload.task.slice(0, 180)}${payload.task.length > 180 ? "..." : ""}`
        : "Creates a focused sub-agent task.";
    }

    if (toolCall.function.name === "wait") {
      return typeof payload.seconds === "number"
        ? `Waits for ${payload.seconds} second${payload.seconds === 1 ? "" : "s"}.`
        : "Waits before continuing.";
    }

    return "Runs a tool with the provided arguments.";
  };

  const formatToolName = (name) => {
    const displayNameMap = {
      eval_code: "Evaluate code",
      search_rag_docs: "Search RAG docs",
      get_all_apis: "List APIs",
      get_api_details: "API details",
      ask_multiple_choice: "Ask multiple choice",
      create_sub_agent: "Create sub-agent",
      wait: "Wait",
    };

    if (displayNameMap[name]) {
      return displayNameMap[name];
    }

    return name
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const getToolCallTitle = (toolCall) => {
    const payload = parseToolPayload(toolCall);
    if (payload && typeof payload.title === "string" && payload.title.trim()) {
      return payload.title.trim();
    }

    return formatToolName(toolCall.function?.name || "Tool call");
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

  const updateToolCardSubAgentSteps = (toolCallId, steps) => {
    const card = toolCards.get(toolCallId);
    if (!card || !card.subAgentStepsContainer || !card.subAgentStepsEmpty) {
      return;
    }

    card.subAgentStepsContainer.textContent = "";

    if (!Array.isArray(steps) || steps.length === 0) {
      card.subAgentStepsEmpty.hidden = false;
      return;
    }

    card.subAgentStepsEmpty.hidden = true;

    steps.forEach((step, index) => {
      const item = document.createElement("article");
      item.className = "hwc-chat-subagent-step";

      const topRow = document.createElement("div");
      topRow.className = "hwc-chat-subagent-step-top";

      const indexBadge = document.createElement("span");
      indexBadge.className = "hwc-chat-subagent-step-index";
      indexBadge.textContent = `${index + 1}`;

      const type = document.createElement("p");
      type.className = "hwc-chat-subagent-step-type";
      type.textContent = String(step?.type || "step").replace(/_/g, " ");

      const detail = document.createElement("p");
      detail.className = "hwc-chat-subagent-step-detail";
      detail.textContent = String(step?.detail || "No detail available.");

      topRow.append(indexBadge, type);
      item.append(topRow, detail);
      card.subAgentStepsContainer.append(item);
    });
  };

  const createToolCallCard = (toolCall) => {
    const card = document.createElement("div");
    card.className = "hwc-chat-tool-card";

    const headerRow = document.createElement("div");
    headerRow.className = "hwc-chat-tool-header";

    const headerMeta = document.createElement("div");
    headerMeta.className = "hwc-chat-tool-meta";

    const name = document.createElement("p");
    name.className = "hwc-chat-tool-name";
    name.textContent = parseToolPayload(toolCall).title || formatToolName(toolCall.function?.name || "Tool call");

    headerMeta.append(name);

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

    let subAgentStepsContainer = null;
    let subAgentStepsEmpty = null;

    if (toolCall.function?.name === "create_sub_agent") {
      const subAgentWrap = document.createElement("div");
      subAgentWrap.className = "hwc-chat-subagent-steps";

      const subAgentLabel = document.createElement("p");
      subAgentLabel.className = "hwc-chat-tool-details-label";
      subAgentLabel.textContent = "Sub-agent timeline";

      subAgentStepsEmpty = document.createElement("p");
      subAgentStepsEmpty.className = "hwc-chat-subagent-empty";
      subAgentStepsEmpty.textContent = "The sub-agent has not produced user-visible steps yet.";

      subAgentStepsContainer = document.createElement("div");
      subAgentStepsContainer.className = "hwc-chat-subagent-step-list";

      subAgentWrap.append(subAgentLabel, subAgentStepsEmpty, subAgentStepsContainer);
      details.append(summary, detailsLabel, pre, subAgentWrap, resultLabel, resultPre);
    } else {
      details.append(summary, detailsLabel, pre, resultLabel, resultPre);
    }
    card.append(headerRow, details);

    toolCards.set(toolCall.id, {
      statusBadge,
      statusText,
      spinner,
      details,
      resultPre,
      subAgentStepsContainer,
      subAgentStepsEmpty,
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

    return card;
  };

  const updateToolCallGroupView = (group) => {
    if (!group.groupLabel || !group.prevButton || !group.nextButton) {
      return;
    }

    group.groupLabel.textContent = `Tool calls ${group.activeIndex + 1} of ${group.cards.length}`;
    group.prevButton.disabled = group.activeIndex === 0;
    group.nextButton.disabled = group.activeIndex === group.cards.length - 1;

    group.cards.forEach((card, index) => {
      card.classList.toggle("hwc-chat-tool-card-hidden", index !== group.activeIndex);
    });
  };

  const renderToolCalls = (toolCalls, existingGroup = null) => {
    if (!toolCalls.length) {
      return existingGroup;
    }

    const group =
      existingGroup ?? {
        container: document.createElement("div"),
        cards: [],
        activeIndex: 0,
        groupHeader: null,
        groupLabel: null,
        nav: null,
        prevButton: null,
        nextButton: null,
      };

    if (!existingGroup) {
      group.container.className = "hwc-chat-tool-calls";
      messages.append(group.container);
    }

    toolCalls.forEach((toolCall) => {
      const card = createToolCallCard(toolCall);
      group.cards.push(card);
      group.container.append(card);
    });

    const hasMultipleCalls = group.cards.length > 1;

    if (hasMultipleCalls && !group.groupHeader) {
      group.groupHeader = document.createElement("div");
      group.groupHeader.className = "hwc-chat-tool-group-header";

      group.groupLabel = document.createElement("p");
      group.groupLabel.className = "hwc-chat-tool-group-label";

      group.nav = document.createElement("div");
      group.nav.className = "hwc-chat-tool-group-nav";

      group.prevButton = document.createElement("button");
      group.prevButton.type = "button";
      group.prevButton.className = "hwc-chat-tool-group-button";
      group.prevButton.textContent = "‹";
      group.prevButton.setAttribute("aria-label", "Show previous tool call");

      group.nextButton = document.createElement("button");
      group.nextButton.type = "button";
      group.nextButton.className = "hwc-chat-tool-group-button";
      group.nextButton.textContent = "›";
      group.nextButton.setAttribute("aria-label", "Show next tool call");

      group.prevButton.addEventListener("click", () => {
        if (group.activeIndex > 0) {
          group.activeIndex -= 1;
          updateToolCallGroupView(group);
        }
      });

      group.nextButton.addEventListener("click", () => {
        if (group.activeIndex < group.cards.length - 1) {
          group.activeIndex += 1;
          updateToolCallGroupView(group);
        }
      });

      group.nav.append(group.prevButton, group.nextButton);
      group.groupHeader.append(group.groupLabel, group.nav);
      group.container.prepend(group.groupHeader);
    }

    group.activeIndex = group.cards.length - 1;
    group.cards.forEach((card, index) => {
      card.classList.toggle("hwc-chat-tool-card-grouped", hasMultipleCalls);
      card.classList.toggle(
        "hwc-chat-tool-card-hidden",
        hasMultipleCalls && index !== group.activeIndex,
      );
    });

    updateToolCallGroupView(group);
    scrollToBottomIfNeeded();
    return group;
  };

  const updateAssistantBubble = (bubble, text) => {
    bubble.classList.remove("hwc-chat-bubble-thinking");
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
    } catch {
      return DEFAULT_SERVER_URL;
    }
  };

  const requestServer = async (serverUrl, endpoint, payload, { signal } = {}) => {
    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function"
    ) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error("Request cancelled."));
          return;
        }
        let settled = false;
        const handleAbort = () => {
          if (settled) {
            return;
          }
          settled = true;
          reject(new Error("Request cancelled."));
        };
        if (signal) {
          signal.addEventListener("abort", handleAbort, { once: true });
        }
        chrome.runtime.sendMessage(
          { type: "hwc-chat-request", serverUrl, endpoint, payload },
          (response) => {
            if (settled) {
              return;
            }
            settled = true;
            if (signal) {
              signal.removeEventListener("abort", handleAbort);
            }
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
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Server error.");
    }

    return response.json();
  };

  const sendMessages = async (
    messagesToSend,
    { allowFallback = true, signal } = {},
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

    try {
      const data = await requestServer(serverUrl, "/api/chat", payload, {
        signal,
      });
      return { data, usedFallback: false, serverUrl };
    } catch (error) {
      if (error instanceof Error && error.message === "Request cancelled.") {
        throw error;
      }
      if (allowFallback && /^https:\/\//i.test(serverUrl)) {
        const fallbackUrl = serverUrl.replace(/^https:\/\//i, "http://");
        const data = await requestServer(fallbackUrl, "/api/chat", payload, {
          signal,
        });
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

  const executeGetAllApisTool = async (toolCall, { signal } = {}) => {
    const payload = parseToolPayload(toolCall);
    if (payload.error) {
      return {
        role: "tool",
        content: payload.error,
        tool_call_id: toolCall.id,
      };
    }

    try {
      const data = await requestServer(
        activeServerUrl,
        "/api/get-all-apis",
        { productShort: payload.productShort, regionId: payload.regionId },
        { signal },
      );
      const contentValue = data?.error ?? data?.result ?? "No result returned from server.";
      const content = typeof contentValue === "string" ? contentValue : JSON.stringify(contentValue, null, 2);
      return {
        role: "tool",
        content,
        tool_call_id: toolCall.id,
      };
    } catch (error) {
      return {
        role: "tool",
        content: `Error executing get_all_apis: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
        tool_call_id: toolCall.id,
      };
    }
  };

  const executeGetApiDetailsTool = async (toolCall, { signal } = {}) => {
    const payload = parseToolPayload(toolCall);
    if (payload.error) {
      return {
        role: "tool",
        content: payload.error,
        tool_call_id: toolCall.id,
      };
    }

    try {
      const data = await requestServer(
        activeServerUrl,
        "/api/get-api-details",
        { productShort: payload.productShort, action: payload.action, regionId: payload.regionId },
        { signal },
      );
      const contentValue = data?.error ?? data?.result ?? "No result returned from server.";
      const content = typeof contentValue === "string" ? contentValue : JSON.stringify(contentValue, null, 2);
      return {
        role: "tool",
        content,
        tool_call_id: toolCall.id,
      };
    } catch (error) {
      return {
        role: "tool",
        content: `Error executing get_api_details: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
        tool_call_id: toolCall.id,
      };
    }
  };

  const executeEvalTool = async (toolCall, { signal } = {}) => {
    const payload = parseToolPayload(toolCall);
    if (payload.error) {
      return {
        role: "tool",
        content: payload.error,
        tool_call_id: toolCall.id,
      };
    }

    try {
      const data = await requestServer(
        activeServerUrl,
        "/api/eval",
        { code: payload.code },
        { signal },
      );
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

  const executeSearchRagTool = async (toolCall, { signal } = {}) => {
    const payload = parseToolPayload(toolCall);
    if (payload.error) {
      return {
        role: "tool",
        content: payload.error,
        tool_call_id: toolCall.id,
      };
    }

    try {
      const data = await requestServer(
        activeServerUrl,
        "/api/search-rag",
        {
          query: payload.query,
          product: payload.product,
          top_k: payload.top_k ?? 3,
        },
        { signal },
      );

      if (data?.error) {
        return {
          role: "tool",
          content: `RAG search failed: ${data.error}`,
          tool_call_id: toolCall.id,
        };
      }

      if (!data?.results || data.results.length === 0) {
        return {
          role: "tool",
          content: `No relevant documents found for query "${payload.query}" (threshold: ${data?.threshold ?? 55}%). Try rephrasing or removing the product filter.`,
          tool_call_id: toolCall.id,
        };
      }

      const formattedResults = data.results
        .map(
          (result, index) =>
            `[${index + 1}] ${result.title} (${result.product}) - Relevance: ${(result.similarity * 100).toFixed(1)}%\nSource: ${result.source}\n${result.snippet.slice(0, 800)}${result.snippet.length > 800 ? "..." : ""}`,
        )
        .join("\n\n---\n\n");

      return {
        role: "tool",
        content: `Found ${data.results.length} relevant documents from ${data.totalDocs ?? "unknown"} total (query time: ${data.queryTime ?? "unknown"}ms, threshold: ${((data.threshold ?? 0.55) * 100).toFixed(0)}%):\n\n${formattedResults}`,
        tool_call_id: toolCall.id,
      };
    } catch (error) {
      return {
        role: "tool",
        content: `Error searching RAG: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
        tool_call_id: toolCall.id,
      };
    }
  };

  const executeCreateSubAgentTool = async (toolCall, { signal } = {}) => {
    const payload = parseToolPayload(toolCall);
    if (payload.error || !payload.task) {
      return {
        role: "tool",
        content: payload.error || "Error: task is required for create_sub_agent.",
        tool_call_id: toolCall.id,
      };
    }

    try {
      const data = await requestServer(
        activeServerUrl,
        "/api/sub-agent",
        {
          task: payload.task,
          mainMessages: [...chatHistory],
          context: {
            accessKey: accessKeyInput.value.trim(),
            secretKey: secretKeyInput.value.trim(),
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
        },
        { signal },
      );

      const subAgentSteps = Array.isArray(data?.steps) ? data.steps : [];
      updateToolCardSubAgentSteps(toolCall.id, subAgentSteps);

      const resultText =
        data?.result?.trim() || data?.error || "Sub-agent completed with no result.";

      return {
        role: "tool",
        content: `Sub-agent result (${data?.mode || "unknown"}):\n${resultText}`,
        tool_call_id: toolCall.id,
      };
    } catch (error) {
      updateToolCardSubAgentSteps(toolCall.id, []);
      return {
        role: "tool",
        content: `Error creating sub-agent: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
        tool_call_id: toolCall.id,
      };
    }
  };

  const executeWaitTool = async (toolCall, { signal } = {}) => {
    const payload = parseToolPayload(toolCall);
    if (payload.error || typeof payload.seconds !== "number") {
      return {
        role: "tool",
        content: payload.error || "Error: seconds is required for wait.",
        tool_call_id: toolCall.id,
      };
    }

    try {
      const data = await requestServer(
        activeServerUrl,
        "/api/wait",
        { seconds: payload.seconds },
        { signal },
      );
      return {
        role: "tool",
        content: data?.error ?? data?.result ?? "Wait completed.",
        tool_call_id: toolCall.id,
      };
    } catch (error) {
      return {
        role: "tool",
        content: `Error executing wait: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
        tool_call_id: toolCall.id,
      };
    }
  };

  const runToolCalls = async (toolCalls, { signal } = {}) => {
    return Promise.all(
      toolCalls.map(async (toolCall) => {
        if (toolCall.function?.name === "eval_code") {
          return executeEvalTool(toolCall, { signal });
        }

        if (toolCall.function?.name === "get_all_apis") {
          return executeGetAllApisTool(toolCall, { signal });
        }

        if (toolCall.function?.name === "get_api_details") {
          return executeGetApiDetailsTool(toolCall, { signal });
        }

        if (toolCall.function?.name === "search_rag_docs") {
          return executeSearchRagTool(toolCall, { signal });
        }

        if (toolCall.function?.name === "create_sub_agent") {
          return executeCreateSubAgentTool(toolCall, { signal });
        }

        if (toolCall.function?.name === "wait") {
          return executeWaitTool(toolCall, { signal });
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
    updateFormState();
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

      const { requestId, signal } = startRequest();
      isSending = true;
      updateFormState();
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

      const assistantBubble = renderThinkingBubble();
      activeAssistantBubble = assistantBubble;

      try {
        const { data } = await sendMessages(chatHistory, {
          allowFallback: false,
          signal,
        });
        if (requestId !== activeRequestId) {
          return;
        }
        await handleResponse(data, assistantBubble, requestId);
        setStatus("Connected", "success");
      } catch (error) {
        if (requestId !== activeRequestId) {
          return;
        }
        if (error instanceof Error && error.message === "Request cancelled.") {
          return;
        }
        finalizeAssistantBubble(
          assistantBubble,
          error instanceof Error ? error.message : "Unable to reach server.",
        );
        setStatus("Connection failed", "error");
      } finally {
        if (requestId === activeRequestId) {
          isSending = false;
          activeAssistantBubble = null;
          updateFormState();
        }
      }
    });

    pendingChoiceForm = form;
    pendingChoice = { toolCall, payload };
    updateFormState();
  };

  const handleResponse = async (response, assistantBubble, requestId) => {
    let currentResponse = response;
    let activeBubble = assistantBubble;
    let activeToolCallGroup = null;

    while (true) {
      if (requestId !== activeRequestId) {
        return;
      }
      const reply = currentResponse?.reply?.trim() ?? "";
      const toolCalls = currentResponse?.toolCalls ?? [];

      if (!reply && toolCalls.length === 0) {
        finalizeAssistantBubble(activeBubble, "No response returned.");
        return;
      }

      if (reply) {
        updateAssistantBubble(activeBubble, reply);
      } else if (toolCalls.length === 0 || isDevMode) {
        activeBubble.remove();
      }

      chatHistory.push({
        role: "assistant",
        content: reply,
        tool_calls: toolCalls,
      });

      if (toolCalls.length === 0) {
        return;
      }

      if (isDevMode) {
        activeToolCallGroup = renderToolCalls(toolCalls, activeToolCallGroup);
      }

      const multipleChoiceCall = toolCalls.find(
        (toolCall) => toolCall.function?.name === "ask_multiple_choice",
      );
      const nonChoiceCalls = toolCalls.filter(
        (toolCall) => toolCall.function?.name !== "ask_multiple_choice",
      );

      if (!isDevMode && toolCalls.length > 0) {
        const latestToolCall = toolCalls[toolCalls.length - 1];
        updateThinkingBubble(activeBubble, getToolCallTitle(latestToolCall));
      }

      if (nonChoiceCalls.length > 0) {
        hasRunningToolCalls = true;
        updateFormState();
        const toolMessages = await runToolCalls(nonChoiceCalls, {
          signal: activeAbortController?.signal,
        });
        if (requestId !== activeRequestId) {
          return;
        }
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
        hasRunningToolCalls = false;
        updateFormState();
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
          if (!reply && activeBubble) {
            activeBubble.remove();
          }
          renderMultipleChoice(multipleChoiceCall, payload);
          return;
        }
      }

      if (!activeBubble || !activeBubble.isConnected) {
        activeBubble = renderThinkingBubble();
      } else {
        updateThinkingBubble(activeBubble, "Thinking...");
      }
      const { data } = await sendMessages(chatHistory, {
        allowFallback: false,
        signal: activeAbortController?.signal,
      });
      currentResponse = data;
    }
  };

  toggleButton.addEventListener("click", () => {
    if (skipToggleClick) {
      skipToggleClick = false;
      return;
    }
    const buttonRect = toggleButton.getBoundingClientRect();
    panel.classList.toggle("hwc-chat-hidden");
    const isOpen = !panel.classList.contains("hwc-chat-hidden");
    toggleButton.setAttribute("aria-expanded", `${isOpen}`);
    requestAnimationFrame(() => {
      const newButtonRect = toggleButton.getBoundingClientRect();
      const widgetRect = widget.getBoundingClientRect();
      const left = widgetRect.left + (buttonRect.left - newButtonRect.left);
      const top = widgetRect.top + (buttonRect.top - newButtonRect.top);
      setWidgetPosition({ left, top });
      updatePanelOffset();
      ensureWidgetOnScreen({ preserveHorizontal: true });
      saveWidgetPosition();
      if (isOpen) {
        input.focus();
      }
    });
  });

  const resetConversation = () => {
    chatHistory.length = 0;
    messages.innerHTML = "";
    toolCards.clear();
    clearPendingChoice();
    hasRunningToolCalls = false;
    isSending = false;
    setStatus("Ready to connect");
    input.value = "";
    input.style.height = "auto";
    input.focus();
    updateFormState();
  };

  newChatButton.addEventListener("click", () => {
    if (isSending || hasRunningToolCalls) {
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

    await persistCredentials(accessKey, secretKey, storedProjectIds);

    try {
      updateSaveStatus("Fetching project IDs...");
      const { data } = await fetchProjectIds(accessKey, secretKey);
      if (data?.error) {
        throw new Error(data.error);
      }
      storedProjectIds = Array.isArray(data?.entries) ? data.entries : [];
      await persistCredentials(accessKey, secretKey, storedProjectIds);

      if (storedProjectIds.length === 0) {
        updateSaveStatus("No project IDs found. Check your AK/SK.");
      } else {
        updateSaveStatus("Saved", true);
      }
    } catch (error) {
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
    updateFormState();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  sendButton.addEventListener("click", (event) => {
    if (isSending || hasRunningToolCalls) {
      event.preventDefault();
      cancelActiveRequest();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSending || hasRunningToolCalls || pendingChoice) {
      return;
    }

    const value = input.value.trim();
    if (!value) {
      return;
    }

    if (value.toLowerCase() === "dev") {
      setDevMode(!isDevMode);
      input.value = "";
      resizeInput();
      input.focus();
      return;
    }

    const userMessage = { role: "user", content: value };
    chatHistory.push(userMessage);
    renderBubble("user", value);
    input.value = "";
    resizeInput();
    input.focus();

    const assistantBubble = renderThinkingBubble();
    activeAssistantBubble = assistantBubble;
    const { requestId, signal } = startRequest();

    try {
      isSending = true;
      updateFormState();
      setStatus("Connecting to server...", "loading");

      const { data, usedFallback, serverUrl } = await sendMessages(
        chatHistory,
        {
          allowFallback: true,
          signal,
        },
      );
      if (requestId !== activeRequestId) {
        return;
      }
      activeServerUrl = serverUrl;
      await handleResponse(data, assistantBubble, requestId);
      setStatus(
        usedFallback ? "Connected (HTTP fallback)" : "Connected",
        "success",
      );
    } catch (error) {
      if (requestId !== activeRequestId) {
        return;
      }
      if (error instanceof Error && error.message === "Request cancelled.") {
        return;
      }
      finalizeAssistantBubble(
        assistantBubble,
        error instanceof Error ? error.message : "Unable to reach server.",
      );
      setStatus("Connection failed", "error");
    } finally {
      if (requestId === activeRequestId) {
        isSending = false;
        activeAssistantBubble = null;
        updateFormState();
      }
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
    CREDENTIALS_STORAGE_KEY,
    "accessKey",
    "secretKey",
    "serverUrl",
    PROJECT_IDS_STORAGE_KEY,
    INFERENCE_MODE_STORAGE_KEY,
    INFERENCE_SETTINGS_STORAGE_KEY,
    WIDGET_POSITION_STORAGE_KEY,
    DEV_MODE_STORAGE_KEY,
  ]).then((values) => {
    if (typeof values[CREDENTIALS_STORAGE_KEY] === "string") {
      try {
        const parsed = JSON.parse(values[CREDENTIALS_STORAGE_KEY]);
        if (typeof parsed?.accessKey === "string") {
          accessKeyInput.value = parsed.accessKey;
        }
        if (typeof parsed?.secretKey === "string") {
          secretKeyInput.value = parsed.secretKey;
        }
        if (Array.isArray(parsed?.projectIds)) {
          storedProjectIds = parsed.projectIds;
        }
      } catch {
        // Ignore invalid serialized credentials.
      }
    }

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
    if (Array.isArray(values[PROJECT_IDS_STORAGE_KEY])) {
      storedProjectIds = values[PROJECT_IDS_STORAGE_KEY];
    } else if (typeof values[PROJECT_IDS_STORAGE_KEY] === "string") {
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

    if (values[DEV_MODE_STORAGE_KEY] === "true") {
      isDevMode = true;
    }
    let restoredWidgetPosition = false;
    if (typeof values[WIDGET_POSITION_STORAGE_KEY] === "string") {
      try {
        const parsed = JSON.parse(values[WIDGET_POSITION_STORAGE_KEY]);
        if (
          typeof parsed?.left === "number" &&
          typeof parsed?.top === "number"
        ) {
          setWidgetPosition({ left: parsed.left, top: parsed.top });
          restoredWidgetPosition = true;
        }
      } catch {
        restoredWidgetPosition = false;
      }
    }
    if (!restoredWidgetPosition) {
      positionWidgetToRight();
    }
    inferenceBaseUrlInput.value = inferenceSettings.baseUrl;
    inferenceModelInput.value = inferenceSettings.model;
    inferenceApiKeyInput.value = inferenceSettings.apiKey;
    setInferenceMode(inferenceMode);
    setDevMode(isDevMode);
    activeServerUrl = serverUrlInput.value;
    updateSaveButton();
    ensureWidgetOnScreen();
    updatePanelOffset();
    saveWidgetPosition();
  });
}
