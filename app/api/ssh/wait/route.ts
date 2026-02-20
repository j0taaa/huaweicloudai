import { NextResponse } from "next/server";
import { waitForOutput } from "../sessionStore";

export const runtime = "nodejs";

type WaitRequest = {
  sessionId?: string;
  text?: string;
  timeoutSeconds?: number;
  pollIntervalMs?: number;
  maxChars?: number;
};

export async function POST(request: Request) {
  const {
    sessionId,
    text = "Done",
    timeoutSeconds = 600,
    pollIntervalMs = 1000,
    maxChars = 12000,
  } = (await request.json()) as WaitRequest;

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
  }

  try {
    const result = await waitForOutput(
      sessionId,
      text,
      Math.max(0, timeoutSeconds) * 1000,
      Math.max(100, pollIntervalMs),
      Math.max(1000, maxChars),
    );

    if (!result.matched) {
      return NextResponse.json(
        {
          error: `Timed out waiting for \"${text}\" after ${Math.round(result.waitedMs / 1000)}s.`,
          output: result.output,
        },
        { status: 408 },
      );
    }

    return NextResponse.json({
      result: `Detected \"${text}\" after ${Math.round(result.waitedMs / 1000)}s.`,
      output: result.output,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Error waiting for SSH output: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
      },
      { status: 500 },
    );
  }
}
