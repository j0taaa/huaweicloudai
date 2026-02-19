import { NextResponse } from "next/server";

type SignRequest = {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  params?: Record<string, string | string[]>;
  data?: string;
  ak: string;
  sk: string;
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

const urlEncode = (value: string) => {
  const input = typeof value === "string" ? value : String(value);
  const noEscape = new Set(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~",
  );
  let output = "";

  for (const character of input) {
    if (noEscape.has(character)) {
      output += character;
    } else {
      const hex = character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
      output += `%${hex}`;
    }
  }

  return output;
};

const buildCanonicalURI = (path: string) => {
  if (!path) {
    return "/";
  }

  const segments = path.split("/").map((segment) => urlEncode(segment));
  let uri = segments.join("/");
  if (uri[uri.length - 1] !== "/") {
    uri += "/";
  }
  return uri;
};

const buildCanonicalQueryString = (params: Record<string, string | string[]>) => {
  const keys = Object.keys(params).sort();
  const pairs: string[] = [];

  keys.forEach((key) => {
    const encodedKey = urlEncode(key);
    const value = params[key];
    if (Array.isArray(value)) {
      const sortedValues = [...value].sort();
      sortedValues.forEach((item) => {
        pairs.push(`${encodedKey}=${urlEncode(item)}`);
      });
    } else {
      pairs.push(`${encodedKey}=${urlEncode(value)}`);
    }
  });

  return pairs.join("&");
};

const buildCanonicalHeaders = (headers: Record<string, string>) =>
  Object.keys(headers)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((key) => `${key.toLowerCase()}:${headers[key].trim()}\n`)
    .join("");

const buildSignedHeaders = (headers: Record<string, string>) =>
  Object.keys(headers)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((key) => key.toLowerCase())
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
  
  // Check if this is an OBS request
  const isOBS = host.includes('.obs.') || host.startsWith('obs.');
  
  if (isOBS) {
    return signOBSRequest(options, ak, sk);
  }
  
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

// OBS uses a different signing method
const signOBSRequest = async (
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
  const path = url.pathname;
  const host = url.host;
  
  const contentType = options.headers?.["content-type"] ?? "application/octet-stream";
  
  // Get date in RFC 7231 format
  const now = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateStr = `${days[now.getUTCDay()]}, ${String(now.getUTCDate()).padStart(2, '0')} ${months[now.getUTCMonth()]} ${now.getUTCFullYear()} ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')} GMT`;
  
  // Build canonical resource
  const canonicalResource = path.endsWith('/') ? path : path + '/';
  
  // Build string to sign for OBS
  const stringToSign = `${method}\n\n${contentType}\n${dateStr}\n${canonicalResource}`;
  
  // Calculate HMAC-SHA1 signature (OBS uses SHA1)
  const signature = await hmacSHA1(sk, stringToSign);
  
  // OBS format: OBS AccessKeyID:Signature
  const authHeader = `OBS ${ak}:${signature}`;
  
  return {
    'Host': host,
    'Content-Type': contentType,
    'Date': dateStr,
    'Authorization': authHeader,
  };
};

// HMAC-SHA1 implementation using Web Crypto API
const hmacSHA1 = async (key: string, message: string): Promise<string> => {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  
  // Convert to base64
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export async function POST(request: Request) {
  const body = (await request.json()) as SignRequest;

  if (!body.url || !body.ak || !body.sk) {
    return NextResponse.json(
      { error: "url, ak, and sk are required." },
      { status: 400 },
    );
  }

  try {
    const headers = await signRequest(body, body.ak, body.sk);
    return NextResponse.json({ headers });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to sign request.",
      },
      { status: 500 },
    );
  }
}
