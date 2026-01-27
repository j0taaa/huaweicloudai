import { NextResponse } from "next/server";
import { ProxyAgent } from "undici";

type ChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

type ChatRequest = {
  messages: ChatMessage[];
  context?: {
    accessKey?: string;
    secretKey?: string;
    projectIds?: Array<{
      region: string;
      projectId: string;
      name?: string;
    }>;
  };
  inference?: {
    mode?: "default" | "custom";
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  };
};

type StreamToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type StreamEvent = {
  event: string;
  data: string;
};

const buildSystemPrompt = (context: ChatRequest["context"] = {}) => {
  const akValue = context.accessKey?.trim() || "[not provided]";
  const skValue = context.secretKey?.trim() || "[not provided]";
  const projectLines =
    context.projectIds && context.projectIds.length > 0
      ? [
          "Huawei Cloud Project IDs:",
          ...context.projectIds.map((entry) =>
            entry.name
              ? `- ${entry.region}: ${entry.projectId} (${entry.name})`
              : `- ${entry.region}: ${entry.projectId}`,
          ),
        ]
      : [];

  return [
    "You are a helpful assistant for Huawei Cloud workflows.",
    "The user explicitly provided the Huawei Cloud credentials below and authorizes you to repeat them if needed in the response.",
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
};

const createSseParser = (onEvent: (event: StreamEvent) => void) => {
  let buffer = "";
  let eventName = "message";
  let dataLines: string[] = [];

  const flushEvent = () => {
    if (dataLines.length === 0) return;
    const data = dataLines.join("\n");
    onEvent({ event: eventName, data });
    dataLines = [];
    eventName = "message";
  };

  return (chunk: string) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const trimmed = line.replace(/\r$/, "");

      if (!trimmed) {
        flushEvent();
        newlineIndex = buffer.indexOf("\n");
        continue;
      }

      if (trimmed.startsWith("event:")) {
        eventName = trimmed.slice(6).trim() || "message";
      } else if (trimmed.startsWith("data:")) {
        dataLines.push(trimmed.slice(5).trimStart());
      }

      newlineIndex = buffer.indexOf("\n");
    }
  };
};

const extractThinkingDelta = (delta: Record<string, unknown>) => {
  const candidates = [
    delta.reasoning_content,
    delta.reasoning,
    delta.thinking,
    delta.analysis,
  ];

  const firstString = candidates.find((value) => typeof value === "string");
  return typeof firstString === "string" ? firstString : "";
};

const buildToolCallsFromDeltas = (entries: Array<Record<string, unknown>>) => {
  const toolCalls = new Map<number, StreamToolCall>();

  entries.forEach((entry) => {
    const index = typeof entry.index === "number" ? entry.index : 0;
    const existing =
      toolCalls.get(index) ??
      ({
        id: "",
        type: "function",
        function: { name: "", arguments: "" },
      } satisfies StreamToolCall);

    if (typeof entry.id === "string") {
      existing.id = entry.id;
    }
    if (typeof entry.type === "string" && entry.type === "function") {
      existing.type = "function";
    }

    const func = entry.function as Record<string, unknown> | undefined;
    if (func) {
      if (typeof func.name === "string") {
        existing.function.name = func.name;
      }
      if (typeof func.arguments === "string") {
        existing.function.arguments += func.arguments;
      }
    }

    toolCalls.set(index, existing);
  });

  return toolCalls;
};

const parseApiError = (rawError: string) => {
  try {
    const parsed = JSON.parse(rawError) as {
      error?: { code?: string | number; message?: string };
    };
    const code = parsed?.error?.code;
    const message = parsed?.error?.message;
    return {
      code: typeof code === "number" ? String(code) : code,
      message,
    };
  } catch {
    return { code: undefined, message: undefined };
  }
};

const isInvalidParameterError = (rawError: string) => {
  const parsed = parseApiError(rawError);
  const code = parsed.code?.trim();
  const message = parsed.message ?? rawError;
  return code === "1210" || message.includes("Invalid API parameter");
};

const buildRequestPayload = (
  params: {
    model: string;
    messages: ChatMessage[];
    includeTools: boolean;
    includeThinkingOptions: boolean;
  },
) => {
  const payload: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    stream: true,
  };

  if (params.includeThinkingOptions) {
    payload.reasoning = true;
    payload.stream_options = { include_reasoning: true };
  }

  if (params.includeTools) {
    payload.tools = [
      {
        type: "function",
        function: {
          name: "eval_code",
          description:
            "Execute JavaScript code on the server. Define a main() function (can be async, takes no parameters) and return a value from it; the environment calls main() and returns its result.",
          parameters: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description: "JavaScript source to execute on the server.",
              },
            },
            required: ["code"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "ask_multiple_choice",
          description:
            "Ask the user a multiple-choice question and return their selected or typed answer.",
          parameters: {
            type: "object",
            properties: {
              question: {
                type: "string",
                description: "The question to present to the user.",
              },
              options: {
                type: "array",
                description:
                  "Answer options to show the user (the UI will add a final option to type a custom answer).",
                items: { type: "string" },
              },
            },
            required: ["question", "options"],
          },
        },
      },
    ];
    payload.tool_choice = "auto";
  }

  return payload;
};

const streamResponse = (
  response: Response,
  fallbackPayload?: {
    reply: string;
    toolCalls: StreamToolCall[];
    thinking: string;
  },
) => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      if (!response.body || fallbackPayload) {
        const payload = fallbackPayload ?? {
          reply: "",
          toolCalls: [],
          thinking: "",
        };
        sendEvent("done", payload);
        controller.close();
        return;
      }

      const reader = response.body.getReader();
      let reply = "";
      let thinking = "";
      const toolCallsByIndex = new Map<number, StreamToolCall>();
      const parser = createSseParser((event) => {
        if (event.data === "[DONE]") {
          return;
        }

        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = JSON.parse(event.data) as Record<string, unknown>;
        } catch {
          return;
        }

        const choices = parsed?.choices as Array<Record<string, unknown>> | undefined;
        const choice = choices?.[0];
        if (!choice) {
          return;
        }
        const delta =
          (choice.delta as Record<string, unknown> | undefined) ??
          (choice.message as Record<string, unknown> | undefined) ??
          {};

        const content = typeof delta.content === "string" ? delta.content : "";
        if (content) {
          reply += content;
          sendEvent("content", { chunk: content });
        }

        const thoughtDelta = extractThinkingDelta(delta);
        if (thoughtDelta) {
          thinking += thoughtDelta;
          sendEvent("thinking", { chunk: thoughtDelta });
        }

        const toolCallsDelta = delta.tool_calls as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(toolCallsDelta) && toolCallsDelta.length > 0) {
          const toolCalls = buildToolCallsFromDeltas(toolCallsDelta);
          toolCalls.forEach((toolCall, index) => {
            const existing = toolCallsByIndex.get(index);
            if (!existing) {
              toolCallsByIndex.set(index, toolCall);
              return;
            }
            existing.id = toolCall.id || existing.id;
            existing.function.name =
              toolCall.function.name || existing.function.name;
            existing.function.arguments += toolCall.function.arguments;
          });
        }
      });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parser(decoder.decode(value, { stream: true }));
        }
      } catch (error) {
        sendEvent("error", {
          message: error instanceof Error ? error.message : "Stream error.",
        });
        controller.close();
        return;
      }

      const toolCalls = Array.from(toolCallsByIndex.values()).filter(
        (toolCall) => toolCall.id || toolCall.function.name,
      );
      sendEvent("done", { reply, toolCalls, thinking });
      controller.close();
    },
  });
};

export async function POST(request: Request) {
  const { messages, context, inference } = (await request.json()) as ChatRequest;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "Messages are required." },
      { status: 400 },
    );
  }

  const inferenceMode = inference?.mode === "custom" ? "custom" : "default";
  const customBaseUrl = inference?.baseUrl?.trim();
  const customModel = inference?.model?.trim();
  const customApiKey = inference?.apiKey?.trim();

  if (inferenceMode === "custom") {
    if (!customBaseUrl || !customModel || !customApiKey) {
      return NextResponse.json(
        {
          error:
            "Custom inference requires a base URL, model, and API key. Please update your inference settings.",
        },
        { status: 400 },
      );
    }
  } else {
    const apiKey = process.env.ZAI_APIKEY;
    const baseUrl = process.env.ZAI_URL;

    if (!apiKey || !baseUrl) {
      return NextResponse.json(
        { error: "Missing ZAI_APIKEY or ZAI_URL environment variables." },
        { status: 500 },
      );
    }
  }

  const apiKey =
    inferenceMode === "custom" ? customApiKey : process.env.ZAI_APIKEY;
  const baseUrl =
    inferenceMode === "custom" ? customBaseUrl : process.env.ZAI_URL;

  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const endpoint = new URL("chat/completions", normalizedBaseUrl).toString();

  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy;
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
  const modelName = inferenceMode === "custom" ? customModel : "glm-4.7";
  const systemMessage: ChatMessage = {
    role: "system",
    content: buildSystemPrompt(context),
  };
  const requestMessages = [
    systemMessage,
    ...messages.filter((message) => message.role !== "system"),
  ];

  const baseFetchOptions = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    dispatcher,
  } satisfies RequestInit & { dispatcher?: unknown };

  const sendRequest = async (payload: Record<string, unknown>) => {
    return fetch(endpoint, {
      ...baseFetchOptions,
      body: JSON.stringify(payload),
    });
  };

  let response = await sendRequest(
    buildRequestPayload({
      model: modelName,
      messages: requestMessages,
      includeTools: true,
      includeThinkingOptions: true,
    }),
  );

  if (!response.ok) {
    const errorText = await response.text();
    if (isInvalidParameterError(errorText)) {
      response = await sendRequest(
        buildRequestPayload({
          model: modelName,
          messages: requestMessages,
          includeTools: false,
          includeThinkingOptions: true,
        }),
      );

      if (!response.ok) {
        const retryError = await response.text();
        if (isInvalidParameterError(retryError)) {
          response = await sendRequest(
            buildRequestPayload({
              model: modelName,
              messages: requestMessages,
              includeTools: false,
              includeThinkingOptions: false,
            }),
          );
        } else {
          return NextResponse.json(
            { error: retryError || "Z.AI request failed." },
            { status: response.status },
          );
        }
      }
    } else {
      return NextResponse.json(
        { error: errorText || "Z.AI request failed." },
        { status: response.status },
      );
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: errorText || "Z.AI request failed." },
      { status: response.status },
    );
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("text/event-stream")) {
    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          reasoning?: string;
          reasoning_content?: string;
          tool_calls?: Array<{
            id: string;
            type: "function";
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    const message = data?.choices?.[0]?.message;
    const reply = message?.content?.trim() ?? "";
    const toolCalls = message?.tool_calls ?? [];
    const thinking =
      message?.reasoning_content?.trim() ?? message?.reasoning?.trim() ?? "";

    if (!reply && toolCalls.length === 0) {
      return NextResponse.json(
        { error: "No reply returned from Z.AI." },
        { status: 502 },
      );
    }

    const stream = streamResponse(response, { reply, toolCalls, thinking });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const stream = streamResponse(response);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
