import { NextResponse } from "next/server";
import { createAdminSession, isValidAdminPassword } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const { password } = (await request.json()) as { password?: string };

  if (!password || !isValidAdminPassword(password)) {
    return NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
  }

  await createAdminSession();
  return NextResponse.json({ success: true });
}
