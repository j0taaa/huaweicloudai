"use client";

import { useMemo, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant" | "tool";
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

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedInput = useMemo(() => input.trim(), [input]);

  const sendMessages = async (
    nextMessages: ChatMessage[],
  ): Promise<ChatResponse> => {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: nextMessages }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Failed to fetch response.");
    }

    return (await response.json()) as ChatResponse;
  };

  const executeEvalTool = (toolCall: ToolCall): ChatMessage => {
    let payload: { code?: string } = {};

    try {
      payload = JSON.parse(toolCall.function.arguments || "{}") as {
        code?: string;
      };
    } catch (parseError) {
      return {
        role: "tool",
        content: `Error parsing tool arguments: ${
          parseError instanceof Error ? parseError.message : "Unknown error."
        }`,
        tool_call_id: toolCall.id,
      };
    }

    if (!payload.code) {
      return {
        role: "tool",
        content: "Error: No code provided for eval_in_browser.",
        tool_call_id: toolCall.id,
      };
    }

    try {
      const result = window.eval(payload.code);
      const serializedResult =
        typeof result === "string"
          ? result
          : result === undefined
            ? "undefined"
            : JSON.stringify(result) ?? String(result);
      return {
        role: "tool",
        content: serializedResult,
        tool_call_id: toolCall.id,
      };
    } catch (evalError) {
      return {
        role: "tool",
        content: `Error executing eval_in_browser: ${
          evalError instanceof Error ? evalError.message : "Unknown error."
        }`,
        tool_call_id: toolCall.id,
      };
    }
  };

  const runToolCalls = (toolCalls: ToolCall[]) => {
    return toolCalls.map((toolCall) => {
      if (toolCall.function.name === "eval_in_browser") {
        return executeEvalTool(toolCall);
      }

      return {
        role: "tool",
        content: `Unsupported tool: ${toolCall.function.name}`,
        tool_call_id: toolCall.id,
      };
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedInput || isLoading) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmedInput },
    ];

    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      let workingMessages = [...nextMessages];
      let response = await sendMessages(workingMessages);
      let safetyCounter = 0;

      while (response.toolCalls && response.toolCalls.length > 0) {
        const assistantToolMessage: ChatMessage = {
          role: "assistant",
          content: response.reply ?? "",
          tool_calls: response.toolCalls,
        };
        const toolMessages = runToolCalls(response.toolCalls);

        workingMessages = [
          ...workingMessages,
          assistantToolMessage,
          ...toolMessages,
        ];

        setMessages(workingMessages);

        safetyCounter += 1;
        if (safetyCounter > 3) {
          throw new Error("Tool call loop exceeded safety limit.");
        }

        response = await sendMessages(workingMessages);
      }

      if (!response.reply) {
        throw new Error("No reply returned from the model.");
      }

      workingMessages = [
        ...workingMessages,
        { role: "assistant", content: response.reply },
      ];

      setMessages(workingMessages);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="space-y-3 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
            Simple LLM Chat
          </p>
          <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
            Ask a question, get an answer.
          </h1>
          <p className="text-base text-zinc-600 dark:text-zinc-400">
            Messages are sent to your Z.AI endpoint and returned in seconds.
          </p>
        </header>

        <section className="flex min-h-[360px] flex-col gap-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-950">
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                Start the conversation by typing a message below.
              </div>
            ) : (
              messages
                .filter(
                  (message) => message.role !== "tool" && message.content.trim(),
                )
                .map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                        message.role === "user"
                          ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                          : "bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-zinc-100"
                      }`}
                    >
                      {message.content}
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

          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
            <input
              className="flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-white/10 dark:bg-black dark:text-zinc-100 dark:focus:border-white/20 dark:focus:ring-white/10"
              placeholder="Type your message..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={isLoading}
            />
            <button
              className="rounded-2xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white"
              type="submit"
              disabled={isLoading || !trimmedInput}
            >
              Send
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
