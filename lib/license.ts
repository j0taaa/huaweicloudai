import os from "node:os";
import { randomUUID } from "node:crypto";
import { getOptionValue, upsertOption } from "@/lib/admin-db";
import {
  HARD_CODED_LICENSE_AUTHORITY_URL,
  type SignedLicenseToken,
  verifySignedLicenseToken,
} from "@/lib/license-token";

export type LicenseMode = "disabled" | "client";
export type LicenseDecision = "unknown" | "pending" | "approved" | "denied";
export type LicenseEnforcement = "required" | "disabled";

type LicenseRuntimeState = {
  started: boolean;
  machineId: string;
  decision: LicenseDecision;
  lastSuccessfulSyncAt: number | null;
  lastAttemptAt: number | null;
  lastError: string | null;
  registered: boolean;
  inFlight: Promise<void> | null;
  timer: ReturnType<typeof setInterval> | null;
};

export type LicenseSnapshot = {
  mode: LicenseMode;
  enforcement: LicenseEnforcement;
  authorityUrl: string;
  machineId: string;
  decision: LicenseDecision;
  allowed: boolean;
  reason: string;
  lastSuccessfulSyncAt: number | null;
  lastAttemptAt: number | null;
  lastError: string | null;
  gracePeriodMs: number;
  graceRemainingMs: number;
};

const MACHINE_UUID_OPTION = "license.client.uuid";
const DECISION_OPTION = "license.client.decision";
const LAST_SUCCESS_OPTION = "license.client.lastSuccessfulSyncAt";
const LAST_ATTEMPT_OPTION = "license.client.lastAttemptAt";
const LAST_ERROR_OPTION = "license.client.lastError";
const REGISTERED_OPTION = "license.client.registered";
const VALID_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_HEARTBEAT_MS = 60 * 60 * 1000;
const DEFAULT_GRACE_MS = 72 * 60 * 60 * 1000;

const getNumericEnv = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseMode = (value: string | undefined): LicenseMode => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "client") return "client";
  return "disabled";
};

const parseEnforcement = (value: string | undefined): LicenseEnforcement => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "required" || normalized === "true" || normalized === "1") {
    return "required";
  }
  return "disabled";
};

const parseDecision = (value: string | undefined): LicenseDecision => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "approved") return "approved";
  if (normalized === "pending") return "pending";
  if (normalized === "denied") return "denied";
  return "unknown";
};

const readNumberOption = (key: string) => {
  const value = getOptionValue(key);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const readBooleanOption = (key: string) => {
  const value = getOptionValue(key);
  if (!value) return false;
  return value.trim().toLowerCase() === "true";
};

const persistNullableNumber = (key: string, value: number | null) => {
  if (value === null) {
    upsertOption(key, "");
    return;
  }
  upsertOption(key, String(value));
};

const persistState = (state: LicenseRuntimeState) => {
  upsertOption(DECISION_OPTION, state.decision);
  persistNullableNumber(LAST_SUCCESS_OPTION, state.lastSuccessfulSyncAt);
  persistNullableNumber(LAST_ATTEMPT_OPTION, state.lastAttemptAt);
  upsertOption(LAST_ERROR_OPTION, state.lastError ?? "");
  upsertOption(REGISTERED_OPTION, String(state.registered));
};

const getOrCreateMachineId = () => {
  const existing = getOptionValue(MACHINE_UUID_OPTION)?.trim() ?? "";
  if (VALID_UUID_REGEX.test(existing)) {
    return existing;
  }
  const next = randomUUID();
  upsertOption(MACHINE_UUID_OPTION, next);
  return next;
};

const getSettings = () => {
  const mode = parseMode(process.env.LICENSE_MODE);
  const enforcement = parseEnforcement(process.env.LICENSE_ENFORCEMENT);
  const authorityUrl = HARD_CODED_LICENSE_AUTHORITY_URL;
  const sharedSecret = process.env.LICENSE_SHARED_SECRET?.trim() ?? "";
  const heartbeatMs = getNumericEnv(process.env.LICENSE_HEARTBEAT_INTERVAL_MS, DEFAULT_HEARTBEAT_MS);
  const gracePeriodMs = getNumericEnv(process.env.LICENSE_GRACE_PERIOD_MS, DEFAULT_GRACE_MS);

  return {
    mode,
    enforcement,
    authorityUrl,
    sharedSecret,
    heartbeatMs,
    gracePeriodMs,
  };
};

const loadState = (): LicenseRuntimeState => ({
  started: false,
  machineId: getOrCreateMachineId(),
  decision: parseDecision(getOptionValue(DECISION_OPTION)),
  lastSuccessfulSyncAt: readNumberOption(LAST_SUCCESS_OPTION),
  lastAttemptAt: readNumberOption(LAST_ATTEMPT_OPTION),
  lastError: getOptionValue(LAST_ERROR_OPTION)?.trim() || null,
  registered: readBooleanOption(REGISTERED_OPTION),
  inFlight: null,
  timer: null,
});

declare global {
  var __HCAI_LICENSE_RUNTIME__: LicenseRuntimeState | undefined;
}

const runtimeState = (): LicenseRuntimeState => {
  if (!globalThis.__HCAI_LICENSE_RUNTIME__) {
    globalThis.__HCAI_LICENSE_RUNTIME__ = loadState();
  }
  return globalThis.__HCAI_LICENSE_RUNTIME__;
};

const setSyncError = (state: LicenseRuntimeState, message: string) => {
  state.lastError = message;
  persistState(state);
};

const syncWithAuthority = async (state: LicenseRuntimeState) => {
  const settings = getSettings();
  const now = Date.now();
  state.lastAttemptAt = now;

  const endpoint = new URL(
    state.registered ? "api/license/heartbeat" : "api/license/register",
    settings.authorityUrl.endsWith("/") ? settings.authorityUrl : `${settings.authorityUrl}/`,
  );

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (settings.sharedSecret) {
    headers["x-license-secret"] = settings.sharedSecret;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        uuid: state.machineId,
        hostname: os.hostname(),
        appVersion: process.env.npm_package_version ?? "unknown",
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      setSyncError(state, `Authority returned ${response.status}`);
      return;
    }

    const payload = (await response.json()) as {
      token?: SignedLicenseToken;
    };

    if (!payload.token) {
      setSyncError(state, "Authority response is missing signed token");
      return;
    }

    const verified = verifySignedLicenseToken({
      token: payload.token,
      expectedUuid: state.machineId,
      now,
    });
    if (!verified.ok) {
      setSyncError(state, `Authority token verification failed: ${verified.reason}`);
      return;
    }

    const decision = parseDecision(verified.payload.status);
    state.decision = decision === "unknown" ? "pending" : decision;
    state.lastSuccessfulSyncAt = now;
    state.lastError = null;
    state.registered = true;
    persistState(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setSyncError(state, message);
  }
};

const scheduleSync = (state: LicenseRuntimeState) => {
  if (state.inFlight) {
    return state.inFlight;
  }

  state.inFlight = (async () => {
    try {
      await syncWithAuthority(state);
    } finally {
      state.inFlight = null;
    }
  })();

  return state.inFlight;
};

export const ensureLicenseRuntimeStarted = () => {
  const settings = getSettings();
  const state = runtimeState();

  if (state.started) {
    return;
  }

  state.started = true;

  if (settings.mode !== "client" || settings.enforcement !== "required") {
    return;
  }

  void scheduleSync(state);
  state.timer = setInterval(() => {
    void scheduleSync(state);
  }, settings.heartbeatMs);
  state.timer.unref?.();
};

export const getLicenseSnapshot = (): LicenseSnapshot => {
  ensureLicenseRuntimeStarted();

  const settings = getSettings();
  const state = runtimeState();
  const now = Date.now();

  if (settings.mode !== "client" || settings.enforcement !== "required") {
    return {
      mode: settings.mode,
      enforcement: settings.enforcement,
      authorityUrl: settings.authorityUrl,
      machineId: state.machineId,
      decision: "approved",
      allowed: true,
      reason: "license-disabled",
      lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
      lastAttemptAt: state.lastAttemptAt,
      lastError: state.lastError,
      gracePeriodMs: settings.gracePeriodMs,
      graceRemainingMs: settings.gracePeriodMs,
    };
  }

  if (state.decision === "denied") {
    return {
      mode: settings.mode,
      enforcement: settings.enforcement,
      authorityUrl: settings.authorityUrl,
      machineId: state.machineId,
      decision: state.decision,
      allowed: false,
      reason: "denied-by-authority",
      lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
      lastAttemptAt: state.lastAttemptAt,
      lastError: state.lastError,
      gracePeriodMs: settings.gracePeriodMs,
      graceRemainingMs: 0,
    };
  }

  if (state.decision === "pending" || state.decision === "unknown" || !state.lastSuccessfulSyncAt) {
    return {
      mode: settings.mode,
      enforcement: settings.enforcement,
      authorityUrl: settings.authorityUrl,
      machineId: state.machineId,
      decision: state.decision,
      allowed: false,
      reason: state.decision === "unknown" ? "awaiting-initial-sync" : "pending-approval",
      lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
      lastAttemptAt: state.lastAttemptAt,
      lastError: state.lastError,
      gracePeriodMs: settings.gracePeriodMs,
      graceRemainingMs: 0,
    };
  }

  const elapsedSinceLastSuccess = now - state.lastSuccessfulSyncAt;
  const graceRemainingMs = Math.max(settings.gracePeriodMs - elapsedSinceLastSuccess, 0);

  if (elapsedSinceLastSuccess > settings.gracePeriodMs) {
    return {
      mode: settings.mode,
      enforcement: settings.enforcement,
      authorityUrl: settings.authorityUrl,
      machineId: state.machineId,
      decision: state.decision,
      allowed: false,
      reason: "grace-expired",
      lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
      lastAttemptAt: state.lastAttemptAt,
      lastError: state.lastError,
      gracePeriodMs: settings.gracePeriodMs,
      graceRemainingMs,
    };
  }

  return {
    mode: settings.mode,
    enforcement: settings.enforcement,
    authorityUrl: settings.authorityUrl,
    machineId: state.machineId,
    decision: state.decision,
    allowed: true,
    reason: state.lastError ? "grace-period-active" : "approved-by-authority",
    lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
    lastAttemptAt: state.lastAttemptAt,
    lastError: state.lastError,
    gracePeriodMs: settings.gracePeriodMs,
    graceRemainingMs,
  };
};
