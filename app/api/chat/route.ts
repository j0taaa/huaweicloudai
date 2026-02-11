import fs from "fs";
import path from "path";
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

const SYSTEM_PROMPT_PATH = path.join(
  process.cwd(),
  "app",
  "api",
  "chat",
  "system_prompt.md",
);
const DEFAULT_SYSTEM_PROMPT = fs.readFileSync(SYSTEM_PROMPT_PATH, "utf8");
const SYSTEM_PROMPT_PLACEHOLDER = "{{CREDENTIALS_BLOCK}}";

const buildSystemPrompt = (context: ChatRequest["context"] = {}) => {
  const hasCredentials = context.accessKey?.trim() && context.secretKey?.trim();
  const hasProjectIds = context.projectIds && context.projectIds.length > 0;

  if (!hasCredentials) {
    const credentialBlock = [
      "Huawei Cloud Access Key (AK): [not provided]",
      "Huawei Cloud Secret Key (SK): [not provided]",
      "Status: User has not provided credentials yet.",
    ].join("\n");
    return DEFAULT_SYSTEM_PROMPT.replace(SYSTEM_PROMPT_PLACEHOLDER, credentialBlock);
  }

  const projectLines = hasProjectIds && context.projectIds
    ? [
        "Available Project IDs (use these region-project mappings):",
        ...context.projectIds.map((entry) =>
          entry.name
            ? `- Region: ${entry.region} | Project ID: ${entry.projectId} | Name: ${entry.name}`
            : `- Region: ${entry.region} | Project ID: ${entry.projectId}`,
        ),
      ]
    : ["No project IDs configured."];

  const credentialBlock = [
    "✓ Huawei Cloud credentials are configured",
    "IMPORTANT: For security, credentials are NOT shown directly.",
    "",
    "Use these placeholders in your eval_code calls:",
    "- `${AK}` - Access Key placeholder",
    "- `${SK}` - Secret Key placeholder",
    "- `${PROJECT_ID:<region>}` - Project ID for a specific region (e.g., ${PROJECT_ID:sa-brazil-1})",
    "",
    ...projectLines,
    "",
    "The system will automatically replace these placeholders with actual values when executing code.",
  ].join("\n");

  return DEFAULT_SYSTEM_PROMPT.replace(
    SYSTEM_PROMPT_PLACEHOLDER,
    credentialBlock,
  );
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

  if (!apiKey || !baseUrl) {
    return NextResponse.json(
      { error: "Missing API key or base URL configuration." },
      { status: 500 },
    );
  }
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
            name: "create_sub_agent",
            description:
              "Create a focused sub-agent session for a bounded objective. The sub-agent runs as an isolated black box and returns only a final result.",
            parameters: {
              type: "object",
              properties: {
                task: {
                  type: "string",
                  description:
                    "A complete, self-contained objective for the sub-agent, including success criteria and constraints.",
                },
              },
              required: ["task"],
            },
          },
        },
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
            name: "set_checklist",
            description:
              "Set the current checklist for the active conversation so the user can see task progress. Replaces the entire checklist each time.",
            parameters: {
              type: "object",
              properties: {
                tasks: {
                  type: "array",
                  description:
                    "Checklist task items to display in the UI.",
                  items: {
                    type: "object",
                    properties: {
                      name: {
                        type: "string",
                        description: "Task name shown to the user.",
                      },
                      completed: {
                        type: "boolean",
                        description: "Whether the task has been completed.",
                      },
                    },
                    required: ["name", "completed"],
                  },
                },
              },
              required: ["tasks"],
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
        {
          type: "function",
          function: {
            name: "ssh_connect",
            description:
              "Open a password-based SSH session and return a sessionId for subsequent commands.",
            parameters: {
              type: "object",
              properties: {
                host: {
                  type: "string",
                  description: "SSH host or IP address.",
                },
                port: {
                  type: "number",
                  description: "SSH port (defaults to 22).",
                },
                username: {
                  type: "string",
                  description: "SSH username.",
                },
                password: {
                  type: "string",
                  description: "SSH password.",
                },
              },
              required: ["host", "username", "password"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "ssh_send",
            description: "Send a command to an existing SSH session.",
            parameters: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "SSH sessionId returned by ssh_connect.",
                },
                command: {
                  type: "string",
                  description: "Command to send to the remote shell.",
                },
                appendNewline: {
                  type: "boolean",
                  description: "Append a newline to the command (default true).",
                },
              },
              required: ["sessionId", "command"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "ssh_read",
            description: "Read recent output from an SSH session buffer.",
            parameters: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "SSH sessionId returned by ssh_connect.",
                },
                maxChars: {
                  type: "number",
                  description: "Maximum number of characters to return (default 4000).",
                },
                clear: {
                  type: "boolean",
                  description: "Whether to clear the buffer after reading.",
                },
              },
              required: ["sessionId"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "ssh_close",
            description: "Close an SSH session and release its resources.",
            parameters: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "SSH sessionId returned by ssh_connect.",
                },
              },
              required: ["sessionId"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "search_rag_docs",
            description:
              "Search Huawei Cloud documentation using semantic RAG. Returns relevant documentation snippets with source URLs. Use this when the user asks about: 1) Huawei Cloud service concepts, 2) Configuration best practices, 3) How-to guides, 4) Feature explanations, 5) Quotas and limits. NOT for API discovery (use get_all_apis instead).",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description:
                    "The search query describing what information is needed. Be specific for better results.",
                },
                product: {
                  type: "string",
                  description:
                    "Optional: Filter to a specific service (e.g., 'ECS', 'VPC', 'OBS', 'RDS', 'ELB', 'CCE'). Leave empty to search all docs.",
                },
                top_k: {
                  type: "number",
                  description: "Number of results to return (1-10). Default is 3.",
                  default: 3,
                },
              },
              required: ["query"],
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
