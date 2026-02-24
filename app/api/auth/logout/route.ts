import { NextResponse } from "next/server";
import { clearLoginSession } from "@/lib/user-auth";

export async function POST() {
  await clearLoginSession();
  return NextResponse.json({ success: true });
}
