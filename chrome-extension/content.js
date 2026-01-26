const WIDGET_ID = "hwc-chat-widget";

const existingWidget = document.getElementById(WIDGET_ID);
if (!existingWidget) {
  const widget = document.createElement("div");
  widget.id = WIDGET_ID;
  widget.className = "hwc-chat-widget";

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "hwc-chat-toggle";
  toggleButton.textContent = "Chat";

  const panel = document.createElement("div");
  panel.className = "hwc-chat-panel hwc-chat-hidden";

  const header = document.createElement("div");
  header.className = "hwc-chat-header";
  header.textContent = "Current conversation";

  const messages = document.createElement("div");
  messages.className = "hwc-chat-messages";

  const form = document.createElement("form");
  form.className = "hwc-chat-form";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "hwc-chat-input";
  input.placeholder = "Type a message...";

  const sendButton = document.createElement("button");
  sendButton.type = "submit";
  sendButton.className = "hwc-chat-send";
  sendButton.textContent = "Send";

  form.append(input, sendButton);
  panel.append(header, messages, form);
  widget.append(toggleButton, panel);
  document.body.append(widget);

  toggleButton.addEventListener("click", () => {
    panel.classList.toggle("hwc-chat-hidden");
    if (!panel.classList.contains("hwc-chat-hidden")) {
      input.focus();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) {
      return;
    }

    const bubble = document.createElement("div");
    bubble.className = "hwc-chat-bubble";
    bubble.textContent = value;
    messages.append(bubble);
    messages.scrollTop = messages.scrollHeight;
    input.value = "";
    input.focus();
  });
}
