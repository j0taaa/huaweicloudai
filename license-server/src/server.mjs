import Database from "bun:sqlite";
import { createHash, createPrivateKey, randomUUID, sign, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const AUTHORITY_URL = "https://license.hwctools.site";
const COOKIE_NAME = "license_admin_session";
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PORT = Number(process.env.PORT || 80);
const HOST = process.env.HOST?.trim() || "0.0.0.0";
const DEFAULT_ADMIN_PASSWORD = process.env.LICENSE_ADMIN_PASSWORD?.trim() || "admin123";
const SHARED_SECRET = process.env.LICENSE_SHARED_SECRET?.trim() || "";
const DB_PATH = process.env.LICENSE_DB_PATH?.trim() || path.join(process.cwd(), "license.db");
const TOKEN_TTL_MS = Number(process.env.LICENSE_TOKEN_TTL_MS || 2 * 60 * 60 * 1000);

const normalizePem = (value) => value.replace(/\\n/g, "\n").trim();

const loadPrivateKeyPem = () => {
  const fromPath = process.env.LICENSE_SIGNING_PRIVATE_KEY_PATH?.trim();
  if (fromPath) {
    if (!existsSync(fromPath)) {
      throw new Error(`LICENSE_SIGNING_PRIVATE_KEY_PATH not found: ${fromPath}`);
    }
    return normalizePem(readFileSync(fromPath, "utf8"));
  }

  const fromEnv = process.env.LICENSE_SIGNING_PRIVATE_KEY_PEM?.trim();
  if (fromEnv) {
    return normalizePem(fromEnv);
  }

  throw new Error("Missing LICENSE_SIGNING_PRIVATE_KEY_PEM or LICENSE_SIGNING_PRIVATE_KEY_PATH");
};

const SIGNING_PRIVATE_KEY_PEM = loadPrivateKeyPem();
const SIGNING_PRIVATE_KEY = createPrivateKey(SIGNING_PRIVATE_KEY_PEM);

const db = new Database(DB_PATH, { create: true, readwrite: true });
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA busy_timeout = 5000;");
db.run(
  `CREATE TABLE IF NOT EXISTS license_clients (
    uuid TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    last_decision_at INTEGER,
    hostname TEXT NOT NULL DEFAULT '',
    app_version TEXT NOT NULL DEFAULT '',
    last_ip TEXT NOT NULL DEFAULT ''
  )`,
);
db.run(
  `CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
);

const sessions = new Map();

const sha = (value) => createHash("sha256").update(value).digest();
const shaHex = (value) => createHash("sha256").update(value).digest("hex");
const getAdminSetting = (key) => {
  const row = db.query("SELECT value FROM admin_settings WHERE key = ? LIMIT 1").get(key);
  return typeof row?.value === "string" ? row.value : null;
};
const setAdminSetting = (key, value) => {
  db.query(
    "INSERT INTO admin_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
};

const loadAdminPasswordDigest = () => {
  const stored = getAdminSetting("admin_password_sha256");
  if (stored && /^[a-f0-9]{64}$/i.test(stored)) {
    return Buffer.from(stored, "hex");
  }
  return sha(DEFAULT_ADMIN_PASSWORD);
};
let adminPasswordDigest = loadAdminPasswordDigest();

const isAdminPasswordValid = (value) => {
  const received = sha(value);
  if (received.length !== adminPasswordDigest.length) return false;
  return timingSafeEqual(adminPasswordDigest, received);
};

const updateAdminPassword = (nextPassword) => {
  const digestHex = shaHex(nextPassword);
  setAdminSetting("admin_password_sha256", digestHex);
  adminPasswordDigest = Buffer.from(digestHex, "hex");
};

const now = () => Date.now();

const serializePayload = (payload) =>
  JSON.stringify({
    uuid: payload.uuid,
    status: payload.status,
    authority: payload.authority,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    nonce: payload.nonce,
  });

const createSignedToken = (uuid, status) => {
  const issuedAt = now();
  const payload = {
    uuid,
    status,
    authority: AUTHORITY_URL,
    issuedAt,
    expiresAt: issuedAt + (Number.isFinite(TOKEN_TTL_MS) && TOKEN_TTL_MS > 0 ? TOKEN_TTL_MS : 2 * 60 * 60 * 1000),
    nonce: randomUUID(),
  };

  const signature = sign(
    null,
    Buffer.from(serializePayload(payload), "utf8"),
    SIGNING_PRIVATE_KEY,
  ).toString("base64");

  return { payload, signature };
};

const getClientIp = (request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "";
};

const upsertClientHeartbeat = ({ uuid, hostname, appVersion, ip }) => {
  const ts = now();
  db.query(
    `INSERT INTO license_clients (
      uuid, display_name, status, first_seen_at, last_seen_at, last_decision_at, hostname, app_version, last_ip
    ) VALUES (?, '', 'pending', ?, ?, NULL, ?, ?, ?)
    ON CONFLICT(uuid) DO UPDATE SET
      last_seen_at = excluded.last_seen_at,
      hostname = excluded.hostname,
      app_version = excluded.app_version,
      last_ip = excluded.last_ip`,
  ).run(uuid, ts, ts, hostname, appVersion, ip);
};

const getClient = (uuid) =>
  db
    .query(
      `SELECT uuid, display_name, status, first_seen_at, last_seen_at, last_decision_at, hostname, app_version, last_ip
       FROM license_clients
       WHERE uuid = ?
       LIMIT 1`,
    )
    .get(uuid);

const listClients = () =>
  db
    .query(
      `SELECT uuid, display_name, status, first_seen_at, last_seen_at, last_decision_at, hostname, app_version, last_ip
       FROM license_clients
       ORDER BY last_seen_at DESC`,
    )
    .all();

const setClientStatus = (uuid, status) => {
  db.query("UPDATE license_clients SET status = ?, last_decision_at = ? WHERE uuid = ?").run(status, now(), uuid);
};

const setClientName = (uuid, displayName) => {
  db.query("UPDATE license_clients SET display_name = ? WHERE uuid = ?").run(displayName, uuid);
};

const htmlEscape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatDate = (value) => (value ? new Date(value).toLocaleString() : "-");

const parseCookies = (request) => {
  const raw = request.headers.get("cookie") || "";
  const out = new Map();

  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);
    out.set(key, decodeURIComponent(value));
  }

  return out;
};

const getSessionToken = (request) => parseCookies(request).get(COOKIE_NAME) || null;

const isAdminAuthenticated = (request) => {
  const token = getSessionToken(request);
  if (!token) return false;
  return sessions.has(token);
};

const createSession = () => {
  const token = randomUUID();
  sessions.set(token, now());
  return token;
};

const clearSession = (request) => {
  const token = getSessionToken(request);
  if (token) sessions.delete(token);
};

const withSetCookie = (response, cookieValue) => {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", cookieValue);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const redirect = (request, pathname, searchParams = null) => {
  const target = new URL(pathname, request.url);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (!value) continue;
      target.searchParams.set(key, String(value));
    }
  }
  return Response.redirect(target, 303);
};

const loginPage = (error = "") => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>License Server Login</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; font-family: "Segoe UI", Arial, sans-serif; color: #1f2937;
             background: radial-gradient(circle at top, #e0ecff 0%, #eef2ff 40%, #f8fafc 100%); display: grid; place-items: center; padding: 20px; }
      .card { width: 100%; max-width: 460px; background: #fff; border: 1px solid #dbe4f0; border-radius: 16px; padding: 26px;
              box-shadow: 0 20px 50px -36px rgba(15, 23, 42, 0.65); }
      h2 { margin: 0; font-size: 24px; letter-spacing: -0.02em; }
      label { display: block; margin-top: 10px; font-size: 13px; color: #4b5563; font-weight: 600; }
      input, button { width: 100%; padding: 11px 12px; margin-top: 8px; border-radius: 10px; font-size: 14px; }
      input { border: 1px solid #cbd5e1; }
      input:focus { outline: 2px solid #93c5fd; outline-offset: 0; border-color: #60a5fa; }
      button { cursor: pointer; border: 0; color: #fff; font-weight: 700; letter-spacing: 0.01em;
               background: linear-gradient(90deg, #2563eb 0%, #3b82f6 55%, #0ea5e9 100%); }
      .error { margin-top: 12px; color: #b91c1c; background: #fee2e2; border: 1px solid #fecaca; border-radius: 10px; padding: 10px 12px; font-size: 13px; }
      .muted { color: #64748b; font-size: 12px; margin-top: 8px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>License Server</h2>
      <p class="muted">Authority URL: ${AUTHORITY_URL}</p>
      <form method="post" action="/login">
        <label for="password">Admin password</label>
        <input id="password" name="password" type="password" required />
        <button type="submit">Login</button>
      </form>
      ${error ? `<div class="error">${htmlEscape(error)}</div>` : ""}
    </div>
  </body>
</html>`;

const dashboardPage = ({ message = "", error = "" } = {}) => {
  const rows = listClients()
    .map(
      (client) => `
      <tr>
        <td><code>${htmlEscape(client.uuid)}</code></td>
        <td>
          <form method="post" action="/admin/client/name" style="display:flex; gap:8px; align-items:center;">
            <input type="hidden" name="uuid" value="${htmlEscape(client.uuid)}" />
            <input name="displayName" value="${htmlEscape(client.display_name || "")}" placeholder="Customer name" />
            <button type="submit">Save</button>
          </form>
        </td>
        <td>
          <form method="post" action="/admin/client/status" style="display:flex; gap:6px; flex-wrap:wrap;">
            <input type="hidden" name="uuid" value="${htmlEscape(client.uuid)}" />
            <button class="btn-approve" name="status" value="approved" type="submit">Approve</button>
            <button name="status" value="pending" type="submit">Pending</button>
            <button class="btn-deny" name="status" value="denied" type="submit">Deny</button>
          </form>
        </td>
        <td>${htmlEscape(client.status)}</td>
        <td>${htmlEscape(client.hostname || "-")}</td>
        <td>${htmlEscape(client.app_version || "-")}</td>
        <td>${htmlEscape(client.last_ip || "-")}</td>
        <td>${htmlEscape(formatDate(client.first_seen_at))}</td>
        <td>${htmlEscape(formatDate(client.last_seen_at))}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>License Server</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #1f2937; background: #f1f5f9; }
      .wrap { max-width: 1440px; margin: 0 auto; padding: 22px; }
      .top { display:flex; justify-content:space-between; gap: 14px; align-items:flex-start; margin-bottom: 16px; flex-wrap: wrap; }
      .title { margin: 0; font-size: 24px; letter-spacing: -0.02em; }
      .muted { color:#64748b; font-size: 13px; margin-top: 4px; }
      .panel { background:#fff; border:1px solid #dbe4f0; border-radius:14px; box-shadow: 0 14px 32px -28px rgba(15,23,42,0.65); }
      .alerts { margin-bottom: 12px; display: grid; gap: 8px; }
      .notice, .error { padding: 10px 12px; border-radius: 10px; font-size: 13px; }
      .notice { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
      .error { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
      table { width:100%; border-collapse: collapse; background:#fff; }
      th, td { border-bottom:1px solid #eef2f7; padding:10px; text-align:left; vertical-align:top; font-size:13px; }
      th { background:#f8fafc; color: #475569; position: sticky; top: 0; z-index: 1; }
      input { padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; min-width: 180px; background: #fff; }
      input:focus { outline: 2px solid #93c5fd; border-color: #60a5fa; }
      button { padding:8px 12px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; cursor:pointer; font-weight: 600; }
      .btn-primary { color: #fff; border-color: #2563eb; background: linear-gradient(90deg, #2563eb, #3b82f6); }
      .btn-approve { border-color: #22c55e; color: #166534; }
      .btn-deny { border-color: #ef4444; color: #991b1b; }
      code { font-size: 11px; }
      .empty { padding:18px; }
      .grid { display:grid; gap: 14px; grid-template-columns: 1fr; margin-bottom: 14px; }
      .card { padding: 14px; }
      .card h3 { margin: 0 0 8px; font-size: 15px; }
      .form-row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .table-wrap { overflow: auto; max-height: 68vh; border-radius: 14px; }
      @media (min-width: 1100px) { .grid { grid-template-columns: 1.2fr 1fr; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="top">
        <div>
          <h2 class="title">License Authority Console</h2>
          <div class="muted">Authority URL: ${AUTHORITY_URL}</div>
        </div>
        <form method="post" action="/logout"><button type="submit">Logout</button></form>
      </div>

      ${message || error ? `<div class="alerts">
        ${message ? `<div class="notice">${htmlEscape(message)}</div>` : ""}
        ${error ? `<div class="error">${htmlEscape(error)}</div>` : ""}
      </div>` : ""}

      <div class="grid">
        <section class="panel card">
          <h3>Owner Password</h3>
          <div class="muted">Change the admin password used to access this console.</div>
          <form method="post" action="/admin/password" style="margin-top: 12px;">
            <div class="form-row"><input name="currentPassword" type="password" placeholder="Current password" required /></div>
            <div class="form-row" style="margin-top:8px;"><input name="newPassword" type="password" placeholder="New password (min 8 chars)" minlength="8" required /></div>
            <div class="form-row" style="margin-top:8px;"><input name="confirmPassword" type="password" placeholder="Confirm new password" minlength="8" required /></div>
            <div class="form-row" style="margin-top:10px;"><button class="btn-primary" type="submit">Update Password</button></div>
          </form>
        </section>

        <section class="panel card">
          <h3>Client Statuses</h3>
          <div class="muted">Approve, pend, or deny registered subservers.</div>
        </section>
      </div>

      ${rows ? `<div class="panel table-wrap"><table>
        <thead>
          <tr>
            <th>UUID</th>
            <th>Name</th>
            <th>Actions</th>
            <th>Status</th>
            <th>Host</th>
            <th>Version</th>
            <th>IP</th>
            <th>First Seen</th>
            <th>Last Seen</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table></div>` : `<div class="panel empty">No subservers registered yet.</div>`}
    </div>
  </body>
</html>`;
};

const json = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const unauthorized = () => json({ error: "Unauthorized" }, 401);

const requireSharedSecret = (request) => {
  if (!SHARED_SECRET) return true;
  const received = request.headers.get("x-license-secret")?.trim() || "";
  return received === SHARED_SECRET;
};

const handleLicenseSync = async (request) => {
  if (!requireSharedSecret(request)) {
    return unauthorized();
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const uuid = typeof payload.uuid === "string" ? payload.uuid.trim() : "";
  if (!UUID_REGEX.test(uuid)) {
    return json({ error: "A valid uuid is required." }, 400);
  }

  const hostname = typeof payload.hostname === "string" ? payload.hostname.trim() : "";
  const appVersion = typeof payload.appVersion === "string" ? payload.appVersion.trim() : "";

  upsertClientHeartbeat({
    uuid,
    hostname,
    appVersion,
    ip: getClientIp(request),
  });

  const client = getClient(uuid);
  const status = client?.status === "approved" || client?.status === "denied" ? client.status : "pending";

  return json({
    uuid,
    displayName: client?.display_name || "",
    token: createSignedToken(uuid, status),
  });
};

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && (url.pathname === "/api/license/register" || url.pathname === "/api/license/heartbeat")) {
      return handleLicenseSync(request);
    }

    if (url.pathname === "/") {
      const notice = url.searchParams.get("notice") || "";
      const error = url.searchParams.get("error") || "";
      if (!isAdminAuthenticated(request)) {
        return new Response(loginPage(), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      return new Response(dashboardPage({ message: notice, error }), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (request.method === "POST" && url.pathname === "/login") {
      const form = await request.formData();
      const password = String(form.get("password") || "");
      if (!isAdminPasswordValid(password)) {
        return new Response(loginPage("Invalid password"), {
          status: 401,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      const token = createSession();
      const response = redirect(request, "/");
      return withSetCookie(
        response,
        `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
      );
    }

    if (request.method === "POST" && url.pathname === "/logout") {
      clearSession(request);
      const response = redirect(request, "/");
      return withSetCookie(response, `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    }

    if (request.method === "POST" && url.pathname === "/admin/client/status") {
      if (!isAdminAuthenticated(request)) {
        return redirect(request, "/");
      }

      const form = await request.formData();
      const uuid = String(form.get("uuid") || "").trim();
      const status = String(form.get("status") || "").trim();

      if (UUID_REGEX.test(uuid) && ["approved", "pending", "denied"].includes(status)) {
        setClientStatus(uuid, status);
      }
      return redirect(request, "/");
    }

    if (request.method === "POST" && url.pathname === "/admin/client/name") {
      if (!isAdminAuthenticated(request)) {
        return redirect(request, "/");
      }

      const form = await request.formData();
      const uuid = String(form.get("uuid") || "").trim();
      const displayName = String(form.get("displayName") || "").trim();

      if (UUID_REGEX.test(uuid)) {
        setClientName(uuid, displayName);
      }
      return redirect(request, "/");
    }

    if (request.method === "POST" && url.pathname === "/admin/password") {
      if (!isAdminAuthenticated(request)) {
        return redirect(request, "/");
      }

      const form = await request.formData();
      const currentPassword = String(form.get("currentPassword") || "");
      const newPassword = String(form.get("newPassword") || "");
      const confirmPassword = String(form.get("confirmPassword") || "");

      if (!isAdminPasswordValid(currentPassword)) {
        return redirect(request, "/", { error: "Current password is incorrect." });
      }
      if (newPassword.length < 8) {
        return redirect(request, "/", { error: "New password must be at least 8 characters." });
      }
      if (newPassword !== confirmPassword) {
        return redirect(request, "/", { error: "New password and confirmation do not match." });
      }

      updateAdminPassword(newPassword);
      return redirect(request, "/", { notice: "Owner password updated successfully." });
    }

    if (url.pathname === "/health") {
      return json({ ok: true, authorityUrl: AUTHORITY_URL });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`license-server running on http://${server.hostname}:${server.port}`);
console.log(`authority URL is fixed to ${AUTHORITY_URL}`);
