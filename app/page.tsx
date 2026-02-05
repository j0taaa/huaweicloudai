"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type ChatResponse = {
  reply?: string;
  toolCalls?: ToolCall[];
};

type ToolPayload = {
  code?: string;
  question?: string;
  options?: string[];
  productShort?: string;
  action?: string;
  regionId?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  sessionId?: string;
  command?: string;
  appendNewline?: boolean;
  maxChars?: number;
  clear?: boolean;
  error?: string;
  query?: string;
  product?: string;
  top_k?: number;
};

type ToolPreview = {
  id: string;
  name: string;
  code: string;
  summary: string;
};

type ProjectIdEntry = {
  region: string;
  projectId: string;
  name?: string;
};

type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
  lastSummaryMessageCount: number;
  compactionSummary: string | null;
  compactedAt: number | null;
  compactionMessageCount: number;
};

const STORAGE_KEY = "huaweicloudai-conversations";
const ACTIVE_STORAGE_KEY = "huaweicloudai-active-conversation";
const CREDENTIALS_STORAGE_KEY = "huaweicloudai-credentials";
const PROJECT_IDS_STORAGE_KEY = "huaweicloudai-project-ids";
const PENDING_REQUEST_STORAGE_KEY = "huaweicloudai-pending-request";
const INFERENCE_MODE_STORAGE_KEY = "huaweicloudai-inference-mode";
const INFERENCE_SETTINGS_STORAGE_KEY = "huaweicloudai-inference-settings";
const TOOL_RESULT_COLLAPSE_THRESHOLD = 900;
const TOOL_RESULT_COLLAPSE_LINES = 16;
const INPUT_MIN_HEIGHT = 48;
const INPUT_MAX_HEIGHT = 220;
const SCROLL_BOTTOM_THRESHOLD = 48;
const COMPACTION_MARKER_PREFIX = "Conversation compacted";
const estimateTokens = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
};
const createConversationId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `conversation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const createEmptyConversation = (): Conversation => ({
  id: createConversationId(),
  title: "New conversation",
  messages: [],
  updatedAt: Date.now(),
  lastSummaryMessageCount: 0,
  compactionSummary: null,
  compactedAt: null,
  compactionMessageCount: 0,
});

const isCompactionMarkerMessage = (message: ChatMessage) =>
  message.role === "system" &&
  message.content.trim().startsWith(COMPACTION_MARKER_PREFIX);

const createCompactionMarkerMessage = (timestamp: number): ChatMessage => ({
  role: "system",
  content: `${COMPACTION_MARKER_PREFIX} on ${new Date(
    timestamp,
  ).toLocaleString()}.`,
});

const buildModelMessages = (conversation: Conversation): ChatMessage[] => {
  const messages = conversation.messages;
  if (!conversation.compactionSummary) {
    return messages.filter((message) => !isCompactionMarkerMessage(message));
  }

  const summaryMessage: ChatMessage = {
    role: "system",
    content: conversation.compactionSummary,
  };
  const startIndex = Math.min(
    Math.max(conversation.compactionMessageCount, 0),
    messages.length,
  );
  const compactedMessages = messages
    .slice(startIndex)
    .filter((message) => !isCompactionMarkerMessage(message));

  return [summaryMessage, ...compactedMessages];
};

const normalizeConversation = (conversation: Partial<Conversation>): Conversation => ({
  id: typeof conversation.id === "string" ? conversation.id : createConversationId(),
  title:
    typeof conversation.title === "string"
      ? conversation.title
      : "New conversation",
  messages: Array.isArray(conversation.messages) ? conversation.messages : [],
  updatedAt: typeof conversation.updatedAt === "number" ? conversation.updatedAt : Date.now(),
  lastSummaryMessageCount:
    typeof conversation.lastSummaryMessageCount === "number"
      ? conversation.lastSummaryMessageCount
      : 0,
  compactionSummary:
    typeof conversation.compactionSummary === "string"
      ? conversation.compactionSummary
      : null,
  compactedAt:
    typeof conversation.compactedAt === "number" ? conversation.compactedAt : null,
  compactionMessageCount:
    typeof conversation.compactionMessageCount === "number"
      ? conversation.compactionMessageCount
      : 0,
});

const fetchProjectIds = async (ak: string, sk: string) => {
  const response = await fetch("/api/project-ids", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessKey: ak, secretKey: sk }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Unable to fetch Huawei Cloud projects.");
  }

  const data = (await response.json()) as {
    entries?: ProjectIdEntry[];
    errors?: string[];
    error?: string;
  };

  if (data.error) {
    throw new Error(data.error);
  }

  return { entries: data.entries ?? [], errors: data.errors ?? [] };
};

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loadingConversationIds, setLoadingConversationIds] = useState<Set<string>>(
    new Set(),
  );
  const [conversationErrors, setConversationErrors] = useState<
    Record<string, string | null>
  >({});
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [credentialStatus, setCredentialStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [projectIds, setProjectIds] = useState<ProjectIdEntry[]>([]);
  const [projectIdError, setProjectIdError] = useState<string | null>(null);
  const [projectIdsOpen, setProjectIdsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inferenceMode, setInferenceMode] = useState<"default" | "custom">(
    "default",
  );
  const [customInference, setCustomInference] = useState({
    baseUrl: "",
    model: "",
    apiKey: "",
  });
  const [activeToolPreview, setActiveToolPreview] =
    useState<ToolPreview | null>(null);
  const [pendingChoice, setPendingChoice] = useState<{
    toolCall: ToolCall;
    question: string;
    options: string[];
  } | null>(null);
  const [compactMenuOpen, setCompactMenuOpen] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState("");
  const [customChoice, setCustomChoice] = useState("");
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const formRef = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const compactMenuRef = useRef<HTMLDivElement | null>(null);
  const summaryInFlightRef = useRef<Set<string>>(new Set());
  const compactionInFlightRef = useRef<Set<string>>(new Set());
  const credentialHydratedRef = useRef(false);
  const credentialResetSkipRef = useRef(true);
  const pendingResumeRef = useRef(false);
  const inferenceHydratedRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);

  const activeConversation = useMemo(() => {
    if (!activeConversationId) return null;
    return (
      conversations.find((conversation) => conversation.id === activeConversationId) ??
      null
    );
  }, [activeConversationId, conversations]);
  const messages = activeConversation?.messages ?? [];
  const input = activeConversationId ? drafts[activeConversationId] ?? "" : "";
  const error =
    activeConversationId ? conversationErrors[activeConversationId] ?? null : null;
  const isLoading = activeConversationId
    ? loadingConversationIds.has(activeConversationId)
    : false;
  const tokenFormatter = useMemo(() => new Intl.NumberFormat(), []);
  const isCompacting = activeConversationId
    ? compactionInFlightRef.current.has(activeConversationId)
    : false;
  const estimatedTokenCount = useMemo(() => {
    if (!activeConversation) return 0;
    return buildModelMessages(activeConversation).reduce(
      (total, message) => total + estimateTokens(message.content),
      0,
    );
  }, [activeConversation]);
  const tokenCountLabel = activeConversation?.compactionSummary
    ? "Tokens used (compacted)"
    : "Tokens used";

  const setConversationError = (conversationId: string, message: string | null) => {
    setConversationErrors((prev) => ({ ...prev, [conversationId]: message }));
  };

  const clearConversationError = (conversationId: string) => {
    setConversationErrors((prev) => {
      if (!(conversationId in prev)) return prev;
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
  };

  const markConversationLoading = (conversationId: string) => {
    setLoadingConversationIds((prev) => {
      const next = new Set(prev);
      next.add(conversationId);
      return next;
    });
  };

  const clearConversationLoading = (conversationId: string) => {
    setLoadingConversationIds((prev) => {
      const next = new Set(prev);
      next.delete(conversationId);
      return next;
    });
  };

  const clearPendingRequestForConversation = (conversationId: string) => {
    const pending = localStorage.getItem(PENDING_REQUEST_STORAGE_KEY);
    if (!pending) return;
    try {
      const parsed = JSON.parse(pending) as { conversationId?: string };
      if (parsed.conversationId === conversationId) {
        localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
      }
    } catch {
      localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
    }
  };

  const updateDraft = (conversationId: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [conversationId]: value }));
  };

  const clearDraft = (conversationId: string) => {
    setDrafts((prev) => {
      if (!(conversationId in prev)) return prev;
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
  };

  const trimmedInput = useMemo(() => input.trim(), [input]);
  const toolResults = useMemo(() => {
    const results = new Map<string, string>();

    messages.forEach((message) => {
      if (message.role === "tool" && message.tool_call_id) {
        results.set(message.tool_call_id, message.content);
      }
    });

    return results;
  }, [messages]);
  const hasRunningToolCalls = useMemo(() => {
    return messages.some(
      (message) =>
        message.role === "assistant" &&
        message.tool_calls?.some((toolCall) => !toolResults.has(toolCall.id)),
    );
  }, [messages, toolResults]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    const nextHeight = Math.min(
      INPUT_MAX_HEIGHT,
      Math.max(INPUT_MIN_HEIGHT, scrollHeight),
    );
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      scrollHeight > INPUT_MAX_HEIGHT ? "auto" : "hidden";
  }, [input]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const updateAutoScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      shouldAutoScrollRef.current = distanceFromBottom <= SCROLL_BOTTOM_THRESHOLD;
    };

    updateAutoScroll();
    container.addEventListener("scroll", updateAutoScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", updateAutoScroll);
    };
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !shouldAutoScrollRef.current) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, isLoading, pendingChoice, hasRunningToolCalls]);

  useEffect(() => {
    if (!compactMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!compactMenuRef.current) return;
      if (!compactMenuRef.current.contains(event.target as Node)) {
        setCompactMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [compactMenuOpen]);

  useEffect(() => {
    if (isLoading || hasRunningToolCalls || pendingChoice) {
      setCompactMenuOpen(false);
    }
  }, [hasRunningToolCalls, isLoading, pendingChoice]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const storedActive = localStorage.getItem(ACTIVE_STORAGE_KEY);
    const storedCredentials = localStorage.getItem(CREDENTIALS_STORAGE_KEY);
    const storedProjectIds = localStorage.getItem(PROJECT_IDS_STORAGE_KEY);
    const storedInferenceMode = localStorage.getItem(INFERENCE_MODE_STORAGE_KEY);
    const storedInferenceSettings = localStorage.getItem(
      INFERENCE_SETTINGS_STORAGE_KEY,
    );

    let hydratedProjectIds = false;

    if (storedCredentials) {
      try {
        const parsed = JSON.parse(storedCredentials) as {
          accessKey?: string;
          secretKey?: string;
          projectIds?: ProjectIdEntry[];
        };
        if (typeof parsed.accessKey === "string") {
          setAccessKey(parsed.accessKey);
        }
        if (typeof parsed.secretKey === "string") {
          setSecretKey(parsed.secretKey);
        }
        if (Array.isArray(parsed.projectIds)) {
          setProjectIds(parsed.projectIds);
          hydratedProjectIds = true;
          if (parsed.projectIds.length > 0) {
            setCredentialStatus("saved");
          }
        }
      } catch {
        // Ignore invalid stored credentials.
      }
    }

    if (storedProjectIds && !hydratedProjectIds) {
      try {
        const parsed = JSON.parse(storedProjectIds) as ProjectIdEntry[];
        if (Array.isArray(parsed)) {
          setProjectIds(parsed);
          if (parsed.length > 0) {
            setCredentialStatus("saved");
          }
        }
      } catch {
        // Ignore invalid stored project IDs.
      }
    }
    credentialHydratedRef.current = true;

    if (storedInferenceMode === "custom") {
      setInferenceMode("custom");
    }

    if (storedInferenceSettings) {
      try {
        const parsed = JSON.parse(storedInferenceSettings) as {
          baseUrl?: string;
          model?: string;
          apiKey?: string;
        };
        setCustomInference({
          baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : "",
          model: typeof parsed.model === "string" ? parsed.model : "",
          apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
        });
      } catch {
        // Ignore invalid inference settings.
      }
    }
    inferenceHydratedRef.current = true;

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Conversation[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = parsed.map((conversation) =>
            normalizeConversation(conversation),
          );
          setConversations(normalized);
          const activeId = normalized.find((conv) => conv.id === storedActive)
            ? storedActive
            : normalized[0].id;
          setActiveConversationId(activeId);
          return;
        }
      } catch {
        // Ignore storage parse errors and seed a new conversation.
      }
    }

    const seed = createEmptyConversation();
    setConversations([seed]);
    setActiveConversationId(seed.id);
  }, []);

  useEffect(() => {
    if (conversations.length === 0) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    if (!activeConversationId) return;
    localStorage.setItem(ACTIVE_STORAGE_KEY, activeConversationId);
  }, [activeConversationId]);

  useEffect(() => {
    if (!credentialHydratedRef.current) return;
    const hasCredentials = accessKey || secretKey;
    const hasProjectIds = projectIds.length > 0;
    if (hasCredentials || hasProjectIds) {
      localStorage.setItem(
        CREDENTIALS_STORAGE_KEY,
        JSON.stringify({ accessKey, secretKey, projectIds }),
      );
    } else {
      localStorage.removeItem(CREDENTIALS_STORAGE_KEY);
    }
    if (hasProjectIds) {
      localStorage.setItem(PROJECT_IDS_STORAGE_KEY, JSON.stringify(projectIds));
    } else {
      localStorage.removeItem(PROJECT_IDS_STORAGE_KEY);
    }
  }, [accessKey, projectIds, secretKey]);

  useEffect(() => {
    if (
      !credentialHydratedRef.current ||
      pendingResumeRef.current ||
      conversations.length === 0 ||
      pendingChoice
    ) {
      return;
    }

    const storedPending = localStorage.getItem(PENDING_REQUEST_STORAGE_KEY);
    if (!storedPending) {
      pendingResumeRef.current = true;
      return;
    }

    try {
      const parsed = JSON.parse(storedPending) as {
        conversationId?: string;
        messages?: ChatMessage[];
      };

      const conversationId = parsed.conversationId;
      const pendingMessages = Array.isArray(parsed.messages)
        ? (parsed.messages as ChatMessage[])
        : null;

      if (!conversationId || !pendingMessages) {
        localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
        pendingResumeRef.current = true;
        return;
      }

      const pendingConversation = conversations.find(
        (conversation) => conversation.id === conversationId,
      );
      if (!pendingConversation) {
        localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
        pendingResumeRef.current = true;
        return;
      }

      pendingResumeRef.current = true;
      if (activeConversationId !== conversationId) {
        setActiveConversationId(conversationId);
      }

      markConversationLoading(conversationId);
      setConversationError(conversationId, null);

      void sendMessages(conversationId, pendingMessages)
        .then((response) =>
          continueConversation(conversationId, [...pendingMessages], response),
        )
        .catch((caughtError) => {
          const message =
            caughtError instanceof Error
              ? caughtError.message
              : "Something went wrong.";
          setConversationError(conversationId, message);
        })
        .finally(() => {
          clearConversationLoading(conversationId);
          clearPendingRequestForConversation(conversationId);
        });
    } catch {
      localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
      pendingResumeRef.current = true;
    }
  }, [activeConversationId, conversations, pendingChoice]);

  const sendMessages = async (
    conversationId: string,
    nextMessages: ChatMessage[],
  ): Promise<ChatResponse> => {
    const controller = new AbortController();
    const existingController = abortControllersRef.current.get(conversationId);
    if (existingController) {
      existingController.abort();
    }
    abortControllersRef.current.set(conversationId, controller);
    try {
      const conversation =
        conversations.find((item) => item.id === conversationId) ?? null;
      const modelMessages = buildModelMessages(
        conversation
          ? { ...conversation, messages: nextMessages }
          : { ...createEmptyConversation(), messages: nextMessages },
      );
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: modelMessages,
          context: {
            accessKey: accessKey.trim(),
            secretKey: secretKey.trim(),
            projectIds,
          },
          inference:
            inferenceMode === "custom"
              ? {
                  mode: "custom",
                  baseUrl: customInference.baseUrl.trim(),
                  model: customInference.model.trim(),
                  apiKey: customInference.apiKey.trim(),
                }
              : { mode: "default" },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to fetch response.");
      }

      return (await response.json()) as ChatResponse;
    } finally {
      if (abortControllersRef.current.get(conversationId) === controller) {
        abortControllersRef.current.delete(conversationId);
      }
    }
  };

  const parseToolPayload = (toolCall: ToolCall): ToolPayload => {
    let payload: {
      code?: string;
      question?: string;
      options?: string[];
      productShort?: string;
      action?: string;
      regionId?: string;
      host?: string;
      port?: number;
      username?: string;
      password?: string;
      sessionId?: string;
      command?: string;
      appendNewline?: boolean;
      maxChars?: number;
      clear?: boolean;
      query?: string;
      product?: string;
      top_k?: number;
    } = {};

    try {
      payload = JSON.parse(toolCall.function.arguments || "{}") as {
        code?: string;
      };
    } catch (parseError) {
      return {
        error: `Error parsing tool arguments: ${
          parseError instanceof Error ? parseError.message : "Unknown error."
        }`,
      };
    }

    if (toolCall.function.name === "eval_code") {
      if (!payload.code) {
        return {
          error: "Error: No code provided for eval_code.",
        };
      }

      return { code: payload.code };
    }

    if (toolCall.function.name === "ask_multiple_choice") {
      if (!payload.question || !payload.options?.length) {
        return {
          error: "Error: Invalid payload for ask_multiple_choice.",
        };
      }

      return { question: payload.question, options: payload.options };
    }

    if (toolCall.function.name === "get_all_apis") {
      if (!payload.productShort) {
        return {
          error: "Error: productShort is required for get_all_apis.",
        };
      }

      return { productShort: payload.productShort, regionId: payload.regionId };
    }

    if (toolCall.function.name === "get_api_details") {
      if (!payload.productShort || !payload.action) {
        return {
          error: "Error: productShort and action are required for get_api_details.",
        };
      }

      return { productShort: payload.productShort, action: payload.action, regionId: payload.regionId };
    }

    if (toolCall.function.name === "ssh_connect") {
      if (!payload.host || !payload.username || !payload.password) {
        return {
          error: "Error: host, username, and password are required for ssh_connect.",
        };
      }

      return { host: payload.host, port: payload.port, username: payload.username, password: payload.password };
    }

    if (toolCall.function.name === "ssh_send") {
      if (!payload.sessionId || !payload.command) {
        return {
          error: "Error: sessionId and command are required for ssh_send.",
        };
      }

      return { sessionId: payload.sessionId, command: payload.command, appendNewline: payload.appendNewline };
    }

    if (toolCall.function.name === "ssh_read") {
      if (!payload.sessionId) {
        return {
          error: "Error: sessionId is required for ssh_read.",
        };
      }

      return { sessionId: payload.sessionId, maxChars: payload.maxChars, clear: payload.clear };
    }

    if (toolCall.function.name === "ssh_close") {
      if (!payload.sessionId) {
        return {
          error: "Error: sessionId is required for ssh_close.",
        };
      }

      return { sessionId: payload.sessionId };
    }

    if (toolCall.function.name === "search_rag_docs") {
      if (!payload.query) {
        return {
          error: "Error: query is required for search_rag_docs.",
        };
      }

      return {
        query: payload.query,
        product: payload.product,
        top_k: payload.top_k,
      };
    }
    return {
      error: `Error: Unsupported tool payload for ${toolCall.function.name}.`,
    };
  };

  const summarizeCode = (code: string) => {
    const normalized = code.toLowerCase();

    if (normalized.includes("fetch(")) {
      return "Requests data from an API using fetch.";
    }

    if (normalized.includes("document.")) {
      return "Reads from or updates the current page DOM.";
    }

    if (normalized.includes("localstorage")) {
      return "Reads from or writes to browser storage.";
    }

    if (normalized.includes("console.")) {
      return "Logs information to the browser console.";
    }

    return "Runs server-side JavaScript to compute a result.";
  };

  const formatToolResult = async (result: unknown): Promise<string> => {
    if (result instanceof Response) {
      const text = await result.text();
      return text || "[Empty response body]";
    }

    if (typeof result === "string") {
      return result;
    }

    if (result === undefined) {
      return "undefined";
    }

    try {
      return JSON.stringify(result);
    } catch {
      return String(result);
    }
  };

  const executeEvalTool = async (toolCall: ToolCall): Promise<ChatMessage> => {
    const payload = parseToolPayload(toolCall);

    if (payload.error) {
      return {
        role: "tool",
        content: payload.error,
        tool_call_id: toolCall.id,
      };
    }

    try {
      const response = await fetch("/api/eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: payload.code }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          role: "tool",
          content: errorText || "Error executing code on server.",
          tool_call_id: toolCall.id,
        };
      }

      const data = (await response.json()) as { result?: string; error?: string };
      return {
        role: "tool",
        content: data.error ?? data.result ?? "No result returned from server.",
        tool_call_id: toolCall.id,
      };
    } catch (evalError) {
      return {
        role: "tool",
        content: `Error executing eval_code: ${
          evalError instanceof Error ? evalError.message : "Unknown error."
        }`,
        tool_call_id: toolCall.id,
      };
    }
  };

  const executeGetAllApisTool = async (toolCall: ToolCall): Promise<ChatMessage> => {
    const payload = parseToolPayload(toolCall);

    if (payload.error) {
      return {
        role: "tool",
        content: payload.error,
        tool_call_id: toolCall.id,
      };
    }

    try {
      const response = await fetch("/api/get-all-apis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productShort: payload.productShort, regionId: payload.regionId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          role: "tool",
          content: errorText || "Error fetching APIs.",
          tool_call_id: toolCall.id,
        };
      }

      const data = (await response.json()) as { result?: unknown; error?: string };
      const contentValue = data.error ?? data.result ?? "No result returned from server.";
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

  const executeGetApiDetailsTool = async (toolCall: ToolCall): Promise<ChatMessage> => {
    const payload = parseToolPayload(toolCall);

    if (payload.error) {
      return {
        role: "tool",
        content: payload.error,
        tool_call_id: toolCall.id,
      };
    }

    try {
      const response = await fetch("/api/get-api-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productShort: payload.productShort, action: payload.action, regionId: payload.regionId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          role: "tool",
          content: errorText || "Error fetching API details.",
          tool_call_id: toolCall.id,
        };
      }

      const data = (await response.json()) as { result?: unknown; error?: string };
      const contentValue = data.error ?? data.result ?? "No result returned from server.";
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

  const executeSshConnectTool = async (toolCall: ToolCall): Promise<ChatMessage> => {
    const payload = parseToolPayload(toolCall);

    if (payload.error) {
      return {
        role: "tool",
        content: payload.error,
        tool_call_id: toolCall.id,
      };
    }

    try {
      const response = await fetch("/api/ssh/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: payload.host,
          port: payload.port,
          username: payload.username,
          password: payload.password,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          role: "tool",
          content: errorText || "Error establishing SSH session.",
          tool_call_id: toolCall.id,
        };
      }

      const data = (await response.json()) as { sessionId?: string; error?: string };
      return {
        role: "tool",
        content: data.error ?? data.sessionId ?? "No sessionId returned from server.",
        tool_call_id: toolCall.id,
      };
    } catch (error) {
      return {
        role: "tool",
        content: `Error executing ssh_connect: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
        tool_call_id: toolCall.id,
      };
    }
  };

  const executeSshSendTool = async (toolCall: ToolCall): Promise<ChatMessage> => {
    const payload = parseToolPayload(toolCall);

    if (payload.error) {
      return {
        role: "tool",
        content: payload.error,
        tool_call_id: toolCall.id,
      };
    }

    try {
      const response = await fetch("/api/ssh/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: payload.sessionId,
          command: payload.command,
          appendNewline: payload.appendNewline,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          role: "tool",
          content: errorText || "Error sending SSH command.",
          tool_call_id: toolCall.id,
        };
      }

      const data = (await response.json()) as { result?: string; error?: string };
      return {
        role: "tool",
        content: data.error ?? data.result ?? "No result returned from server.",
        tool_call_id: toolCall.id,
      };
    } catch (error) {
      return {
        role: "tool",
        content: `Error executing ssh_send: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
        tool_call_id: toolCall.id,
      };
    }
  };

  const executeSshReadTool = async (toolCall: ToolCall): Promise<ChatMessage> => {
    const payload = parseToolPayload(toolCall);

    if (payload.error) {
      return {
        role: "tool",
        content: payload.error,
        tool_call_id: toolCall.id,
      };
    }

    try {
      const response = await fetch("/api/ssh/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: payload.sessionId,
          maxChars: payload.maxChars,
          clear: payload.clear,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          role: "tool",
          content: errorText || "Error reading SSH output.",
          tool_call_id: toolCall.id,
        };
      }

      const data = (await response.json()) as { output?: string; error?: string };
      return {
        role: "tool",
        content: data.error ?? data.output ?? "No output returned from server.",
        tool_call_id: toolCall.id,
      };
    } catch (error) {
      return {
        role: "tool",
        content: `Error executing ssh_read: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
        tool_call_id: toolCall.id,
      };
    }
  };

  const executeSshCloseTool = async (toolCall: ToolCall): Promise<ChatMessage> => {
    const payload = parseToolPayload(toolCall);

    if (payload.error) {
      return {
        role: "tool",
        content: payload.error,
        tool_call_id: toolCall.id,
      };
    }

    try {
      const response = await fetch("/api/ssh/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: payload.sessionId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          role: "tool",
          content: errorText || "Error closing SSH session.",
          tool_call_id: toolCall.id,
        };
      }

      const data = (await response.json()) as { result?: string; error?: string };
      return {
        role: "tool",
        content: data.error ?? data.result ?? "No result returned from server.",
        tool_call_id: toolCall.id,
      };
    } catch (error) {
      return {
        role: "tool",
        content: `Error executing ssh_close: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
        tool_call_id: toolCall.id,
      };
    }
  };

  const executeSearchRagTool = async (toolCall: ToolCall): Promise<ChatMessage> => {
    const payload = parseToolPayload(toolCall);

    if (payload.error) {
      return {
        role: "tool",
        content: payload.error,
        tool_call_id: toolCall.id,
      };
    }

    try {
      const response = await fetch("/api/search-rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: payload.query,
          product: payload.product,
          top_k: payload.top_k ?? 3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          role: "tool",
          content: errorText || "Error searching RAG.",
          tool_call_id: toolCall.id,
        };
      }

      const data = (await response.json()) as {
        results?: Array<{
          similarity: number;
          snippet: string;
          source: string;
          title: string;
          product: string;
        }>;
        totalDocs?: number;
        queryTime?: number;
        threshold?: number;
        error?: string;
      };

      if (data.error) {
        return {
          role: "tool",
          content: `RAG search failed: ${data.error}`,
          tool_call_id: toolCall.id,
        };
      }

      if (!data.results || data.results.length === 0) {
        return {
          role: "tool",
          content: `No relevant documents found for query "${payload.query}" (threshold: ${data.threshold ?? 55}%). Try rephrasing or removing the product filter.`,
          tool_call_id: toolCall.id,
        };
      }

      // Format results for LLM
      const formattedResults = data.results
        .map(
          (r, i) =>
            `[${i + 1}] ${r.title} (${r.product}) - Relevance: ${(r.similarity * 100).toFixed(1)}%\nSource: ${r.source}\n${r.snippet.slice(0, 800)}${r.snippet.length > 800 ? "..." : ""}`
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
  const runToolCalls = async (toolCalls: ToolCall[]) => {
    return Promise.all(
      toolCalls.map(async (toolCall) => {
        if (toolCall.function.name === "eval_code") {
          return executeEvalTool(toolCall);
        }

        if (toolCall.function.name === "get_all_apis") {
          return executeGetAllApisTool(toolCall);
        }

        if (toolCall.function.name === "get_api_details") {
          return executeGetApiDetailsTool(toolCall);
        }

        if (toolCall.function.name === "ssh_connect") {
          return executeSshConnectTool(toolCall);
        }

        if (toolCall.function.name === "ssh_send") {
          return executeSshSendTool(toolCall);
        }

        if (toolCall.function.name === "ssh_read") {
          return executeSshReadTool(toolCall);
        }

        if (toolCall.function.name === "ssh_close") {
          return executeSshCloseTool(toolCall);
        }

        if (toolCall.function.name === "search_rag_docs") {
          return executeSearchRagTool(toolCall);
        }
        return {
          role: "tool" as const,
          content: `Unsupported tool: ${toolCall.function.name}`,
          tool_call_id: toolCall.id,
        };
      }),
    );
  };

  const continueConversation = async (
    conversationId: string,
    workingMessages: ChatMessage[],
    response: ChatResponse,
  ) => {
    let currentResponse = response;

    while (currentResponse.toolCalls && currentResponse.toolCalls.length > 0) {
      const assistantToolMessage: ChatMessage = {
        role: "assistant",
        content: currentResponse.reply ?? "",
        tool_calls: currentResponse.toolCalls,
      };

      workingMessages = [...workingMessages, assistantToolMessage];
      updateConversationMessages(conversationId, workingMessages);

      const multipleChoiceCall = currentResponse.toolCalls.find(
        (toolCall) => toolCall.function.name === "ask_multiple_choice",
      );
      const nonChoiceCalls = currentResponse.toolCalls.filter(
        (toolCall) => toolCall.function.name !== "ask_multiple_choice",
      );

      if (nonChoiceCalls.length > 0) {
        const toolMessages = await runToolCalls(nonChoiceCalls);
        workingMessages = [...workingMessages, ...toolMessages];
        updateConversationMessages(conversationId, workingMessages);
      }

      if (multipleChoiceCall) {
        const payload = parseToolPayload(multipleChoiceCall);
        if (payload.error) {
          const errorMessage: ChatMessage = {
            role: "tool",
            content: payload.error,
            tool_call_id: multipleChoiceCall.id,
          };
          workingMessages = [...workingMessages, errorMessage];
          updateConversationMessages(conversationId, workingMessages);
        } else if (payload.question && payload.options) {
          setPendingChoice({
            toolCall: multipleChoiceCall,
            question: payload.question,
            options: payload.options,
          });
          clearConversationLoading(conversationId);
          return;
        }
      }

      currentResponse = await sendMessages(conversationId, workingMessages);
    }

    if (!currentResponse.reply) {
      throw new Error("No reply returned from the model.");
    }

    workingMessages = [
      ...workingMessages,
      { role: "assistant", content: currentResponse.reply },
    ];

    updateConversationMessages(conversationId, workingMessages);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedInput || isLoading || pendingChoice || !activeConversationId) {
      return;
    }
    const conversationId = activeConversationId;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: input },
    ];

    updateConversationMessages(conversationId, nextMessages);
    clearDraft(conversationId);
    markConversationLoading(conversationId);
    setConversationError(conversationId, null);
    localStorage.setItem(
      PENDING_REQUEST_STORAGE_KEY,
      JSON.stringify({
        conversationId,
        messages: nextMessages,
      }),
    );

    try {
      const workingMessages = [...nextMessages];
      const response = await sendMessages(conversationId, workingMessages);
      await continueConversation(conversationId, workingMessages, response);
    } catch (caughtError) {
      if (
        caughtError instanceof DOMException &&
        caughtError.name === "AbortError"
      ) {
        setConversationError(conversationId, "Message canceled.");
        return;
      }
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong.";
      setConversationError(conversationId, message);
    } finally {
      clearConversationLoading(conversationId);
      clearPendingRequestForConversation(conversationId);
    }
  };

  const handleCancel = () => {
    if (!activeConversationId) return;
    const controller = abortControllersRef.current.get(activeConversationId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(activeConversationId);
    }
    clearConversationLoading(activeConversationId);
    clearPendingRequestForConversation(activeConversationId);
  };

  useEffect(() => {
    if (!credentialHydratedRef.current) return;
    if (credentialResetSkipRef.current) {
      credentialResetSkipRef.current = false;
      return;
    }
    setCredentialStatus("idle");
    setProjectIds([]);
    setProjectIdError(null);
    localStorage.removeItem(PROJECT_IDS_STORAGE_KEY);
  }, [accessKey, secretKey]);

  useEffect(() => {
    if (!inferenceHydratedRef.current) return;
    localStorage.setItem(INFERENCE_MODE_STORAGE_KEY, inferenceMode);
  }, [inferenceMode]);

  useEffect(() => {
    if (!inferenceHydratedRef.current) return;
    localStorage.setItem(
      INFERENCE_SETTINGS_STORAGE_KEY,
      JSON.stringify(customInference),
    );
  }, [customInference]);

  const handleSaveCredentials = async () => {
    const trimmedAccessKey = accessKey.trim();
    const trimmedSecretKey = secretKey.trim();

    if (!trimmedAccessKey || !trimmedSecretKey) {
      setCredentialStatus("error");
      setProjectIdError("Please enter both the access key and secret key.");
      return;
    }

    setCredentialStatus("saving");
    setProjectIdError(null);

    try {
      const { entries, errors } = await fetchProjectIds(
        trimmedAccessKey,
        trimmedSecretKey,
      );
      setProjectIds(entries);
      if (entries.length === 0) {
        setCredentialStatus("error");
        setProjectIdError(
          "Failed to load any project IDs. Please check your AK/SK."
        );
      } else {
        setCredentialStatus("saved");
        setProjectIdError(null);
        setProjectIdsOpen(true);
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to fetch project IDs.";
      setProjectIds([]);
      setCredentialStatus("error");
      setProjectIdError(message);
    }
  };

  const handleChoiceSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!pendingChoice || isLoading || !activeConversationId) return;
    const conversationId = activeConversationId;

    const isCustom = selectedChoice === "custom";
    const trimmedCustom = customChoice.trim();
    const selectedAnswer = isCustom ? trimmedCustom : selectedChoice;

    if (!selectedAnswer) {
      return;
    }

    markConversationLoading(conversationId);
    setConversationError(conversationId, null);
    setPendingChoice(null);
    setSelectedChoice("");
    setCustomChoice("");

    const toolMessage: ChatMessage = {
      role: "tool",
      content: selectedAnswer,
      tool_call_id: pendingChoice.toolCall.id,
    };

    const workingMessages = [...messages, toolMessage];
    updateConversationMessages(conversationId, workingMessages);
    localStorage.setItem(
      PENDING_REQUEST_STORAGE_KEY,
      JSON.stringify({
        conversationId,
        messages: workingMessages,
      }),
    );

    try {
      const response = await sendMessages(conversationId, workingMessages);
      await continueConversation(conversationId, workingMessages, response);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong.";
      setConversationError(conversationId, message);
    } finally {
      clearConversationLoading(conversationId);
      clearPendingRequestForConversation(conversationId);
    }
  };

  const updateConversationMessages = (
    conversationId: string,
    nextMessages: ChatMessage[],
  ) => {
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              messages: nextMessages,
              updatedAt: Date.now(),
            }
          : conversation,
      ),
    );
  };

  const requestCompactionSummary = async (
    conversationMessages: ChatMessage[],
  ): Promise<string> => {
    const messagesToSummarize = conversationMessages.filter(
      (message) => !isCompactionMarkerMessage(message),
    );

    const compactionPrompt: ChatMessage[] = [
      {
        role: "system",
        content:
          "Summarize the entire conversation while preserving every detail and all key facts. Produce a structured summary suitable for continuing the conversation without information loss.",
      },
      ...messagesToSummarize,
    ];

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: compactionPrompt,
        context: {
          accessKey: accessKey.trim(),
          secretKey: secretKey.trim(),
          projectIds,
        },
        inference:
          inferenceMode === "custom"
            ? {
                mode: "custom",
                baseUrl: customInference.baseUrl.trim(),
                model: customInference.model.trim(),
                apiKey: customInference.apiKey.trim(),
              }
            : { mode: "default" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Unable to compact the conversation.");
    }

    const data = (await response.json()) as ChatResponse;
    const summary = data.reply?.trim();
    if (!summary) {
      throw new Error("Unable to compact the conversation.");
    }

    return summary;
  };

  const handleCompactConversation = async () => {
    if (!activeConversationId || !activeConversation) return;
    if (isLoading || hasRunningToolCalls || pendingChoice) return;
    if (compactionInFlightRef.current.has(activeConversationId)) return;
    const conversationId = activeConversationId;
    compactionInFlightRef.current.add(conversationId);
    setCompactMenuOpen(false);
    markConversationLoading(conversationId);
    setConversationError(conversationId, null);

    try {
      const summary = await requestCompactionSummary(activeConversation.messages);
      const compactedAt = Date.now();
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                messages: [
                  ...conversation.messages,
                  createCompactionMarkerMessage(compactedAt),
                ],
                compactionSummary: summary,
                compactedAt,
                compactionMessageCount: conversation.messages.length,
                updatedAt: Date.now(),
              }
            : conversation,
        ),
      );
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong.";
      setConversationError(conversationId, message);
    } finally {
      compactionInFlightRef.current.delete(conversationId);
      clearConversationLoading(conversationId);
    }
  };

  const handleNewConversation = () => {
    const newConversation = createEmptyConversation();
    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversationId(newConversation.id);
    setConversationError(newConversation.id, null);
    setPendingChoice(null);
    setSelectedChoice("");
    setCustomChoice("");
  };

  const handleDeleteConversation = (conversationId: string) => {
    const controller = abortControllersRef.current.get(conversationId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(conversationId);
    }
    clearConversationLoading(conversationId);
    clearConversationError(conversationId);
    setConversations((prev) => {
      const next = prev.filter((conversation) => conversation.id !== conversationId);
      clearDraft(conversationId);
      if (conversationId === activeConversationId) {
        clearPendingRequestForConversation(conversationId);
      }
      if (next.length === 0) {
        const seed = createEmptyConversation();
        setActiveConversationId(seed.id);
        setConversationError(seed.id, null);
        setPendingChoice(null);
        setSelectedChoice("");
        setCustomChoice("");
        return [seed];
      }
      if (conversationId === activeConversationId) {
        setActiveConversationId(next[0].id);
        setConversationError(next[0].id, null);
        setPendingChoice(null);
        setSelectedChoice("");
        setCustomChoice("");
      }
      return next;
    });
  };

  const requestSummary = async (
    conversationMessages: ChatMessage[],
  ): Promise<string | null> => {
    const firstUserMessage = conversationMessages.find(
      (message) => message.role === "user",
    );

    if (!firstUserMessage) return null;

    const summaryPrompt: ChatMessage[] = [
      {
        role: "system",
        content:
          "Summarize what the model was asked to do. Keep it simple and limited to 5 words. Avoid punctuation.",
      },
      firstUserMessage,
    ];

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: summaryPrompt }),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as ChatResponse;
    if (!data.reply) return null;

    const summary = data.reply.replace(/[".]/g, "").trim();
    if (!summary) return null;

    return summary.length > 48 ? `${summary.slice(0, 45).trim()}...` : summary;
  };

  useEffect(() => {
    if (!activeConversation) return;
    if (isLoading || pendingChoice) return;
    if (activeConversation.messages.length < 2) return;
    if (activeConversation.lastSummaryMessageCount > 0) return;

    const lastMessage =
      activeConversation.messages[activeConversation.messages.length - 1];
    if (lastMessage.role !== "assistant") return;

    if (summaryInFlightRef.current.has(activeConversation.id)) return;
    summaryInFlightRef.current.add(activeConversation.id);

    void requestSummary(activeConversation.messages)
      .then((summary) => {
        if (!summary) return;
        setConversations((prev) =>
          prev.map((conversation) =>
            conversation.id === activeConversation.id
              ? {
                  ...conversation,
                  title: summary,
                  lastSummaryMessageCount: conversation.messages.length,
                }
              : conversation,
          ),
        );
      })
      .finally(() => {
        summaryInFlightRef.current.delete(activeConversation.id);
      });
  }, [activeConversation, isLoading, pendingChoice]);

  useEffect(() => {
    if (!activeConversation) return;
    if (estimatedTokenCount < 100000) return;
    if (isLoading || pendingChoice) return;
    if (compactionInFlightRef.current.has(activeConversation.id)) return;
    if (
      activeConversation.compactionSummary &&
      activeConversation.messages.length <= activeConversation.compactionMessageCount + 1
    ) {
      return;
    }

    compactionInFlightRef.current.add(activeConversation.id);
    markConversationLoading(activeConversation.id);
    setConversationError(activeConversation.id, null);

    void requestCompactionSummary(activeConversation.messages)
      .then((summary) => {
        const compactedAt = Date.now();
        setConversations((prev) =>
          prev.map((conversation) =>
            conversation.id === activeConversation.id
              ? {
                  ...conversation,
                  messages: [
                    ...conversation.messages,
                    createCompactionMarkerMessage(compactedAt),
                  ],
                  compactionSummary: summary,
                  compactedAt,
                  compactionMessageCount: conversation.messages.length,
                  updatedAt: Date.now(),
                }
              : conversation,
          ),
        );
      })
      .catch((caughtError) => {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Something went wrong.";
        setConversationError(activeConversation.id, message);
      })
      .finally(() => {
        compactionInFlightRef.current.delete(activeConversation.id);
        clearConversationLoading(activeConversation.id);
      });
  }, [activeConversation, estimatedTokenCount, isLoading, pendingChoice]);

  return (
    <div className="flex h-dvh w-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50 lg:flex-row">
      {sidebarOpen ? (
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-label="Close conversations"
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-80 max-w-full flex-col gap-4 border-r border-zinc-200 bg-white/95 p-4 shadow-lg backdrop-blur transition-transform duration-200 dark:border-white/10 dark:bg-black/90 lg:static lg:w-72 lg:translate-x-0 lg:shadow-sm ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Conversations
          </h2>
          <button
            className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/30 dark:hover:text-white"
            type="button"
            onClick={() => {
              handleNewConversation();
              setSidebarOpen(false);
            }}
          >
            New
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`flex w-full items-start justify-between gap-3 rounded-2xl border px-3 py-2 text-left text-sm transition ${
                conversation.id === activeConversationId
                  ? "border-zinc-900 bg-zinc-900 text-white shadow-sm dark:border-white/70 dark:bg-white/10"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-white/10 dark:bg-black/40 dark:text-zinc-200"
              }`}
            >
              <button
                className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                type="button"
                onClick={() => {
                  setActiveConversationId(conversation.id);
                  setSidebarOpen(false);
                }}
              >
                <span className="truncate font-semibold">
                  {conversation.title || "New conversation"}
                </span>
                <span
                  className={`truncate text-xs ${
                    conversation.id === activeConversationId
                      ? "text-zinc-200"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  {conversation.messages.length} messages
                </span>
              </button>
              <button
                className={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] transition ${
                  conversation.id === activeConversationId
                    ? "border-white/40 text-white hover:border-white/70"
                    : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/30 dark:hover:text-white"
                }`}
                type="button"
                onClick={() => handleDeleteConversation(conversation.id)}
                aria-label={`Delete ${conversation.title || "conversation"}`}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M6 6l1 14h10l1-14" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-sm dark:border-white/10 dark:bg-black/80">
          <button
            className="flex w-full items-center justify-between text-left text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            type="button"
            onClick={() => setCredentialsOpen((prev) => !prev)}
            aria-expanded={credentialsOpen}
          >
            <span>Huawei Cloud credentials</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {credentialsOpen ? "Hide" : "Show"}
            </span>
          </button>
          {credentialsOpen ? (
            <div className="mt-4 space-y-3">
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                Access Key (AK)
                <input
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-900 shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-white/10 dark:bg-black dark:text-zinc-100 dark:focus:border-white/20 dark:focus:ring-white/10"
                  placeholder="Enter your Huawei Cloud AK"
                  value={accessKey}
                  onChange={(event) => setAccessKey(event.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                Secret Key (SK)
                <input
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-900 shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-white/10 dark:bg-black dark:text-zinc-100 dark:focus:border-white/20 dark:focus:ring-white/10"
                  placeholder="Enter your Huawei Cloud SK"
                  value={secretKey}
                  onChange={(event) => setSecretKey(event.target.value)}
                  autoComplete="off"
                  type="password"
                />
              </label>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                These values are used as context in the system prompt and are
                stored locally in this browser.
              </p>
              <div className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                <button
                  className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white"
                  type="button"
                  onClick={handleSaveCredentials}
                  disabled={
                    credentialStatus === "saving" ||
                    !accessKey.trim() ||
                    !secretKey.trim()
                  }
                >
                  {credentialStatus === "saving"
                    ? "Saving..."
                    : credentialStatus === "saved"
                      ? "Saved"
                      : "Save credentials"}
                </button>
                {credentialStatus === "saved" ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">
                      Project IDs loaded: {projectIds.length}
                    </span>
                    <button
                      className="text-left text-xs text-zinc-600 underline dark:text-zinc-300"
                      type="button"
                      onClick={() => setProjectIdsOpen((prev) => !prev)}
                    >
                      {projectIdsOpen ? "Hide" : "Show"} project IDs
                    </button>
                    {projectIdsOpen ? (
                      <div className="max-h-40 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-white/10 dark:bg-white/5">
                        {projectIds.map((project) => (
                          <div
                            key={project.projectId}
                            className="flex justify-between border-b border-zinc-200 py-1 last:border-0 dark:border-white/10"
                          >
                            <span className="text-zinc-600 dark:text-zinc-300">
                              {project.region}
                            </span>
                            <span className="font-mono text-zinc-900 dark:text-zinc-100">
                              {project.projectId}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {credentialStatus === "error" && projectIdError ? (
                  <span className="text-xs text-red-600 dark:text-red-400">
                    {projectIdError}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-sm dark:border-white/10 dark:bg-black/80">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Inference
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {inferenceMode === "custom" ? "Custom LLM" : "Built-in"}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-full bg-zinc-100 p-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:bg-white/10 dark:text-zinc-300">
            <button
              type="button"
              className={`flex-1 rounded-full px-3 py-1 transition ${
                inferenceMode === "default"
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-black dark:text-white"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
              onClick={() => setInferenceMode("default")}
            >
              Built-in
            </button>
            <button
              type="button"
              className={`flex-1 rounded-full px-3 py-1 transition ${
                inferenceMode === "custom"
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-black dark:text-white"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
              onClick={() => setInferenceMode("custom")}
            >
              Custom
            </button>
          </div>
          {inferenceMode === "custom" ? (
            <div className="mt-4 space-y-3">
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                Base URL
                <input
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-900 shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-white/10 dark:bg-black dark:text-zinc-100 dark:focus:border-white/20 dark:focus:ring-white/10"
                  placeholder="https://openrouter.ai/api/v1"
                  value={customInference.baseUrl}
                  onChange={(event) =>
                    setCustomInference((prev) => ({
                      ...prev,
                      baseUrl: event.target.value,
                    }))
                  }
                  autoComplete="off"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                Model
                <input
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-900 shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-white/10 dark:bg-black dark:text-zinc-100 dark:focus:border-white/20 dark:focus:ring-white/10"
                  placeholder="openrouter/auto"
                  value={customInference.model}
                  onChange={(event) =>
                    setCustomInference((prev) => ({
                      ...prev,
                      model: event.target.value,
                    }))
                  }
                  autoComplete="off"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                API key
                <input
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-900 shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-white/10 dark:bg-black dark:text-zinc-100 dark:focus:border-white/20 dark:focus:ring-white/10"
                  placeholder="Enter your provider key"
                  value={customInference.apiKey}
                  onChange={(event) =>
                    setCustomInference((prev) => ({
                      ...prev,
                      apiKey: event.target.value,
                    }))
                  }
                  autoComplete="off"
                  type="password"
                />
              </label>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                These settings are stored locally and only sent when you choose
                Custom inference.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Uses the built-in GLM 4.7 ZAI coding plan configured on the
              server.
            </p>
          )}
        </div>
      </aside>
      <main className="flex h-full w-full flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/80 lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 shadow-sm transition hover:border-zinc-300 hover:text-zinc-900 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/30 dark:hover:text-white"
            aria-label="Open conversations"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 6h18" />
              <path d="M3 12h18" />
              <path d="M3 18h18" />
            </svg>
          </button>
          <div className="flex flex-1 flex-col items-center">
            <span className="text-sm font-semibold">Huawei Cloud AI</span>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Chat workspace
            </span>
          </div>
          <button
            type="button"
            onClick={handleNewConversation}
            className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/30 dark:hover:text-white"
          >
            New
          </button>
        </header>
        <section className="relative flex h-full flex-1 flex-col gap-6 bg-white px-4 py-5 shadow-sm dark:bg-zinc-950 sm:px-6 sm:py-6">
          <div className="absolute right-4 top-4 rounded-full border border-zinc-200 bg-white/90 px-3 py-1 text-xs font-semibold text-zinc-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/80 dark:text-zinc-300">
            {tokenCountLabel}: {tokenFormatter.format(estimatedTokenCount)}
          </div>
          <div
            className="flex flex-1 flex-col gap-4 overflow-y-auto"
            ref={messagesContainerRef}
          >
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
                  Getting started
                </p>
                <h3 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-white">
                  Learn how to use this Huawei Cloud assistant
                </h3>
                <ol className="mt-4 flex flex-col gap-3">
                  <li>
                    <span className="font-semibold text-zinc-900 dark:text-white">
                      1. Add your AK/SK credentials.
                    </span>{" "}
                    Use the sidebar to enter your Access Key (AK) and Secret Key
                    (SK). They are required to sign API requests on your behalf.
                  </li>
                  <li>
                    <span className="font-semibold text-zinc-900 dark:text-white">
                      2. Understand account access.
                    </span>{" "}
                    When you run actions, the assistant uses your AK/SK to make
                    Huawei Cloud API calls, which can read or modify resources in
                    your account.
                  </li>
                  <li>
                    <span className="font-semibold text-zinc-900 dark:text-white">
                      3. Ask for workflows or API help.
                    </span>{" "}
                    Try “list my projects,” “create an ECS instance,” or “show
                    available APIs,” and the assistant will guide you through the
                    required parameters.
                  </li>
                </ol>
              </div>
            ) : (
              messages
                .filter((message) => message.role !== "tool")
                .map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className="max-w-[80%]"
                    >
                      <div className="flex flex-col gap-3">
                        {message.content.trim() ? (
                          <div
                            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                              message.role === "user"
                                ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                                : "bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-zinc-100"
                            }`}
                          >
                            {message.role === "assistant" ? (
                              <div className="markdown-content">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {message.content}
                                </ReactMarkdown>
                              </div>
                            ) : (
                              message.content
                            )}
                          </div>
                        ) : null}
                        {message.role === "assistant" &&
                        message.tool_calls &&
                        message.tool_calls.length > 0 ? (
                          <div className="flex flex-col gap-3">
                            {message.tool_calls.map((toolCall) => {
                              const payload = parseToolPayload(toolCall);
                              const code = payload.code ?? "";
                              const isChoiceTool =
                                toolCall.function.name === "ask_multiple_choice";
                              const isEvalTool =
                                toolCall.function.name === "eval_code";
                              let summary = payload.error
                                ? "Unable to summarize tool details."
                                : isChoiceTool
                                  ? `Asks the user: ${payload.question}`
                                  : summarizeCode(code);

                              if (toolCall.function.name === "get_all_apis") {
                                summary = payload.productShort ? `Lists all APIs for ${payload.productShort} service.` : "Lists all APIs for a service.";
                              }

                              if (toolCall.function.name === "get_api_details") {
                                summary = payload.productShort && payload.action ? `Gets details for ${payload.productShort} API: ${payload.action}.` : "Gets API details.";
                              }

                              const hasResult = toolResults.has(toolCall.id);
                              const result = String(toolResults.get(toolCall.id) ?? "");
                              const resultLineCount = result.split("\n").length;
                              const shouldCollapseResult =
                                result.length > TOOL_RESULT_COLLAPSE_THRESHOLD ||
                                resultLineCount > TOOL_RESULT_COLLAPSE_LINES;

                              return (
                                <div
                                  key={toolCall.id}
                                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-700 shadow-sm dark:border-white/10 dark:bg-black dark:text-zinc-200"
                                >
                                  <div className="flex items-center justify-between gap-4">
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                                        Tool run
                                      </p>
                                      <p className="text-base font-semibold text-zinc-900 dark:text-white">
                                        {toolCall.function.name}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {!hasResult ? (
                                        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-white/20 dark:border-t-white" />
                                          Running
                                        </div>
                                      ) : (
                                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
                                          Complete
                                        </span>
                                      )}
                                      {isEvalTool ? (
                                        <button
                                          className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/30 dark:hover:text-white"
                                          type="button"
                                          onClick={() =>
                                            setActiveToolPreview({
                                              id: toolCall.id,
                                              name: toolCall.function.name,
                                              code,
                                              summary,
                                            })
                                          }
                                          disabled={Boolean(payload.error)}
                                        >
                                          View code
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                  <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                                    {summary}
                                  </p>
                                  <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                                      Tool result
                                    </p>
                                    {hasResult ? (
                                      shouldCollapseResult ? (
                                        <details className="mt-2 w-full max-w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-white/10 dark:bg-black/60 dark:text-zinc-200">
                                          <summary className="cursor-pointer text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                                            Show full result ({resultLineCount} lines)
                                          </summary>
                                          <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap break-words text-xs text-zinc-700 dark:text-zinc-200">
                                            {result}
                                          </pre>
                                        </details>
                                      ) : (
                                        <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap break-words text-xs text-zinc-700 dark:text-zinc-200">
                                          {result}
                                        </pre>
                                      )
                                    ) : (
                                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                                        Awaiting response from the tool...
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
            )}
            {isLoading ? (
              <div className="flex items-center gap-2 rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-white/20 dark:border-t-white"
                  aria-hidden="true"
                />
                <span>{isCompacting ? "Compacting..." : "Thinking..."}</span>
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          ) : null}

          {pendingChoice ? (
            <form
              className="rounded-2xl border border-dashed border-zinc-200 bg-white p-4 text-sm text-zinc-700 shadow-sm dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-200"
              onSubmit={handleChoiceSubmit}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                Multiple choice
              </p>
              <p className="mt-2 text-base font-semibold text-zinc-900 dark:text-white">
                {pendingChoice.question}
              </p>
              <div className="mt-4 flex flex-col gap-3">
                {pendingChoice.options.map((option, index) => (
                  <label
                    key={`${option}-${index}`}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-700 transition hover:border-zinc-300 dark:border-white/10 dark:text-zinc-200 dark:hover:border-white/20"
                  >
                    <input
                      type="radio"
                      name="multiple-choice"
                      value={option}
                      checked={selectedChoice === option}
                      onChange={() => setSelectedChoice(option)}
                      className="h-4 w-4"
                    />
                    <span>{option}</span>
                  </label>
                ))}
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-700 transition hover:border-zinc-300 dark:border-white/10 dark:text-zinc-200 dark:hover:border-white/20">
                  <input
                    type="radio"
                    name="multiple-choice"
                    value="custom"
                    checked={selectedChoice === "custom"}
                    onChange={() => setSelectedChoice("custom")}
                    className="h-4 w-4"
                  />
                  <span>Other (type your answer)</span>
                </label>
                {selectedChoice === "custom" ? (
                  <input
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-white/10 dark:bg-black dark:text-zinc-100 dark:focus:border-white/20 dark:focus:ring-white/10"
                    placeholder="Type your answer..."
                    value={customChoice}
                    onChange={(event) => setCustomChoice(event.target.value)}
                    disabled={isLoading}
                  />
                ) : null}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white"
                  type="submit"
                  disabled={
                    isLoading ||
                    !selectedChoice ||
                    (selectedChoice === "custom" && !customChoice.trim())
                  }
                >
                  Submit answer
                </button>
              </div>
            </form>
          ) : null}

          <form
            className="flex flex-col gap-3 pb-[env(safe-area-inset-bottom)]"
            onSubmit={handleSubmit}
            ref={formRef}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="relative grid flex-1">
                <textarea
                  ref={textareaRef}
                  className="col-start-1 row-start-1 min-h-[48px] w-full resize-none rounded-3xl border border-zinc-200 bg-white px-4 py-3 pl-14 pr-14 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-white/10 dark:bg-black dark:text-zinc-100 dark:focus:border-white/20 dark:focus:ring-white/10"
                  placeholder="Type your message..."
                  value={input}
                  onChange={(event) => {
                    if (!activeConversationId) return;
                    updateDraft(activeConversationId, event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      formRef.current?.requestSubmit();
                    }
                  }}
                  disabled={isLoading || Boolean(pendingChoice)}
                  rows={1}
                />
                <div
                  ref={compactMenuRef}
                  className="col-start-1 row-start-1 ml-2 flex w-fit items-center self-center justify-self-start"
                >
                  <button
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-black/20 bg-black text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-600 dark:border-black/40 dark:bg-black dark:text-white dark:hover:bg-zinc-800"
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={compactMenuOpen}
                    aria-label="Open compact conversation menu"
                    disabled={isLoading || hasRunningToolCalls || Boolean(pendingChoice)}
                    onClick={() => {
                      if (isLoading || hasRunningToolCalls || pendingChoice) return;
                      setCompactMenuOpen((prev) => !prev);
                    }}
                  >
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                  </button>
                  {compactMenuOpen ? (
                    <div
                      className="absolute bottom-[calc(100%+8px)] left-2 z-10 w-56 rounded-2xl border border-zinc-200 bg-white p-2 text-sm text-zinc-700 shadow-lg dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-200"
                      role="menu"
                    >
                      <button
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400 dark:text-zinc-200 dark:hover:bg-white/10 dark:disabled:text-zinc-500"
                        type="button"
                        role="menuitem"
                        disabled={
                          isLoading || hasRunningToolCalls || Boolean(pendingChoice)
                        }
                        onClick={handleCompactConversation}
                      >
                        <svg
                          className="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M8 4H4v4" />
                          <path d="M16 4h4v4" />
                          <path d="M8 20H4v-4" />
                          <path d="M16 20h4v-4" />
                        </svg>
                        <span>Compact conversation</span>
                      </button>
                    </div>
                  ) : null}
                </div>
                <button
                  className="col-start-1 row-start-1 mr-2 flex h-9 w-9 items-center justify-center justify-self-end self-center rounded-full bg-zinc-900 text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white"
                  type={isLoading || hasRunningToolCalls ? "button" : "submit"}
                  disabled={
                    (!isLoading && !hasRunningToolCalls && !trimmedInput) ||
                    Boolean(pendingChoice)
                  }
                  onClick={() => {
                    if (isLoading || hasRunningToolCalls) {
                      handleCancel();
                    }
                  }}
                  aria-label={
                    isLoading || hasRunningToolCalls
                      ? "Cancel response"
                      : "Send message"
                  }
                >
                  {isLoading || hasRunningToolCalls ? (
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  ) : (
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 19V5" />
                      <path d="m5 12 7-7 7 7" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </form>
        </section>
      </main>

      {activeToolPreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-xl dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                  Tool code
                </p>
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
                  {activeToolPreview.name}
                </h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {activeToolPreview.summary}
                </p>
              </div>
              <button
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/30 dark:hover:text-white"
                type="button"
                onClick={() => setActiveToolPreview(null)}
              >
                Close
              </button>
            </div>
            <pre className="mt-4 max-h-[60vh] overflow-y-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100">
              {activeToolPreview.code}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
