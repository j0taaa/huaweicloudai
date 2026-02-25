import Database from "bun:sqlite";
import { randomUUID } from "node:crypto";

const db = new Database("./admin.db", { create: true, readwrite: true });

let isInitialized = false;

const withBusyRetry = (action: () => void) => {
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      action();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isBusy = message.includes("database is locked") || message.includes("SQLITE_BUSY");

      if (!isBusy || attempt === maxAttempts - 1) {
        throw error;
      }

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
    }
  }
};

const ensureInitialized = () => {
  if (isInitialized) {
    return;
  }

  withBusyRetry(() => {
    db.run("PRAGMA busy_timeout = 5000;");
    db.run("PRAGMA journal_mode = WAL;");
    db.run(
      `CREATE TABLE IF NOT EXISTS admin_sessions (
        token TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      )`,
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS admin_options (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS app_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        approved INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )`,
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS user_sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(user_id) REFERENCES app_users(id) ON DELETE CASCADE
      )`,
    );
    isInitialized = true;
  });
};

export const createSession = () => {
  ensureInitialized();
  const token = randomUUID();
  db.query("INSERT INTO admin_sessions (token, created_at) VALUES (?, ?)").run(token, Date.now());
  return token;
};

export const hasSession = (token: string) => {
  ensureInitialized();
  const row = db.query<{ token: string }>("SELECT token FROM admin_sessions WHERE token = ? LIMIT 1").get(token);
  return Boolean(row);
};

export const deleteSession = (token: string) => {
  ensureInitialized();
  db.query("DELETE FROM admin_sessions WHERE token = ?").run(token);
};

export const getOptions = () => {
  ensureInitialized();
  return db
    .query<{ key: string; value: string }>("SELECT key, value FROM admin_options ORDER BY key ASC")
    .all();
};

export const getOptionValue = (key: string) => {
  ensureInitialized();
  const row = db
    .query<{ value: string }>("SELECT value FROM admin_options WHERE key = ? LIMIT 1")
    .get(key);
  return row?.value;
};

export const upsertOption = (key: string, value: string) => {
  ensureInitialized();
  db.query(
    `INSERT INTO admin_options (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at`,
  ).run(key, value, Date.now());
};

export type AppUser = {
  id: string;
  username: string;
  approved: number;
  created_at: number;
};

export const createAppUser = (username: string, passwordHash: string) => {
  ensureInitialized();
  const id = randomUUID();
  db.query("INSERT INTO app_users (id, username, password_hash, approved, created_at) VALUES (?, ?, ?, 0, ?)").run(
    id,
    username,
    passwordHash,
    Date.now(),
  );
  return id;
};

export const getAppUserByUsername = (username: string) => {
  ensureInitialized();
  return db
    .query<{ id: string; username: string; password_hash: string; approved: number }>(
      "SELECT id, username, password_hash, approved FROM app_users WHERE username = ? LIMIT 1",
    )
    .get(username);
};

export const listAppUsers = () => {
  ensureInitialized();
  return db
    .query<AppUser>("SELECT id, username, approved, created_at FROM app_users ORDER BY created_at DESC")
    .all();
};

export const setUserApproved = (id: string, approved: boolean) => {
  ensureInitialized();
  db.query("UPDATE app_users SET approved = ? WHERE id = ?").run(approved ? 1 : 0, id);
};

export const deleteUser = (id: string) => {
  ensureInitialized();
  db.query("DELETE FROM app_users WHERE id = ?").run(id);
};

export const createUserSession = (userId: string) => {
  ensureInitialized();
  const token = randomUUID();
  db.query("INSERT INTO user_sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(token, userId, Date.now());
  return token;
};

export const getUserSession = (token: string) => {
  ensureInitialized();
  return db
    .query<{ id: string; username: string; approved: number }>(
      `SELECT u.id, u.username, u.approved
       FROM user_sessions s
       JOIN app_users u ON u.id = s.user_id
       WHERE s.token = ?
       LIMIT 1`,
    )
    .get(token);
};

export const deleteUserSession = (token: string) => {
  ensureInitialized();
  db.query("DELETE FROM user_sessions WHERE token = ?").run(token);
};
