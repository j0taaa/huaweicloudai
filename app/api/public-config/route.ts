import { NextResponse } from "next/server";
import { getAppConfig } from "@/lib/app-config";
import { enforceLicenseForApi } from "@/lib/license-guard";

export async function GET() {
  const licenseError = await enforceLicenseForApi();
  if (licenseError) return licenseError;
  const config = getAppConfig();
  return NextResponse.json({
    loginEnabled: config.loginEnabled,
    builtInInferenceEnabled: config.builtInInferenceEnabled,
  });
}
