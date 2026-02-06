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

const AK = process.env.HUAWEI_CLOUD_AK;
const SK = process.env.HUAWEI_CLOUD_SK;
const REGION = process.env.HUAWEI_CLOUD_REGION || "sa-brazil-1";
const PROJECT_ID = process.env.HUAWEI_CLOUD_PROJECT_ID;
const FUNCTION_URN = process.env.FUNCTIONGRAPH_EVAL_URN || "urn:fss:sa-brazil-1:9803447aabf141f495dfa6939e308f6e:function:default:code-evaluator:latest";

export async function POST(request: Request) {
  const { code } = (await request.json()) as EvalRequest;

  if (!code) {
    return NextResponse.json(
      { error: "Code is required." },
      { status: 400 },
    );
  }

  if (!AK || !SK || !PROJECT_ID) {
    return NextResponse.json(
      { error: "Missing required environment variables: HUAWEI_CLOUD_AK, HUAWEI_CLOUD_SK, HUAWEI_CLOUD_PROJECT_ID" },
      { status: 500 },
    );
  }

  try {
    // Wrap the code to automatically call main() like the original implementation
    const wrappedCode = `
      ${code}
      if (typeof main !== "function") {
        throw new Error("main() is not defined. Please define a main() function.");
      }
      return await main();
    `;

    const testEvent = {
      code: wrappedCode
    };

    const options = {
      method: 'POST',
      url: `https://functiongraph.${REGION}.myhuaweicloud.com/v2/${PROJECT_ID}/fgs/functions/${FUNCTION_URN}/invocations`,
      params: {},
      data: JSON.stringify(testEvent),
      headers: { 
        'content-type': 'application/json',
        'X-Cff-Request-Version': 'v1'
      },
    };

    const signedHeaders = signRequest(options as RequestOptions, AK, SK);
    
    const response = await fetch(options.url, {
      method: options.method,
      headers: signedHeaders,
      body: options.data,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `FunctionGraph request failed: ${errorText}` },
        { status: response.status },
      );
    }

    const fgResult = await response.json();
    
    if (fgResult.error) {
      return NextResponse.json(
        { error: `FunctionGraph execution error: ${fgResult.error}` },
        { status: 500 },
      );
    }

    const resolvedResult = fgResult.result;

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
