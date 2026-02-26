import { getLicenseSnapshot } from "@/lib/license";

export const dynamic = "force-dynamic";

export default function LicensePage() {
  const snapshot = getLicenseSnapshot();

  return (
    <main className="flex min-h-dvh w-full items-center justify-center px-4 py-6 text-zinc-900 dark:text-zinc-50">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-200/80 bg-white/80 p-6 text-center shadow-sm dark:border-white/15 dark:bg-black/30">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-300">Machine UUID</p>
        <p className="mt-3 break-all font-mono text-lg font-semibold sm:text-xl">{snapshot.machineId}</p>
        <p className="mt-5 text-sm text-zinc-600 dark:text-zinc-300">
          Status: <span className="font-semibold">{snapshot.decision}</span>
        </p>
      </div>
    </main>
  );
}
