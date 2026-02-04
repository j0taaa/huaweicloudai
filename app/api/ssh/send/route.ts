import { NextResponse } from "next/server";
import { sendCommand } from "../sessionStore";

export const runtime = "nodejs";

type SendRequest = {
  sessionId?: string;
  command?: string;
  appendNewline?: boolean;
};

export async function POST(request: Request) {
  const { sessionId, command, appendNewline = true } = (await request.json()) as SendRequest;

  if (!sessionId || !command) {
    return NextResponse.json(
      { error: "sessionId and command are required." },
      { status: 400 },
    );
  }

  try {
    sendCommand(sessionId, command, appendNewline);
    return NextResponse.json({ result: `Command sent: ${command}` });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Error sending SSH command: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
      },
      { status: 500 },
    );
  }
}
