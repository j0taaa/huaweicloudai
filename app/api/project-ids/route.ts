import { NextResponse } from "next/server";

type ProjectIdEntry = {
  region: string;
  projectId: string;
  name?: string;
};

type ProjectIdsRequest = {
  accessKey?: string;
  secretKey?: string;
};

const encoder = new TextEncoder();

const hmacSHA256 = async (key: string, message: string) => {
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(message);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const hexHash = async (message: string) => {
  const messageData = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", messageData);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const hashPayload = (payload: string) => hexHash(payload);

const getDateTime = () => {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
};

const buildCanonicalURI = (path: string) => {
  if (!path) {
    return "/";
  }
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
};

const buildCanonicalQueryString = (params: Record<string, string | string[]>) =>
  Object.keys(params)
    .sort()
    .map((key) => {
      const value = params[key];
      if (Array.isArray(value)) {
        return value
          .map(
            (item) =>
              `${encodeURIComponent(key)}=${encodeURIComponent(item)}`,
          )
          .join("&");
      }
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join("&");

const buildCanonicalHeaders = (headers: Record<string, string>) =>
  Object.keys(headers)
    .sort()
    .map((key) => `${key.toLowerCase()}:${headers[key].trim()}\n`)
    .join("");

const buildSignedHeaders = (headers: Record<string, string>) =>
  Object.keys(headers)
    .map((key) => key.toLowerCase())
    .sort()
    .join(";");

const buildCanonicalRequest = (
  method: string,
  canonicalURI: string,
  canonicalQueryString: string,
  canonicalHeaders: string,
  signedHeaders: string,
  payloadHash: string,
) =>
  [
    method,
    canonicalURI,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

const signRequest = async (
  options: {
    method?: string;
    url: string;
    headers?: Record<string, string>;
    params?: Record<string, string | string[]>;
    data?: string;
  },
  ak: string,
  sk: string,
) => {
  const method = options.method ?? "GET";
  const url = new URL(options.url);
  const host = url.host;
  const headersToSign: Record<string, string> = {
    host,
    "content-type": options.headers?.["content-type"] ?? "application/json",
  };

  if (options.headers?.["x-project-id"]) {
    headersToSign["x-project-id"] = options.headers["x-project-id"];
  }

  const dateTime = getDateTime();
  headersToSign["x-sdk-date"] = dateTime;

  const mergedParams: Record<string, string | string[]> = {
    ...(options.params ?? {}),
  };
  url.searchParams.forEach((value, key) => {
    if (mergedParams[key]) {
      const existing = mergedParams[key];
      mergedParams[key] = Array.isArray(existing)
        ? [...existing, value]
        : [existing, value];
    } else {
      mergedParams[key] = value;
    }
  });

  const canonicalURI = buildCanonicalURI(url.pathname);
  const canonicalQueryString = buildCanonicalQueryString(mergedParams);
  const canonicalHeaders = buildCanonicalHeaders(headersToSign);
  const signedHeaders = buildSignedHeaders(headersToSign);
  const payloadHash = await hashPayload(options.data ?? "");
  const canonicalRequest = buildCanonicalRequest(
    method,
    canonicalURI,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  );
  const canonicalRequestHash = await hexHash(canonicalRequest);
  const stringToSign = `SDK-HMAC-SHA256\n${dateTime}\n${canonicalRequestHash}`;
  const signature = await hmacSHA256(sk, stringToSign);
  const authHeader = `SDK-HMAC-SHA256 Access=${ak}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...headersToSign,
    Authorization: authHeader,
  };
};

const fetchRegions = async (ak: string, sk: string) => {
  const url = "https://iam.myhuaweicloud.com/v3/regions";
  const headers = await signRequest(
    { method: "GET", url, headers: { "content-type": "application/json" } },
    ak,
    sk,
  );

  const response = await fetch(url, { method: "GET", headers });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Unable to fetch Huawei Cloud regions.");
  }

  const data = (await response.json()) as {
    regions?: Array<{
      id?: string;
      region_id?: string;
    }>;
  };

  return (
    data.regions
      ?.map((region) => region.id ?? region.region_id)
      .filter((region): region is string => Boolean(region)) ?? []
  );
};

const fetchProjectsForRegion = async (
  region: string,
  ak: string,
  sk: string,
) => {
  const url = `https://iam.${region}.myhuaweicloud.com/v3/projects`;
  const headers = await signRequest(
    { method: "GET", url, headers: { "content-type": "application/json" } },
    ak,
    sk,
  );
  const response = await fetch(url, { method: "GET", headers });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      errorText || `Unable to fetch projects for region ${region}.`,
    );
  }

  const data = (await response.json()) as {
    projects?: Array<{ id: string; name?: string }>;
  };

  return (
    data.projects?.map((project) => ({
      region,
      projectId: project.id,
      name: project.name,
    })) ?? []
  );
};

const fetchProjectIds = async (ak: string, sk: string) => {
  const regions = await fetchRegions(ak, sk);
  const results = await Promise.allSettled(
    regions.map((region) => fetchProjectsForRegion(region, ak, sk)),
  );

  const entries: ProjectIdEntry[] = [];
  const errors: string[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      entries.push(...result.value);
    } else {
      errors.push(`${regions[index]}: ${result.reason}`);
    }
  });

  return { entries, errors };
};

export async function POST(request: Request) {
  const body = (await request.json()) as ProjectIdsRequest;
  const accessKey = body.accessKey?.trim();
  const secretKey = body.secretKey?.trim();

  if (!accessKey || !secretKey) {
    return NextResponse.json(
      { error: "Access key and secret key are required." },
      { status: 400 },
    );
  }

  try {
    const { entries, errors } = await fetchProjectIds(accessKey, secretKey);
    return NextResponse.json({ entries, errors });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to fetch Huawei Cloud projects.",
      },
      { status: 500 },
    );
  }
}
