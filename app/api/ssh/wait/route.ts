import { NextResponse } from "next/server";
import { waitForDone } from "../sessionStore";

export const runtime = "nodejs";

type WaitRequest = {
  sessionId?: string;
  doneText?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
};

export async function POST(request: Request) {
  const { sessionId, doneText, timeoutMs, pollIntervalMs } = (await request.json()) as WaitRequest;

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId is required." },
      { status: 400 },
    );
  }

  try {
    const result = await waitForDone({ sessionId, doneText, timeoutMs, pollIntervalMs });
    return NextResponse.json(result);
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
