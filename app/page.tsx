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
  error?: string;
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
};

const STORAGE_KEY = "huaweicloudai-conversations";
const ACTIVE_STORAGE_KEY = "huaweicloudai-active-conversation";
const CREDENTIALS_STORAGE_KEY = "huaweicloudai-credentials";
const PROJECT_IDS_STORAGE_KEY = "huaweicloudai-project-ids";
const PENDING_REQUEST_STORAGE_KEY = "huaweicloudai-pending-request";
const TOOL_RESULT_COLLAPSE_THRESHOLD = 900;
const TOOL_RESULT_COLLAPSE_LINES = 16;
const INPUT_MIN_HEIGHT = 48;
const INPUT_MAX_HEIGHT = 220;
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
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [credentialStatus, setCredentialStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [projectIds, setProjectIds] = useState<ProjectIdEntry[]>([]);
  const [projectIdError, setProjectIdError] = useState<string | null>(null);
  const [projectIdsOpen, setProjectIdsOpen] = useState(false);
  const [activeToolPreview, setActiveToolPreview] =
    useState<ToolPreview | null>(null);
  const [pendingChoice, setPendingChoice] = useState<{
    toolCall: ToolCall;
    question: string;
    options: string[];
  } | null>(null);
  const [selectedChoice, setSelectedChoice] = useState("");
  const [customChoice, setCustomChoice] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const summaryInFlightRef = useRef<Set<string>>(new Set());
  const credentialHydratedRef = useRef(false);
  const credentialResetSkipRef = useRef(true);
  const pendingResumeRef = useRef(false);

  const activeConversation = useMemo(() => {
    if (!activeConversationId) return null;
    return (
      conversations.find((conversation) => conversation.id === activeConversationId) ??
      null
    );
  }, [activeConversationId, conversations]);
  const messages = activeConversation?.messages ?? [];

  const trimmedInput = useMemo(() => input.trim(), [input]);
  const systemPrompt = useMemo(() => {
    const akValue = accessKey.trim() || "[not provided]";
    const skValue = secretKey.trim() || "[not provided]";
    const projectLines =
      projectIds.length > 0
        ? [
            "Huawei Cloud Project IDs:",
            ...projectIds.map((entry) =>
              entry.name
                ? `- ${entry.region}: ${entry.projectId} (${entry.name})`
                : `- ${entry.region}: ${entry.projectId}`,
            ),
          ]
        : [];

    return [
      "You are a helpful assistant for Huawei Cloud workflows.",
      `Huawei Cloud Access Key (AK): ${akValue}`,
      `Huawei Cloud Secret Key (SK): ${skValue}`,
      ...projectLines,
      "",
      "## What this skill does",
      "",
      "This skill teaches you how to use **raw API calls** to accomplish user requests such as \"create an ECS instance\", \"list APIs\", or \"generate API usage examples\".",
      "",
      "Use this skill when user asks to create, update, delete, or inspect Huawei Cloud resources programmatically with APIs.",
      "",
      "Ask follow-up questions to fill in missing parameters (e.g., region, credentials, instance type) before executing steps.",
      "",
      "## How to discover available services and APIs",
      "",
      "1. To **get all available resources and API counts**, make a GET request:",
      "",
      "```",
      "GET https://sa-brazil-1-console.huaweicloud.com/apiexplorer/new/v1/products/apis/count",
      "```",
      "",
      "2. To **list APIs for a specific service**, supply `product_short` service name:",
      "",
      "```",
      "GET https://sa-brazil-1-console.huaweicloud.com/apiexplorer/new/v3/apis?offset=0&limit=100&product_short=<SERVICE_NAME>",
      "```",
      "",
      "- The API returns up to 100 results.",
      "- Use `offset` parameter to page through more.",
      "",
      "3. After choosing an API, list **supported regions for that API**:",
      "",
      "```",
      "GET https://sa-brazil-1-console.huaweicloud.com/apiexplorer/new/v6/regions?product_short=<SERVICE_NAME>&api_name=<API_NAME>",
      "```",
      "",
      "Substitute `<SERVICE_NAME>` and `<API_NAME>` with correct values from previous step.",
      "",
      "4. To get **detailed info about a chosen API**:",
      "",
      "```",
      "GET https://sa-brazil-1-console.huaweicloud.com/apiexplorer/new/v4/apis/detail?product_short=<SERVICE_NAME>&name=<API_NAME>&region_id=<REGION>",
      "```",
      "",
      "Use proper region identifier from step 3.",
      "",
      "## Signing Requests (Very Important)",
      "",
      "When you run eval_code, you have access to the `signRequest(options, ak, sk)` function, which receives options from the request, account AK, and account's SK, and can be used to make requests directly to Huawei Cloud.",
      "",
      "Here's an example of code using it:",
      "",
      "```",
      "async function main() {",
      "  const options = {",
      "    method: 'GET',",
      "    url: 'https://iam.myhuaweicloud.com/v3/projects', // example endpoint",
      "    params: {}, // put query params here",
      "    data: '',   // body; '' for GET",
      "    headers: {",
      "      'content-type': 'application/json',",
      "      // 'x-project-id': '...', // only include if this API requires it",
      "    },",
      "  };",
      "",
      "  const signedHeaders = signRequest(options, AK, SK);",
      "",
      "  const res = await fetch(options.url, {",
      "    method: options.method,",
      "    headers: {",
      "      // IMPORTANT: send the returned signing headers",
      "      ...signedHeaders,",
      "    },",
      "  });",
      "",
      "  return await res.text();",
      "}",
      "```",
      "",
      "## Asking for missing information",
      "",
      "When user command lacks key details, like:",
      "",
      "* **Region** (e.g., `sa-brazil-1`)",
      "* **Service name** (e.g., `ECS`, `OBS`, `FunctionGraph`)",
      "* **Resource parameters** (size, AMI, network settings, etc.)",
      "* **Credentials availability**",
      "* **Any other information**",
      "",
      "ask for information using your ask_multiple_choice tool.",
      "",
      "## Error handling and retries",
      "",
      "* For API calls, handle HTTP errors with retries and exponential backoff.",
      "* Log failed API responses with status and message.",
      "* If an API operation fails due to missing parameters, ask user for required fields or use information you already have.",
      "",
      "## Best practices",
      "",
      "* Validate credentials before making calls.",
      "* For long-running operations (like instance provisioning), poll the API for completion.",
      "* Use API discovery endpoints above to confirm region support and API signatures before generating API calls to create/edit/delete resources.",
      "* Poll for resource readiness if needed (e.g., wait until an ECS instance status is ACTIVE before tagging).",
      "",
      "## Important",
      "",
      "* The eval_code tool executes your snippet and then calls `main()` for you.",
      "* Always define a `main` function with no parameters (it can be `async`).",
      "* Your `main()` must include a `return` statement so the tool can capture the result.",
      "* Do not use a top-level `return` or call `main()` yourself.",
    ].join("\n");
  }, [accessKey, projectIds, secretKey]);
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
    const stored = localStorage.getItem(STORAGE_KEY);
    const storedActive = localStorage.getItem(ACTIVE_STORAGE_KEY);
    const storedCredentials = localStorage.getItem(CREDENTIALS_STORAGE_KEY);
    const storedProjectIds = localStorage.getItem(PROJECT_IDS_STORAGE_KEY);

    if (storedCredentials) {
      try {
        const parsed = JSON.parse(storedCredentials) as {
          accessKey?: string;
          secretKey?: string;
        };
        if (typeof parsed.accessKey === "string") {
          setAccessKey(parsed.accessKey);
        }
        if (typeof parsed.secretKey === "string") {
          setSecretKey(parsed.secretKey);
        }
      } catch {
        // Ignore invalid stored credentials.
      }
    }

    if (storedProjectIds) {
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

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Conversation[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConversations(parsed);
          const activeId = parsed.find((conv) => conv.id === storedActive)
            ? storedActive
            : parsed[0].id;
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
    if (accessKey || secretKey) {
      localStorage.setItem(
        CREDENTIALS_STORAGE_KEY,
        JSON.stringify({ accessKey, secretKey }),
      );
    } else {
      localStorage.removeItem(CREDENTIALS_STORAGE_KEY);
    }
  }, [accessKey, secretKey]);

  useEffect(() => {
    if (!credentialHydratedRef.current) return;
    if (projectIds.length > 0) {
      localStorage.setItem(PROJECT_IDS_STORAGE_KEY, JSON.stringify(projectIds));
    } else {
      localStorage.removeItem(PROJECT_IDS_STORAGE_KEY);
    }
  }, [projectIds]);

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

      if (!parsed.conversationId || !Array.isArray(parsed.messages)) {
        localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
        pendingResumeRef.current = true;
        return;
      }

      const pendingConversation = conversations.find(
        (conversation) => conversation.id === parsed.conversationId,
      );
      if (!pendingConversation) {
        localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
        pendingResumeRef.current = true;
        return;
      }

      pendingResumeRef.current = true;
      if (activeConversationId !== parsed.conversationId) {
        setActiveConversationId(parsed.conversationId);
      }

      setIsLoading(true);
      setError(null);

      void sendMessages(parsed.messages)
        .then((response) =>
          continueConversation([...parsed.messages], response),
        )
        .catch((caughtError) => {
          const message =
            caughtError instanceof Error
              ? caughtError.message
              : "Something went wrong.";
          setError(message);
        })
        .finally(() => {
          setIsLoading(false);
          abortControllerRef.current = null;
          localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
        });
    } catch {
      localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
      pendingResumeRef.current = true;
    }
  }, [activeConversationId, conversations, pendingChoice]);

  const withSystemPrompt = (nextMessages: ChatMessage[]) => {
    if (nextMessages[0]?.role === "system") {
      return nextMessages;
    }

    return [{ role: "system", content: systemPrompt }, ...nextMessages];
  };

  const sendMessages = async (
    nextMessages: ChatMessage[],
  ): Promise<ChatResponse> => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: withSystemPrompt(nextMessages) }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Failed to fetch response.");
    }

    return (await response.json()) as ChatResponse;
  };

  const parseToolPayload = (toolCall: ToolCall): ToolPayload => {
    let payload: { code?: string; question?: string; options?: string[] } = {};

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

  const runToolCalls = async (toolCalls: ToolCall[]) => {
    return Promise.all(
      toolCalls.map(async (toolCall) => {
        if (toolCall.function.name === "eval_code") {
          return executeEvalTool(toolCall);
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
      updateActiveMessages(workingMessages);

      const multipleChoiceCall = currentResponse.toolCalls.find(
        (toolCall) => toolCall.function.name === "ask_multiple_choice",
      );
      const nonChoiceCalls = currentResponse.toolCalls.filter(
        (toolCall) => toolCall.function.name !== "ask_multiple_choice",
      );

      if (nonChoiceCalls.length > 0) {
        const toolMessages = await runToolCalls(nonChoiceCalls);
        workingMessages = [...workingMessages, ...toolMessages];
        updateActiveMessages(workingMessages);
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
          updateActiveMessages(workingMessages);
        } else if (payload.question && payload.options) {
          setPendingChoice({
            toolCall: multipleChoiceCall,
            question: payload.question,
            options: payload.options,
          });
          setIsLoading(false);
          return;
        }
      }

      currentResponse = await sendMessages(workingMessages);
    }

    if (!currentResponse.reply) {
      throw new Error("No reply returned from the model.");
    }

    workingMessages = [
      ...workingMessages,
      { role: "assistant", content: currentResponse.reply },
    ];

    updateActiveMessages(workingMessages);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedInput || isLoading || pendingChoice || !activeConversationId) {
      return;
    }

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: input },
    ];

    updateActiveMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    setError(null);
    localStorage.setItem(
      PENDING_REQUEST_STORAGE_KEY,
      JSON.stringify({
        conversationId: activeConversationId,
        messages: nextMessages,
      }),
    );

    try {
      const workingMessages = [...nextMessages];
      const response = await sendMessages(workingMessages);
      await continueConversation(workingMessages, response);
    } catch (caughtError) {
      if (
        caughtError instanceof DOMException &&
        caughtError.name === "AbortError"
      ) {
        setError("Message canceled.");
        return;
      }
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong.";
      setError(message);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
    localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
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

    const isCustom = selectedChoice === "custom";
    const trimmedCustom = customChoice.trim();
    const selectedAnswer = isCustom ? trimmedCustom : selectedChoice;

    if (!selectedAnswer) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setPendingChoice(null);
    setSelectedChoice("");
    setCustomChoice("");

    const toolMessage: ChatMessage = {
      role: "tool",
      content: selectedAnswer,
      tool_call_id: pendingChoice.toolCall.id,
    };

    const workingMessages = [...messages, toolMessage];
    updateActiveMessages(workingMessages);
    localStorage.setItem(
      PENDING_REQUEST_STORAGE_KEY,
      JSON.stringify({
        conversationId: activeConversationId,
        messages: workingMessages,
      }),
    );

    try {
      const response = await sendMessages(workingMessages);
      await continueConversation(workingMessages, response);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong.";
      setError(message);
    } finally {
      setIsLoading(false);
      localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
    }
  };

  const updateActiveMessages = (nextMessages: ChatMessage[]) => {
    if (!activeConversationId) return;
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === activeConversationId
          ? {
              ...conversation,
              messages: nextMessages,
              updatedAt: Date.now(),
            }
          : conversation,
      ),
    );
  };

  const handleNewConversation = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
    const newConversation = createEmptyConversation();
    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversationId(newConversation.id);
    setInput("");
    setIsLoading(false);
    setError(null);
    setPendingChoice(null);
    setSelectedChoice("");
    setCustomChoice("");
  };

  const handleDeleteConversation = (conversationId: string) => {
    setConversations((prev) => {
      const next = prev.filter((conversation) => conversation.id !== conversationId);
      if (conversationId === activeConversationId) {
        localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
      }
      if (next.length === 0) {
        const seed = createEmptyConversation();
        setActiveConversationId(seed.id);
        setInput("");
        setIsLoading(false);
        setError(null);
        setPendingChoice(null);
        setSelectedChoice("");
        setCustomChoice("");
        return [seed];
      }
      if (conversationId === activeConversationId) {
        setActiveConversationId(next[0].id);
        setInput("");
        setIsLoading(false);
        setError(null);
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
    const relevantMessages = conversationMessages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .slice(-12);

    if (relevantMessages.length === 0) return null;

    const summaryPrompt: ChatMessage[] = [
      {
        role: "system",
        content:
          "Summarize this conversation in 3-5 words. Keep it short, clear, and avoid punctuation.",
      },
      ...relevantMessages,
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
    if (
      activeConversation.lastSummaryMessageCount ===
      activeConversation.messages.length
    ) {
      return;
    }

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

  return (
    <div className="flex h-screen w-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <aside className="flex w-72 flex-col gap-4 border-r border-zinc-200 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/70">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Conversations
          </h2>
          <button
            className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/30 dark:hover:text-white"
            type="button"
            onClick={handleNewConversation}
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
                onClick={() => setActiveConversationId(conversation.id)}
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
      </aside>
      <main className="flex h-full w-full flex-1 flex-col">
        <section className="flex h-full flex-1 flex-col gap-6 bg-white p-6 shadow-sm dark:bg-zinc-950">
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
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
                              const summary = payload.error
                                ? "Unable to summarize tool details."
                                : isChoiceTool
                                  ? `Asks the user: ${payload.question}`
                                  : summarizeCode(code);
                              const hasResult = toolResults.has(toolCall.id);
                              const result = toolResults.get(toolCall.id) ?? "";
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
                                        disabled={
                                          Boolean(payload.error) || isChoiceTool
                                        }
                                      >
                                        View code
                                      </button>
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
              <div className="rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                Thinking...
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
            className="flex flex-col gap-3"
            onSubmit={handleSubmit}
            ref={formRef}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="relative flex-1">
                <textarea
                  ref={textareaRef}
                  className="min-h-[48px] w-full resize-none rounded-3xl border border-zinc-200 bg-white px-4 py-3 pr-14 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-white/10 dark:bg-black dark:text-zinc-100 dark:focus:border-white/20 dark:focus:ring-white/10"
                  placeholder="Type your message..."
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      formRef.current?.requestSubmit();
                    }
                  }}
                  disabled={isLoading || Boolean(pendingChoice)}
                  rows={1}
                />
                <button
                  className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white"
                  type="submit"
                  disabled={isLoading || !trimmedInput || Boolean(pendingChoice)}
                  aria-label="Send message"
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
                    <path d="M12 19V5" />
                    <path d="m5 12 7-7 7 7" />
                  </svg>
                </button>
              </div>
              {isLoading || hasRunningToolCalls ? (
                <button
                  className="rounded-2xl border border-zinc-200 px-6 py-3 text-sm font-semibold text-zinc-600 shadow-sm transition hover:border-zinc-400 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/30 dark:hover:text-white"
                  type="button"
                  onClick={handleCancel}
                  disabled={!isLoading && !hasRunningToolCalls}
                >
                  Cancel
                </button>
              ) : null}
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
