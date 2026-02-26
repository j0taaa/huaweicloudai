import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { enforceLicenseForApi } from "@/lib/license-guard";

export async function GET() {
  const licenseError = await enforceLicenseForApi();
  if (licenseError) return licenseError;
  const authenticated = await isAdminAuthenticated();
  return NextResponse.json({ authenticated });
}
