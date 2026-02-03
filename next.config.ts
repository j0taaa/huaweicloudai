import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ssh2", "@xenova/transformers"],
};

export default nextConfig;
