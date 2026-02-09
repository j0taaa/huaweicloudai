import type { Metadata, Viewport } from "next";
import "./globals.css";

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
        {children}
      </body>
    </html>
  );
}
