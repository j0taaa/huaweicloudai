import { NextResponse } from "next/server";
import { getAppConfig } from "@/lib/app-config";

export async function GET() {
  const config = getAppConfig();
  return NextResponse.json({
    loginEnabled: config.loginEnabled,
    builtInInferenceEnabled: config.builtInInferenceEnabled,
  });
}
