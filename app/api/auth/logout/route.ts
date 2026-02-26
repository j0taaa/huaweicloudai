import { NextResponse } from "next/server";
import { clearLoginSession } from "@/lib/user-auth";
import { enforceLicenseForApi } from "@/lib/license-guard";

export async function POST() {
  const licenseError = await enforceLicenseForApi();
  if (licenseError) return licenseError;
  await clearLoginSession();
  return NextResponse.json({ success: true });
}
