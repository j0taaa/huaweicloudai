import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ssh2", "@xenova/transformers"],
  devIndicators: false,
};

export default nextConfig;
