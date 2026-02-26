import { NextResponse } from "next/server";
import { getAppUserByUsername } from "@/lib/admin-db";
import { getAppConfig } from "@/lib/app-config";
import { registerUser } from "@/lib/user-auth";
import { enforceLicenseForApi } from "@/lib/license-guard";

export async function POST(request: Request) {
  const licenseError = await enforceLicenseForApi();
  if (licenseError) return licenseError;
  const config = getAppConfig();
  if (!config.loginEnabled) {
    return NextResponse.json({ error: "Login system is disabled." }, { status: 400 });
  }

  const { username, password } = (await request.json()) as { username?: string; password?: string };
  const normalizedUsername = username?.trim().toLowerCase();

  if (!normalizedUsername || !password || password.length < 6) {
    return NextResponse.json({ error: "Username and password (min 6 chars) are required." }, { status: 400 });
  }

  if (getAppUserByUsername(normalizedUsername)) {
    return NextResponse.json({ error: "User already exists." }, { status: 409 });
  }

  registerUser(normalizedUsername, password);
  return NextResponse.json({ success: true, message: "Registered. Waiting for admin approval." });
}
