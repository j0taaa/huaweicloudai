import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

const themeScript = `
(() => {
  const storageKey = "huaweicloudai-theme";
  const stored = localStorage.getItem(storageKey);
  const preference =
    stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : "system";
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const isDark = preference === "dark" || (preference === "system" && media.matches);
  const root = document.documentElement;
  root.classList.toggle("dark", isDark);
  root.dataset.theme = preference;
})();
`;
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        {children}
      </body>
    </html>
  );
}
