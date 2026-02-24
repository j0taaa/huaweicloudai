import Database from "bun:sqlite";
import { randomUUID } from "node:crypto";

const db = new Database("./admin.db", { create: true, readwrite: true });

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

export const createSession = () => {
  const token = randomUUID();
  db.query("INSERT INTO admin_sessions (token, created_at) VALUES (?, ?)").run(token, Date.now());
  return token;
};

export const hasSession = (token: string) => {
  const row = db.query<{ token: string }>("SELECT token FROM admin_sessions WHERE token = ? LIMIT 1").get(token);
  return Boolean(row);
};

export const deleteSession = (token: string) => {
  db.query("DELETE FROM admin_sessions WHERE token = ?").run(token);
};

export const getOptions = () => {
  return db
    .query<{ key: string; value: string }>("SELECT key, value FROM admin_options ORDER BY key ASC")
    .all();
};

export const upsertOption = (key: string, value: string) => {
  db.query(
    `INSERT INTO admin_options (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at`,
  ).run(key, value, Date.now());
};
