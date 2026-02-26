import { NextResponse } from "next/server";
import { createAdminSession, isValidAdminPassword } from "@/lib/admin-auth";
import { enforceLicenseForApi } from "@/lib/license-guard";

export async function POST(request: Request) {
  const licenseError = await enforceLicenseForApi();
  if (licenseError) return licenseError;
  const { password } = (await request.json()) as { password?: string };

  if (!password || !isValidAdminPassword(password)) {
    return NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
  }

  await createAdminSession();
  return NextResponse.json({ success: true });
}
