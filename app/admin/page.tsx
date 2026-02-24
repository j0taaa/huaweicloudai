import { redirect } from "next/navigation";
import {
  clearAdminSession,
  createAdminSession,
  isAdminAuthenticated,
  isValidAdminPassword,
  updateAdminPassword,
} from "@/lib/admin-auth";
import {
  deleteUser,
  getOptions,
  listAppUsers,
  setUserApproved,
  upsertOption,
} from "@/lib/admin-db";
import { getAppConfig } from "@/lib/app-config";

export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

type OptionEntry = {
  key: string;
  value: string;
};

const SENSITIVE_OPTION_KEYS = new Set(["admin.password.hash"]);

const visibleOptions = (options: OptionEntry[]) =>
  options
    .filter((option) => !SENSITIVE_OPTION_KEYS.has(option.key))
    .sort((a, b) => a.key.localeCompare(b.key));

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const { error, success } = await searchParams;
  const authenticated = await isAdminAuthenticated();
  const options = authenticated ? visibleOptions(getOptions()) : [];
  const users = authenticated ? listAppUsers() : [];
  const config = getAppConfig();

  return (
    <div className="app-shell min-h-dvh w-full px-4 py-6 text-zinc-900 dark:text-zinc-50 sm:px-6 lg:px-8">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <section className="surface-card rounded-3xl border border-white/60 px-5 py-5 backdrop-blur sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold sm:text-3xl">Admin Console</h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Manage authentication, inference, and user access.</p>
            </div>
            {authenticated ? (
              <form action={logoutAction}>
                <button className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 dark:border-white/20 dark:text-zinc-200" type="submit">
                  Logout
                </button>
              </form>
            ) : null}
          </div>
          {error ? <p className="mt-4 rounded-xl border border-red-300/70 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-400/30 dark:bg-red-950/30 dark:text-red-200">{decodeURIComponent(error)}</p> : null}
          {success ? <p className="mt-4 rounded-xl border border-emerald-300/70 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-950/30 dark:text-emerald-200">{decodeURIComponent(success)}</p> : null}
        </section>

        {!authenticated ? (
          <section className="flex justify-center">
            <form action={loginAction} className="surface-card flex w-full max-w-md flex-col gap-3 rounded-3xl border border-white/60 px-5 py-6 backdrop-blur sm:px-6">
              <h2 className="text-lg font-semibold">Sign in</h2>
              <label htmlFor="password" className="text-sm font-medium">Admin password</label>
              <input id="password" name="password" type="password" className="rounded-xl border border-zinc-200 bg-white/90 px-3 py-2 outline-none dark:border-white/15 dark:bg-black/30" required />
              <button className="mt-1 w-fit rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900" type="submit">Login</button>
            </form>
          </section>
        ) : (
          <>
            <section className="surface-card rounded-3xl border border-white/60 px-5 py-5 backdrop-blur sm:px-6">
              <h2 className="text-lg font-semibold">Settings</h2>

              <form action={saveCoreSettingsAction} className="mt-4 space-y-4">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Access</h3>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="authEnabled" defaultChecked={config.loginEnabled} />
                    Enable user login system
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="builtinEnabled" defaultChecked={config.builtInInferenceEnabled} />
                    Enable built-in inference option
                  </label>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Inference</h3>
                  <label className="block text-sm font-medium">Built-in inference URL</label>
                  <input name="baseUrl" defaultValue={config.builtInInference.baseUrl} className="w-full rounded-xl border border-zinc-200 bg-white/90 px-3 py-2 outline-none dark:border-white/15 dark:bg-black/30" />
                  <label className="block text-sm font-medium">Built-in inference API key</label>
                  <input name="apiKey" defaultValue={config.builtInInference.apiKey} className="w-full rounded-xl border border-zinc-200 bg-white/90 px-3 py-2 outline-none dark:border-white/15 dark:bg-black/30" />
                  <label className="block text-sm font-medium">Built-in inference model</label>
                  <input name="model" defaultValue={config.builtInInference.model} className="w-full rounded-xl border border-zinc-200 bg-white/90 px-3 py-2 outline-none dark:border-white/15 dark:bg-black/30" />
                </div>

                <button className="w-fit rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900" type="submit">Save settings</button>
              </form>

              <details className="mt-6 rounded-2xl border border-zinc-200/80 bg-white/70 p-4 dark:border-white/10 dark:bg-black/20">
                <summary className="text-sm font-semibold">Change admin password</summary>
                <form action={changeAdminPasswordAction} className="mt-4 flex flex-col gap-3">
                  <label className="text-sm font-medium">Current password</label>
                  <input name="currentPassword" type="password" className="rounded-xl border border-zinc-200 bg-white/90 px-3 py-2 outline-none dark:border-white/15 dark:bg-black/30" required />
                  <label className="text-sm font-medium">New password</label>
                  <input name="newPassword" type="password" className="rounded-xl border border-zinc-200 bg-white/90 px-3 py-2 outline-none dark:border-white/15 dark:bg-black/30" required minLength={8} />
                  <label className="text-sm font-medium">Confirm new password</label>
                  <input name="confirmPassword" type="password" className="rounded-xl border border-zinc-200 bg-white/90 px-3 py-2 outline-none dark:border-white/15 dark:bg-black/30" required minLength={8} />
                  <button className="mt-1 w-fit rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900" type="submit">Update admin password</button>
                </form>
              </details>
            </section>

            <section className="surface-card rounded-3xl border border-white/60 px-5 py-5 backdrop-blur sm:px-6">
              <h2 className="text-lg font-semibold">User Management</h2>
              {users.length === 0 ? <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">No registered users yet.</p> : (
                <ul className="mt-3 space-y-3">
                  {users.map((user) => (
                    <li key={user.id} className="rounded-2xl border border-zinc-200/80 bg-white/70 p-3 dark:border-white/10 dark:bg-black/30">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{user.username}</p>
                          <p className="text-xs text-zinc-600 dark:text-zinc-300">{user.approved ? "Approved" : "Pending approval"}</p>
                        </div>
                        <div className="flex gap-2">
                          <form action={toggleUserApprovalAction}>
                            <input type="hidden" name="id" value={user.id} />
                            <input type="hidden" name="approved" value={user.approved ? "0" : "1"} />
                            <button className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold dark:border-white/20" type="submit">{user.approved ? "Revoke" : "Approve"}</button>
                          </form>
                          <form action={removeUserAction}>
                            <input type="hidden" name="id" value={user.id} />
                            <button className="rounded-full border border-red-400 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-300" type="submit">Remove</button>
                          </form>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="surface-card rounded-3xl border border-white/60 px-5 py-5 backdrop-blur sm:px-6">
              <h2 className="text-lg font-semibold">Saved Configuration</h2>
              {options.length === 0 ? <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">No options saved yet.</p> : (
                <ul className="mt-4 divide-y divide-zinc-200/80 dark:divide-white/10">
                  {options.map((option) => (
                    <li key={option.key} className="grid gap-1 py-3 sm:grid-cols-[minmax(180px,240px)_1fr] sm:gap-4">
                      <p className="font-mono text-xs font-semibold text-zinc-600 dark:text-zinc-300">{option.key}</p>
                      <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-200">{option.value}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

const loginAction = async (formData: FormData) => {
  "use server";
  const password = String(formData.get("password") ?? "");
  if (!isValidAdminPassword(password)) redirect("/admin?error=Invalid%20password");
  await createAdminSession();
  redirect("/admin");
};

const logoutAction = async () => {
  "use server";
  await clearAdminSession();
  redirect("/admin");
};

const ensureAdmin = async () => {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) redirect("/admin?error=Unauthorized");
};

const saveCoreSettingsAction = async (formData: FormData) => {
  "use server";
  await ensureAdmin();
  const authEnabled = formData.get("authEnabled") === "on";
  const builtinEnabled = formData.get("builtinEnabled") === "on";
  upsertOption("auth.enabled", String(authEnabled));
  upsertOption("inference.builtin.enabled", String(builtinEnabled));
  upsertOption("inference.builtin.baseUrl", String(formData.get("baseUrl") ?? "").trim());
  upsertOption("inference.builtin.apiKey", String(formData.get("apiKey") ?? "").trim());
  upsertOption("inference.builtin.model", String(formData.get("model") ?? "").trim());
  redirect("/admin?success=Settings%20saved");
};

const changeAdminPasswordAction = async (formData: FormData) => {
  "use server";
  await ensureAdmin();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!isValidAdminPassword(currentPassword)) {
    redirect("/admin?error=Current%20password%20is%20incorrect");
  }
  if (newPassword.length < 8) {
    redirect("/admin?error=New%20password%20must%20be%20at%20least%208%20characters");
  }
  if (newPassword !== confirmPassword) {
    redirect("/admin?error=Password%20confirmation%20does%20not%20match");
  }

  updateAdminPassword(newPassword);
  redirect("/admin?success=Admin%20password%20updated");
};

const toggleUserApprovalAction = async (formData: FormData) => {
  "use server";
  await ensureAdmin();
  const id = String(formData.get("id") ?? "");
  const approved = String(formData.get("approved") ?? "") === "1";
  if (id) setUserApproved(id, approved);
  redirect("/admin");
};

const removeUserAction = async (formData: FormData) => {
  "use server";
  await ensureAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) deleteUser(id);
  redirect("/admin");
};
