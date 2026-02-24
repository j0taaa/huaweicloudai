import { redirect } from "next/navigation";
import { createAdminSession, clearAdminSession, isAdminAuthenticated, isValidAdminPassword } from "@/lib/admin-auth";
import { deleteUser, getOptions, listAppUsers, setUserApproved, upsertOption } from "@/lib/admin-db";
import { getAppConfig } from "@/lib/app-config";

export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const { error } = await searchParams;
  const authenticated = await isAdminAuthenticated();
  const options = authenticated ? getOptions() : [];
  const users = authenticated ? listAppUsers() : [];
  const config = getAppConfig();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <h1 className="text-3xl font-bold">Admin</h1>
      {error ? <p className="text-red-500">{decodeURIComponent(error)}</p> : null}

      {!authenticated ? (
        <form action={loginAction} className="flex flex-col gap-3 rounded border p-4">
          <label htmlFor="password" className="font-medium">Admin password</label>
          <input id="password" name="password" type="password" className="rounded border px-3 py-2" required />
          <button className="rounded bg-black px-4 py-2 text-white" type="submit">Login</button>
        </form>
      ) : (
        <>
          <form action={logoutAction}>
            <button className="w-fit rounded border px-3 py-2 text-sm" type="submit">Logout</button>
          </form>

          <form action={saveCoreSettingsAction} className="flex flex-col gap-3 rounded border p-4">
            <h2 className="text-xl font-semibold">Core settings</h2>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="authEnabled" defaultChecked={config.loginEnabled} />
              Enable user login system
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="builtinEnabled" defaultChecked={config.builtInInferenceEnabled} />
              Enable built-in inference option
            </label>
            <label className="text-sm font-medium">Built-in inference URL</label>
            <input name="baseUrl" defaultValue={config.builtInInference.baseUrl} className="rounded border px-3 py-2" />
            <label className="text-sm font-medium">Built-in inference API key</label>
            <input name="apiKey" defaultValue={config.builtInInference.apiKey} className="rounded border px-3 py-2" />
            <label className="text-sm font-medium">Built-in inference model</label>
            <input name="model" defaultValue={config.builtInInference.model} className="rounded border px-3 py-2" />
            <button className="rounded bg-black px-4 py-2 text-white" type="submit">Save core settings</button>
          </form>

          <section className="rounded border p-4">
            <h2 className="text-xl font-semibold">Registered users</h2>
            {users.length === 0 ? <p className="mt-2 text-sm text-gray-600">No registered users yet.</p> : (
              <ul className="mt-3 space-y-3">
                {users.map((user) => (
                  <li key={user.id} className="rounded bg-gray-100 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{user.username}</p>
                        <p className="text-xs text-gray-600">{user.approved ? "Approved" : "Pending approval"}</p>
                      </div>
                      <div className="flex gap-2">
                        <form action={toggleUserApprovalAction}>
                          <input type="hidden" name="id" value={user.id} />
                          <input type="hidden" name="approved" value={user.approved ? "0" : "1"} />
                          <button className="rounded border px-3 py-1 text-xs" type="submit">{user.approved ? "Revoke" : "Approve"}</button>
                        </form>
                        <form action={removeUserAction}>
                          <input type="hidden" name="id" value={user.id} />
                          <button className="rounded border border-red-400 px-3 py-1 text-xs text-red-700" type="submit">Remove</button>
                        </form>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <form action={saveOptionAction} className="flex flex-col gap-3 rounded border p-4">
            <h2 className="text-xl font-semibold">Set raw option</h2>
            <input name="key" placeholder="option_key" className="rounded border px-3 py-2" required />
            <textarea name="value" placeholder="option value" className="min-h-28 rounded border px-3 py-2" required />
            <button className="rounded bg-black px-4 py-2 text-white" type="submit">Save option</button>
          </form>

          <section className="rounded border p-4">
            <h2 className="text-xl font-semibold">Saved options</h2>
            {options.length === 0 ? <p className="mt-3 text-sm text-gray-600">No options saved yet.</p> : (
              <ul className="mt-3 space-y-3">
                {options.map((option) => (
                  <li key={option.key} className="rounded bg-gray-100 p-3">
                    <p className="font-mono text-sm font-semibold">{option.key}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{option.value}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
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
  redirect("/admin");
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

const saveOptionAction = async (formData: FormData) => {
  "use server";
  await ensureAdmin();
  const key = String(formData.get("key") ?? "").trim();
  const value = String(formData.get("value") ?? "");
  if (!key) redirect("/admin?error=Option%20key%20is%20required");
  upsertOption(key, value);
  redirect("/admin");
};
