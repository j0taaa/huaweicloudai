import { NextResponse } from "next/server";
import { createLoginSession, verifyUserCredentials } from "@/lib/user-auth";
import { getAppConfig } from "@/lib/app-config";
import { enforceLicenseForApi } from "@/lib/license-guard";

export async function POST(request: Request) {
  const licenseError = await enforceLicenseForApi();
  if (licenseError) return licenseError;
  const config = getAppConfig();
  if (!config.loginEnabled) {
    return NextResponse.json({ error: "Login system is disabled." }, { status: 400 });
  }

  const { username, password } = (await request.json()) as { username?: string; password?: string };
  const user = verifyUserCredentials(username?.trim().toLowerCase() ?? "", password ?? "");

  if (!user) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  if (!user.approved) {
    return NextResponse.json({ error: "Account pending admin approval." }, { status: 403 });
  }

  await createLoginSession(user.id);
  return NextResponse.json({ success: true, username: user.username });
}
