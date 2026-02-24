"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type AuthFormProps = {
  mode: "login" | "register";
};

type SessionPayload = {
  authenticated?: boolean;
  loginEnabled?: boolean;
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((response) => response.json() as Promise<SessionPayload>)
      .then((payload) => {
        if (!payload.loginEnabled) {
          router.replace("/");
          return;
        }
        if (payload.authenticated) {
          router.replace("/");
          return;
        }
        setReady(true);
      })
      .catch(() => {
        setStatus("Could not verify session state.");
        setReady(true);
      });
  }, [router]);

  const submit = async () => {
    setStatus(null);
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const payload = (await response.json()) as { error?: string; message?: string };

    if (!response.ok) {
      setStatus(payload.error ?? "Authentication failed.");
      return;
    }

    if (mode === "register") {
      setStatus(payload.message ?? "Registered. Waiting for admin approval.");
      setPassword("");
      return;
    }

    router.replace("/");
  };

  if (!ready) {
    return (
      <main className="app-shell flex min-h-dvh items-center justify-center px-6 text-zinc-900 dark:text-zinc-50">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading...</p>
      </main>
    );
  }

  const isLogin = mode === "login";

  return (
    <main className="app-shell flex min-h-dvh items-center justify-center px-4 py-8 text-zinc-900 dark:text-zinc-50 sm:px-6 lg:px-8">
      <section className="surface-card w-full max-w-lg rounded-3xl border border-white/60 px-5 py-6 backdrop-blur sm:px-8">
        <div className="flex items-center gap-3">
          <Image src="/icon.svg" alt="Huawei Cloud AI Chat logo" width={44} height={44} className="h-11 w-11" priority />
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">Huawei Cloud AI Chat</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {isLogin
                ? "Sign in with your approved account to continue."
                : "Create an account and wait for admin approval before signing in."}
            </p>
          </div>
        </div>

        <h2 className="mt-6 text-xl font-semibold">{isLogin ? "Sign in" : "Create account"}</h2>
        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium">Username</label>
          <input
            className="w-full rounded-xl border border-zinc-200 bg-white/90 px-3 py-2 outline-none dark:border-white/15 dark:bg-black/30"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <label className="block text-sm font-medium">Password</label>
          <input
            className="w-full rounded-xl border border-zinc-200 bg-white/90 px-3 py-2 outline-none dark:border-white/15 dark:bg-black/30"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {status ? <p className="text-sm text-red-600 dark:text-red-300">{status}</p> : null}
          <button
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
            type="button"
            onClick={submit}
          >
            {isLogin ? "Login" : "Register"}
          </button>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {isLogin ? "Need an account? " : "Already have an account? "}
            <Link className="font-semibold underline" href={isLogin ? "/register" : "/login"}>
              {isLogin ? "Register" : "Login"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
