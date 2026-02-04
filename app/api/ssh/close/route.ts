import { NextResponse } from "next/server";
import { closeSession } from "../sessionStore";

export const runtime = "nodejs";

type CloseRequest = {
  sessionId?: string;
};

export async function POST(request: Request) {
  const { sessionId } = (await request.json()) as CloseRequest;

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId is required." },
      { status: 400 },
    );
  }

  closeSession(sessionId);
  return NextResponse.json({ result: "Session closed." });
}
