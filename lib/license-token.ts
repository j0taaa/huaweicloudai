import { createPrivateKey, createPublicKey, randomUUID, sign, verify } from "node:crypto";
import { readFileSync } from "node:fs";

export type LicenseAuthorityStatus = "pending" | "approved" | "denied";

export type SignedLicenseTokenPayload = {
  uuid: string;
  status: LicenseAuthorityStatus;
  authority: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

export type SignedLicenseToken = {
  payload: SignedLicenseTokenPayload;
  signature: string;
};

export const HARD_CODED_LICENSE_AUTHORITY_URL = "https://hwctools.site";

// Replace this key pair before production rollout if needed.
// Public key is pinned in client builds; authority must sign with matching private key.
const HARD_CODED_LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAGp9chEz7khPKzbG+U3tFN140Z4r6uIDpOgXj2N6dCbw=
-----END PUBLIC KEY-----`;

const DEFAULT_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

let cachedPublicKey: ReturnType<typeof createPublicKey> | null = null;

const normalizePem = (value: string) => value.replace(/\\n/g, "\n").trim();

const serializePayload = (payload: SignedLicenseTokenPayload) =>
  JSON.stringify({
    uuid: payload.uuid,
    status: payload.status,
    authority: payload.authority,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    nonce: payload.nonce,
  });

const getPinnedPublicKey = () => {
  if (!cachedPublicKey) {
    cachedPublicKey = createPublicKey(HARD_CODED_LICENSE_PUBLIC_KEY_PEM);
  }
  return cachedPublicKey;
};

export const loadSigningPrivateKeyPem = () => {
  const path = process.env.LICENSE_SIGNING_PRIVATE_KEY_PATH?.trim();
  if (path) {
    return normalizePem(readFileSync(path, "utf8"));
  }

  const directPem = process.env.LICENSE_SIGNING_PRIVATE_KEY_PEM?.trim();
  if (directPem) {
    return normalizePem(directPem);
  }

  return null;
};

export const createSignedLicenseToken = (input: {
  uuid: string;
  status: LicenseAuthorityStatus;
  privateKeyPem: string;
  ttlMs?: number;
  now?: number;
}) => {
  const now = input.now ?? Date.now();
  const ttlMs =
    Number.isFinite(input.ttlMs) && (input.ttlMs ?? 0) > 0
      ? Number(input.ttlMs)
      : DEFAULT_TOKEN_TTL_MS;

  const payload: SignedLicenseTokenPayload = {
    uuid: input.uuid,
    status: input.status,
    authority: HARD_CODED_LICENSE_AUTHORITY_URL,
    issuedAt: now,
    expiresAt: now + ttlMs,
    nonce: randomUUID(),
  };

  const signature = sign(
    null,
    Buffer.from(serializePayload(payload), "utf8"),
    createPrivateKey(input.privateKeyPem),
  ).toString("base64");

  return { payload, signature } satisfies SignedLicenseToken;
};

export const verifySignedLicenseToken = (input: {
  token: SignedLicenseToken;
  expectedUuid: string;
  now?: number;
}) => {
  const { token } = input;
  const now = input.now ?? Date.now();

  if (!token || typeof token !== "object") {
    return { ok: false as const, reason: "missing-token" };
  }

  const payload = token.payload;
  if (!payload || typeof payload !== "object") {
    return { ok: false as const, reason: "missing-token-payload" };
  }

  if (payload.uuid !== input.expectedUuid) {
    return { ok: false as const, reason: "uuid-mismatch" };
  }

  if (!["pending", "approved", "denied"].includes(payload.status)) {
    return { ok: false as const, reason: "invalid-status" };
  }

  if (payload.authority !== HARD_CODED_LICENSE_AUTHORITY_URL) {
    return { ok: false as const, reason: "authority-mismatch" };
  }

  if (!Number.isFinite(payload.issuedAt) || !Number.isFinite(payload.expiresAt)) {
    return { ok: false as const, reason: "invalid-timestamps" };
  }

  if (payload.issuedAt > now + CLOCK_SKEW_MS) {
    return { ok: false as const, reason: "issued-in-future" };
  }

  if (payload.expiresAt < now - CLOCK_SKEW_MS) {
    return { ok: false as const, reason: "token-expired" };
  }

  if (typeof token.signature !== "string" || !token.signature.trim()) {
    return { ok: false as const, reason: "missing-signature" };
  }

  let signature: Buffer;
  try {
    signature = Buffer.from(token.signature, "base64");
  } catch {
    return { ok: false as const, reason: "invalid-signature-encoding" };
  }

  const valid = verify(
    null,
    Buffer.from(serializePayload(payload), "utf8"),
    getPinnedPublicKey(),
    signature,
  );

  if (!valid) {
    return { ok: false as const, reason: "invalid-signature" };
  }

  return {
    ok: true as const,
    payload,
  };
};
