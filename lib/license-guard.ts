import { NextResponse } from "next/server";
import { getLicenseSnapshot } from "@/lib/license";

export const enforceLicenseForApi = async () => {
  const snapshot = getLicenseSnapshot();

  if (snapshot.allowed) {
    return null;
  }

  return NextResponse.json(
    {
      error: "License access denied.",
      machineId: snapshot.machineId,
      status: snapshot.decision,
      reason: snapshot.reason,
    },
    { status: 403 },
  );
};
