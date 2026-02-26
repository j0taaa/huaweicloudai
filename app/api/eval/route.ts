import { NextResponse } from "next/server";
import HuaweiCloudSigner from "../../../huawei_signer.js";
import { enforceLicenseForApi } from "@/lib/license-guard";

type ProjectIdEntry = {
  region: string;
  projectId: string;
  name?: string;
};

type EvalRequest = {
  code: string;
  context?: {
    accessKey?: string;
    secretKey?: string;
    projectIds?: ProjectIdEntry[];
  };
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

const SERVICE_AK = process.env.HUAWEI_CLOUD_AK;
const SERVICE_SK = process.env.HUAWEI_CLOUD_SK;
const REGION = process.env.HUAWEI_CLOUD_REGION || "sa-brazil-1";
const PROJECT_ID = process.env.HUAWEI_CLOUD_PROJECT_ID;
const FUNCTION_URN = process.env.FUNCTIONGRAPH_EVAL_URN || "urn:fss:sa-brazil-1:9803447aabf141f495dfa6939e308f6e:function:default:code-evaluator:latest";

/**
 * Resolves credential placeholders in code with actual values.
 * 
 * Placeholders:
 * - `${AK}` → Access Key
 * - `${SK}` → Secret Key
 * - `${PROJECT_ID:<region>}` → Project ID for the specified region
 */
const resolvePlaceholders = (
  code: string,
  accessKey?: string,
  secretKey?: string,
  projectIds?: ProjectIdEntry[]
): string => {
  let resolvedCode = code;

  // Replace ${AK} with actual access key
  if (accessKey) {
    resolvedCode = resolvedCode.replace(/\$\{AK\}/g, accessKey);
  }

  // Replace ${SK} with actual secret key
  if (secretKey) {
    resolvedCode = resolvedCode.replace(/\$\{SK\}/g, secretKey);
  }

  // Replace ${PROJECT_ID:<region>} with actual project ID
  if (projectIds && projectIds.length > 0) {
    // Create a map of region to project ID for quick lookup
    const projectIdMap = new Map<string, string>();
    for (const entry of projectIds) {
      projectIdMap.set(entry.region, entry.projectId);
    }

    // Replace ${PROJECT_ID:<region>} patterns
    resolvedCode = resolvedCode.replace(/\$\{PROJECT_ID:([^}]+)\}/g, (match, region) => {
      const projectId = projectIdMap.get(region);
      if (projectId) {
        return projectId;
      }
      // If no matching region found, leave the placeholder but log a warning
      console.warn(`No project ID found for region: ${region}`);
      return match;
    });
  }

  return resolvedCode;
};

export async function POST(request: Request) {
  const licenseError = await enforceLicenseForApi();
  if (licenseError) return licenseError;
  const { code, context } = (await request.json()) as EvalRequest;

  if (!code) {
    return NextResponse.json(
      { error: "Code is required." },
      { status: 400 },
    );
  }

  // Use user-provided credentials if available, otherwise fall back to service credentials
  const ak = context?.accessKey?.trim() || SERVICE_AK;
  const sk = context?.secretKey?.trim() || SERVICE_SK;

  if (!ak || !sk) {
    return NextResponse.json(
      { error: "No credentials provided. Please configure your Huawei Cloud credentials or set HUAWEI_CLOUD_AK and HUAWEI_CLOUD_SK environment variables." },
      { status: 400 },
    );
  }

  if (!PROJECT_ID) {
    return NextResponse.json(
      { error: "Missing required environment variable: HUAWEI_CLOUD_PROJECT_ID" },
      { status: 500 },
    );
  }

  try {
    // Resolve placeholders in the code with actual credentials
    const resolvedCode = resolvePlaceholders(
      code,
      context?.accessKey,
      context?.secretKey,
      context?.projectIds
    );

    // Wrap the code to automatically call main() like the original implementation
    const wrappedCode = `
      ${resolvedCode}
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

    const signedHeaders = signRequest(options as RequestOptions, ak, sk);
    
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
