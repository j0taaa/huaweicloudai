import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import { createAppUser, createUserSession, deleteUserSession, getAppUserByUsername, getUserSession } from "@/lib/admin-db";
import { getAppConfig } from "@/lib/app-config";

const USER_SESSION_COOKIE = "app_user_session";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export const registerUser = (username: string, password: string) => {
  createAppUser(username, hash(password));
};

export const verifyUserCredentials = (username: string, password: string) => {
  const user = getAppUserByUsername(username);
  if (!user) return null;
  const expected = Buffer.from(user.password_hash, "hex");
  const received = Buffer.from(hash(password), "hex");
  if (!timingSafeEqual(expected, received)) return null;
  return user;
};

export const createLoginSession = async (userId: string) => {
  const cookieStore = await cookies();
  const token = createUserSession(userId);
  cookieStore.set(USER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
};

export const clearLoginSession = async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(USER_SESSION_COOKIE)?.value;
  if (token) deleteUserSession(token);
  cookieStore.delete(USER_SESSION_COOKIE);
};

export const getCurrentUser = async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(USER_SESSION_COOKIE)?.value;
  if (!token) return null;
  return getUserSession(token);
};

export const requireApprovedUser = async () => {
  const config = getAppConfig();
  if (!config.loginEnabled) return { ok: true as const, user: null };
  const user = await getCurrentUser();
  if (!user || !user.approved) return { ok: false as const, user: null };
  return { ok: true as const, user };
};
