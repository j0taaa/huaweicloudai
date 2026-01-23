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
};

export async function POST(request: Request) {
  const { messages } = (await request.json()) as ChatRequest;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "Messages are required." },
      { status: 400 },
    );
  }

  const apiKey = process.env.ZAI_APIKEY;
  const baseUrl = process.env.ZAI_URL;

  if (!apiKey || !baseUrl) {
    return NextResponse.json(
      { error: "Missing ZAI_APIKEY or ZAI_URL environment variables." },
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
      model: "glm-4.7",
      messages,
      tools: [
        {
          type: "function",
          function: {
            name: "eval_code",
            description:
              "Execute JavaScript code on the server and return the result.",
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
