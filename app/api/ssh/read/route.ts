import { NextResponse } from "next/server";
import { readBuffer } from "../sessionStore";
import { enforceLicenseForApi } from "@/lib/license-guard";

export const runtime = "nodejs";

type ReadRequest = {
  sessionId?: string;
  maxChars?: number;
  clear?: boolean;
};

export async function POST(request: Request) {
  const licenseError = await enforceLicenseForApi();
  if (licenseError) return licenseError;
  const { sessionId, maxChars = 4000, clear = false } = (await request.json()) as ReadRequest;

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId is required." },
      { status: 400 },
    );
  }

  try {
    const output = readBuffer(sessionId, maxChars, clear);
    return NextResponse.json({ output });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Error reading SSH output: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
      },
      { status: 500 },
    );
  }
}
