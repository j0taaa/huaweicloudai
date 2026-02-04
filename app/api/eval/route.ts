import { NextResponse } from "next/server";
import HuaweiCloudSigner from "../../../huawei_signer.js";

type EvalRequest = {
  code: string;
};

type RequestOptions = {
  method?: string;
  url: string;
  headers: Record<string, string>;
  params?: Record<string, string | string[]>;
  data?: unknown;
};

const signRequest = (options: RequestOptions, ak: string, sk: string) => {
  return HuaweiCloudSigner.signRequest(options as any, ak, sk);
};

export async function POST(request: Request) {
  const { code } = (await request.json()) as EvalRequest;

  if (!code) {
    return NextResponse.json(
      { error: "Code is required." },
      { status: 400 },
    );
  }

  try {
    const fn = new Function(
      "signRequest",
      `return (async () => {
        ${code}
        if (typeof main !== "function") {
          throw new Error("main() is not defined. Please define a main() function.");
        }
        return await main();
      })();`,
    );
    const evalResult = fn(signRequest);
    const resolvedResult = await evalResult;

    let serializedResult: string;
    if (typeof resolvedResult === "string") {
      serializedResult = resolvedResult;
    } else if (resolvedResult === undefined) {
      serializedResult = "undefined";
    } else {
      try {
        serializedResult = JSON.stringify(resolvedResult, null, 2);
      } catch {
        serializedResult = String(resolvedResult);
      }
    }

    return NextResponse.json({ result: serializedResult });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Error executing code: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
      },
      { status: 500 },
    );
  }
}
