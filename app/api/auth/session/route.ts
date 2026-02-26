import { NextResponse } from "next/server";
import { getAppConfig } from "@/lib/app-config";
import { getCurrentUser } from "@/lib/user-auth";
import { enforceLicenseForApi } from "@/lib/license-guard";

export async function GET() {
  const licenseError = await enforceLicenseForApi();
  if (licenseError) return licenseError;
  const config = getAppConfig();
  const user = await getCurrentUser();
  const authenticated = Boolean(user && user.approved);
  return NextResponse.json({
    loginEnabled: config.loginEnabled,
    authenticated,
    username: authenticated ? user?.username : null,
  });
}
