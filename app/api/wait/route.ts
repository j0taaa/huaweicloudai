import { NextResponse } from "next/server";

type WaitRequest = {
  seconds?: number;
};

const MIN_WAIT_SECONDS = 0;
const MAX_WAIT_SECONDS = 120;

export async function POST(request: Request) {
  const body = (await request.json()) as WaitRequest;
  const seconds = body.seconds;

  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    return NextResponse.json(
      { error: "seconds must be a finite number." },
      { status: 400 },
    );
  }

  if (seconds < MIN_WAIT_SECONDS || seconds > MAX_WAIT_SECONDS) {
    return NextResponse.json(
      { error: `seconds must be between ${MIN_WAIT_SECONDS} and ${MAX_WAIT_SECONDS}.` },
      { status: 400 },
    );
  }

  const durationMs = Math.round(seconds * 1000);
  await new Promise((resolve) => setTimeout(resolve, durationMs));

  return NextResponse.json({
    result: `Waited ${seconds} second${seconds === 1 ? "" : "s"}.`,
    waitedSeconds: seconds,
  });
}
