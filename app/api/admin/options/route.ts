import { NextResponse } from "next/server";
import { getOptions, upsertOption } from "@/lib/admin-db";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { enforceLicenseForApi } from "@/lib/license-guard";

export async function GET() {
  const licenseError = await enforceLicenseForApi();
  if (licenseError) return licenseError;
  const isAuthenticated = await isAdminAuthenticated();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ options: getOptions() });
}

export async function POST(request: Request) {
  const licenseError = await enforceLicenseForApi();
  if (licenseError) return licenseError;
  const isAuthenticated = await isAdminAuthenticated();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key, value } = (await request.json()) as { key?: string; value?: string };

  if (!key || typeof value !== "string") {
    return NextResponse.json({ error: "key and value are required" }, { status: 400 });
  }

  upsertOption(key.trim(), value);

  return NextResponse.json({ success: true, options: getOptions() });
}
