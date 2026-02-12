import fs from "fs";
import path from "path";
import { ProxyAgent } from "undici";

type ChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type ProjectIdEntry = { region: string; projectId: string; name?: string };
type SharedContext = { accessKey?: string; secretKey?: string; projectIds?: ProjectIdEntry[] };
type InferenceConfig = { mode?: "default" | "custom"; baseUrl?: string; model?: string; apiKey?: string };
type SubAgentRequest = { task?: string; mainMessages?: ChatMessage[]; context?: SharedContext; inference?: InferenceConfig };
type StepTraceEntry = { type: string; detail: string };
type StreamEvent =
  | { type: "step"; step: StepTraceEntry }
  | { type: "final"; result: string; mode: string; steps: StepTraceEntry[] }
  | { type: "error"; error: string; steps: StepTraceEntry[] };

const SYSTEM_PROMPT_PATH = path.join(process.cwd(), "app", "api", "chat", "system_prompt.md");
const DEFAULT_SYSTEM_PROMPT = fs.readFileSync(SYSTEM_PROMPT_PATH, "utf8");
const SYSTEM_PROMPT_PLACEHOLDER = "{{CREDENTIALS_BLOCK}}";

const buildCredentialsBlock = (context: SharedContext = {}) => {
  const hasCredentials = context.accessKey?.trim() && context.secretKey?.trim();
  if (!hasCredentials) {
    return [
      "Huawei Cloud Access Key (AK): [not provided]",
      "Huawei Cloud Secret Key (SK): [not provided]",
      "Status: User has not provided credentials yet.",
    ].join("\n");
  }

  const projectLines = context.projectIds?.length
    ? [
        "Available Project IDs (use these region-project mappings):",
        ...context.projectIds.map((entry) =>
          entry.name
            ? `- Region: ${entry.region} | Project ID: ${entry.projectId} | Name: ${entry.name}`
            : `- Region: ${entry.region} | Project ID: ${entry.projectId}`,
        ),
      ]
    : ["No project IDs configured."];

  return [
    "✓ Huawei Cloud credentials are configured",
    "IMPORTANT: For security, credentials are NOT shown directly.",
    "",
    "Use placeholders in eval_code calls: ${AK}, ${SK}, ${PROJECT_ID:<region>}.",
    ...projectLines,
  ].join("\n");
};

const buildSubSystemPrompt = (context: SharedContext = {}) => {
  const basePrompt = DEFAULT_SYSTEM_PROMPT.replace(SYSTEM_PROMPT_PLACEHOLDER, buildCredentialsBlock(context));
  return `${basePrompt}\n\n# Sub-agent contract\nYou are a delegated sub-agent.\n- Focus only on the delegated task.\n- Use ask_main_agent for clarification (never ask the user directly).\n- Return final output via return_sub_agent_result.\n- Keep responses concise and outcome-oriented.`;
};

const parseInference = (inference?: InferenceConfig) => {
  const mode = inference?.mode === "custom" ? "custom" : "default";
  const apiKey = mode === "custom" ? inference?.apiKey?.trim() : process.env.ZAI_APIKEY;
  const baseUrl = mode === "custom" ? inference?.baseUrl?.trim() : process.env.ZAI_URL;
  const model = mode === "custom" ? inference?.model?.trim() : "glm-4.7";
  if (!apiKey || !baseUrl || !model) throw new Error("Missing inference configuration.");
  const endpoint = new URL("chat/completions", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
  return { apiKey, endpoint, model };
};

const tools = [
  "eval_code",
  "get_all_apis",
  "get_api_details",
  "ssh_connect",
  "ssh_send",
  "ssh_read",
  "ssh_close",
  "search_rag_docs",
  "ask_main_agent",
  "return_sub_agent_result",
] as const;

const toolDefs = [
  {
    type: "function",
    function: {
      name: "eval_code",
      description: "Execute JavaScript code on server.",
      parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_all_apis",
      description: "Get all available APIs for a service.",
      parameters: {
        type: "object",
        properties: { productShort: { type: "string" }, regionId: { type: "string" } },
        required: ["productShort"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_api_details",
      description: "Get detailed information about a specific API.",
      parameters: {
        type: "object",
        properties: { productShort: { type: "string" }, action: { type: "string" }, regionId: { type: "string" } },
        required: ["productShort", "action"],
      },
    },
  },
  ...["ssh_connect", "ssh_send", "ssh_read", "ssh_close"].map((name) => ({
    type: "function" as const,
    function: { name, description: `${name} tool.`, parameters: { type: "object", properties: {}, required: [] } },
  })),
  {
    type: "function",
    function: {
      name: "search_rag_docs",
      description: "Search Huawei Cloud docs.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" }, product: { type: "string" }, top_k: { type: "number" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_main_agent",
      description: "Ask clarification to main agent context.",
      parameters: { type: "object", properties: { question: { type: "string" } }, required: ["question"] },
    },
  },
  {
    type: "function",
    function: {
      name: "return_sub_agent_result",
      description: "Return final delegated result.",
      parameters: { type: "object", properties: { result: { type: "string" } }, required: ["result"] },
    },
  },
];

const asObject = (value: string) => {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const MAX_STEP_DETAIL_CHARS = 1000;
const formatStepDetail = (detail: string) => {
  const normalized = detail.trim();
  if (normalized.length <= MAX_STEP_DETAIL_CHARS) return normalized;
  return `${normalized.slice(0, MAX_STEP_DETAIL_CHARS)}... [truncated]`;
};

const pushStep = (
  steps: StepTraceEntry[],
  type: string,
  detail: string,
  onStep?: (entry: StepTraceEntry) => void,
) => {
  const entry = { type, detail: formatStepDetail(detail) };
  steps.push(entry);
  onStep?.(entry);
};

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
  try {
    const body = (await request.json()) as SubAgentRequest;
    const task = body.task?.trim();
    if (!task) {
      controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", error: "task is required.", steps: [] })}\n`));
      controller.close();
      return;
    }

    const { apiKey, endpoint, model } = parseInference(body.inference);
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
    const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

    const callModel = async (messages: ChatMessage[]) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, tools: toolDefs, tool_choice: "auto" }),
        dispatcher,
      } as RequestInit & { dispatcher?: unknown });
      if (!response.ok) throw new Error(await response.text());
      const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string; tool_calls?: ToolCall[] } }> };
      return {
        reply: payload.choices?.[0]?.message?.content?.trim() ?? "",
        toolCalls: payload.choices?.[0]?.message?.tool_calls ?? [],
      };
    };

    const mainMessages = (body.mainMessages ?? []).filter((m) => m.role !== "system");
    const askMainAgent = async (question: string) => {
      const transcript = mainMessages.slice(-20).map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
      const result = await callModel([
        { role: "system", content: "Answer the sub-agent question using only the provided main-agent transcript. If missing, say what is missing." },
        { role: "user", content: `Transcript:\n${transcript || "[none]"}\n\nQuestion:\n${question}` },
      ]);
      return result.reply || "Main agent has no additional information.";
    };

    const routeMap: Record<string, string> = {
      eval_code: "/api/eval",
      get_all_apis: "/api/get-all-apis",
      get_api_details: "/api/get-api-details",
      ssh_connect: "/api/ssh/connect",
      ssh_send: "/api/ssh/send",
      ssh_read: "/api/ssh/read",
      ssh_close: "/api/ssh/close",
      search_rag_docs: "/api/search-rag",
    };

    const origin = new URL(request.url).origin;
    const steps: StepTraceEntry[] = [];
    const emit = (event: StreamEvent) => {
      controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
    };
    const messages: ChatMessage[] = [
      { role: "system", content: buildSubSystemPrompt(body.context) },
      { role: "user", content: `Delegated task:\n${task}\n\nReturn completion using return_sub_agent_result.` },
    ];
    pushStep(steps, "task", task, (step) => emit({ type: "step", step }));

    for (;;) {
      const output = await callModel(messages);
      if (output.reply) {
        pushStep(steps, "assistant", output.reply, (step) => emit({ type: "step", step }));
      }
      messages.push({ role: "assistant", content: output.reply, tool_calls: output.toolCalls.length ? output.toolCalls : undefined });

      if (!output.toolCalls.length) {
        if (output.reply) {
          emit({ type: "final", result: output.reply, mode: "assistant_reply", steps });
          controller.close();
          return;
        }
        break;
      }

      for (const call of output.toolCalls) {
        pushStep(steps, "tool_call", `${call.function.name}(${call.function.arguments || "{}"})`, (step) =>
          emit({ type: "step", step }),
        );
        if (!tools.includes(call.function.name as (typeof tools)[number])) {
          messages.push({ role: "tool", tool_call_id: call.id, content: `Unsupported tool: ${call.function.name}` });
          pushStep(steps, "tool_result", `Unsupported tool: ${call.function.name}`, (step) => emit({ type: "step", step }));
          continue;
        }

        const args = asObject(call.function.arguments);
        if (call.function.name === "return_sub_agent_result") {
          const result = typeof args.result === "string" ? args.result.trim() : "";
          if (!result) {
            messages.push({ role: "tool", tool_call_id: call.id, content: "Error: result is required." });
            pushStep(steps, "tool_result", "Error: result is required.", (step) => emit({ type: "step", step }));
            continue;
          }
          pushStep(steps, "final_result", result, (step) => emit({ type: "step", step }));
          emit({ type: "final", result, mode: "tool_return", steps });
          controller.close();
          return;
        }

        if (call.function.name === "ask_main_agent") {
          const question = typeof args.question === "string" ? args.question.trim() : "";
          const answer = question ? await askMainAgent(question) : "Error: question is required.";
          messages.push({ role: "tool", tool_call_id: call.id, content: answer });
          pushStep(steps, "tool_result", answer, (step) => emit({ type: "step", step }));
          continue;
        }

        const route = routeMap[call.function.name];
        const response = await fetch(`${origin}${route}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(call.function.name === "eval_code" ? { ...args, context: body.context } : args),
        });
        const text = await response.text();
        messages.push({ role: "tool", tool_call_id: call.id, content: text || "{}" });
        pushStep(steps, "tool_result", text || "{}", (step) => emit({ type: "step", step }));
      }
    }

    emit({ type: "error", error: "Sub-agent exited without a result.", steps });
    controller.close();
    return;
  } catch (error) {
    controller.enqueue(
      encoder.encode(
        `${JSON.stringify({ type: "error", error: error instanceof Error ? error.message : "Sub-agent failure.", steps: [] })}\n`,
      ),
    );
    controller.close();
  }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
