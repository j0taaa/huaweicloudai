import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getLicenseSnapshot } from "@/lib/license";

export const metadata: Metadata = {
  title: "Huawei Cloud AI Chat",
  description: "Mobile-friendly Huawei Cloud AI chat workspace.",
  applicationName: "Huawei Cloud AI Chat",
  manifest: "/manifest.json",
  appleWebApp: {
    title: "Huawei Cloud AI Chat",
    capable: true,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const license = getLicenseSnapshot();

  if (!license.allowed) {
    return (
      <html lang="en">
        <body className="antialiased">
          <main className="flex min-h-dvh w-full items-center justify-center px-4 py-6 text-zinc-900 dark:text-zinc-50">
            <div className="w-full max-w-2xl rounded-2xl border border-zinc-200/80 bg-white/85 p-6 text-center shadow-sm dark:border-white/15 dark:bg-black/30">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-300">
                Machine UUID
              </p>
              <p className="mt-3 break-all font-mono text-lg font-semibold sm:text-xl">{license.machineId}</p>
              <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
                License status: <span className="font-semibold">{license.decision}</span>
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Reason: {license.reason}</p>
            </div>
          </main>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
