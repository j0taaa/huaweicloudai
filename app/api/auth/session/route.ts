import { NextResponse } from "next/server";
import { getAppConfig } from "@/lib/app-config";
import { getCurrentUser } from "@/lib/user-auth";

export async function GET() {
  const config = getAppConfig();
  const user = await getCurrentUser();
  const authenticated = Boolean(user && user.approved);
  return NextResponse.json({
    loginEnabled: config.loginEnabled,
    authenticated,
    username: authenticated ? user?.username : null,
  });
}
