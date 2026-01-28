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
  const fetchOptions = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: inferenceMode === "custom" ? customModel : "glm-4.7",
      messages: [
        { role: "system", content: buildSystemPrompt(context) },
        ...messages.filter((message) => message.role !== "system"),
      ],
      tools: [
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
        {
          type: "function",
          function: {
            name: "get_all_apis",
            description:
              "Get all available APIs for a Huawei Cloud service. Returns a list of API names and descriptions.",
            parameters: {
              type: "object",
              properties: {
                productShort: {
                  type: "string",
                  description: "The short name of the Huawei Cloud service (e.g., 'ECS', 'OBS', 'VPC').",
                },
                regionId: {
                  type: "string",
                  description: "The region ID (e.g., 'sa-brazil-1', 'cn-north-4'). Defaults to 'sa-brazil-1'.",
                },
              },
              required: ["productShort"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "get_api_details",
            description:
              "Get detailed information about a specific API including URL, HTTP method, parameters, and response format.",
            parameters: {
              type: "object",
              properties: {
                productShort: {
                  type: "string",
                  description: "The short name of the Huawei Cloud service (e.g., 'ECS', 'OBS', 'VPC').",
                },
                action: {
                  type: "string",
                  description: "The name of the API action (e.g., 'CreateServers', 'ListInstances').",
                },
                regionId: {
                  type: "string",
                  description: "The region ID (e.g., 'sa-brazil-1', 'cn-north-4'). Defaults to 'sa-brazil-1'.",
                },
              },
              required: ["productShort", "action"],
            },
          },
        },
      ],
      tool_choice: "auto",
    }),
    dispatcher,
  } satisfies RequestInit & { dispatcher?: unknown };

  const response = await fetch(endpoint, fetchOptions);

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: errorText || "Z.AI request failed." },
      { status: response.status },
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
        tool_calls?: Array<{
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }>;
      };
    }>;
  };

  const message = data?.choices?.[0]?.message;
  const reply = message?.content?.trim();
  const toolCalls = message?.tool_calls ?? [];

  if (!reply && toolCalls.length === 0) {
    return NextResponse.json(
      { error: "No reply returned from Z.AI." },
      { status: 502 },
    );
  }

  return NextResponse.json({ reply, toolCalls });
}
