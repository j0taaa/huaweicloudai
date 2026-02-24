import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import { createSession, deleteSession, hasSession } from "@/lib/admin-db";

const ADMIN_SESSION_COOKIE = "admin_session";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";

const hash = (value: string) => createHash("sha256").update(value).digest();

export const isValidAdminPassword = (password: string) => {
  const expected = hash(ADMIN_PASSWORD);
  const received = hash(password);
  return timingSafeEqual(expected, received);
};

export const createAdminSession = async () => {
  const cookieStore = await cookies();
  const token = createSession();
  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
};

export const clearAdminSession = async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (token) {
    deleteSession(token);
  }
  cookieStore.delete(ADMIN_SESSION_COOKIE);
};

export const isAdminAuthenticated = async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) {
    return false;
  }
  return hasSession(token);
};
