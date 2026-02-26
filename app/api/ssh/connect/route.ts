import { NextResponse } from "next/server";
import { createSession } from "../sessionStore";
import { enforceLicenseForApi } from "@/lib/license-guard";

export const runtime = "nodejs";

type ConnectRequest = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
};

export async function POST(request: Request) {
  const licenseError = await enforceLicenseForApi();
  if (licenseError) return licenseError;
  const { host, port, username, password } = (await request.json()) as ConnectRequest;

  if (!host || !username || !password) {
    return NextResponse.json(
      { error: "host, username, and password are required." },
      { status: 400 },
    );
  }

  try {
    const { sessionId } = await createSession({ host, port, username, password });
    return NextResponse.json({ sessionId });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Error establishing SSH session: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
      },
      { status: 500 },
    );
  }
}
