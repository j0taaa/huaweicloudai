import { redirect } from "next/navigation";
import { createAdminSession, clearAdminSession, isAdminAuthenticated, isValidAdminPassword } from "@/lib/admin-auth";
import { getOptions, upsertOption } from "@/lib/admin-db";

export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const { error } = await searchParams;
  const authenticated = await isAdminAuthenticated();
  const options = authenticated ? getOptions() : [];

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-3xl font-bold">Admin</h1>
      {error ? <p className="text-red-500">{decodeURIComponent(error)}</p> : null}

      {!authenticated ? (
        <form action={loginAction} className="flex flex-col gap-3 rounded border p-4">
          <label htmlFor="password" className="font-medium">
            Admin password
          </label>
          <input id="password" name="password" type="password" className="rounded border px-3 py-2" required />
          <button className="rounded bg-black px-4 py-2 text-white" type="submit">
            Login
          </button>
        </form>
      ) : (
        <>
          <form action={logoutAction}>
            <button className="w-fit rounded border px-3 py-2 text-sm" type="submit">
              Logout
            </button>
          </form>

          <form action={saveOptionAction} className="flex flex-col gap-3 rounded border p-4">
            <h2 className="text-xl font-semibold">Set option</h2>
            <input name="key" placeholder="option_key" className="rounded border px-3 py-2" required />
            <textarea
              name="value"
              placeholder="option value"
              className="min-h-28 rounded border px-3 py-2"
              required
            />
            <button className="rounded bg-black px-4 py-2 text-white" type="submit">
              Save option
            </button>
          </form>

          <section className="rounded border p-4">
            <h2 className="text-xl font-semibold">Saved options</h2>
            {options.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">No options saved yet.</p>
            ) : (
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
  if (!isValidAdminPassword(password)) {
    redirect("/admin?error=Invalid%20password");
  }

  await createAdminSession();
  redirect("/admin");
};

const logoutAction = async () => {
  "use server";
  await clearAdminSession();
  redirect("/admin");
};

const saveOptionAction = async (formData: FormData) => {
  "use server";
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    redirect("/admin?error=Unauthorized");
  }

  const key = String(formData.get("key") ?? "").trim();
  const value = String(formData.get("value") ?? "");

  if (!key) {
    redirect("/admin?error=Option%20key%20is%20required");
  }

  upsertOption(key, value);
  redirect("/admin");
};
