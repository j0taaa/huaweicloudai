import { NextResponse } from "next/server";

export const runtime = "nodejs";

type WaitRequest = {
  seconds?: number;
};

export async function POST(request: Request) {
  const { seconds = 1 } = (await request.json()) as WaitRequest;

  if (typeof seconds !== "number" || Number.isNaN(seconds) || seconds < 0) {
    return NextResponse.json(
      { error: "seconds must be a non-negative number." },
      { status: 400 },
    );
  }

  const milliseconds = Math.floor(seconds * 1000);
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
  return NextResponse.json({ waitedSeconds: seconds });
}
