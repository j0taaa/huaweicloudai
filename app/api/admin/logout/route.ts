import { NextResponse } from "next/server";
import { clearAdminSession } from "@/lib/admin-auth";
import { enforceLicenseForApi } from "@/lib/license-guard";

export async function POST() {
  const licenseError = await enforceLicenseForApi();
  if (licenseError) return licenseError;
  await clearAdminSession();
  return NextResponse.json({ success: true });
}
