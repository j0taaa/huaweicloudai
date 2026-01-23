import { NextResponse } from "next/server";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
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

  const endpoint = new URL("/chat/completions", baseUrl).toString();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "glm-4.7",
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: errorText || "Z.AI request failed." },
      { status: response.status },
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const reply = data?.choices?.[0]?.message?.content?.trim();

  if (!reply) {
    return NextResponse.json(
      { error: "No reply returned from Z.AI." },
      { status: 502 },
    );
  }

  return NextResponse.json({ reply });
}
