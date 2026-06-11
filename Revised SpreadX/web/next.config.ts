import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native addon — keep it out of the server bundle and use
  // native require. (Next auto-externalizes it, but we declare it explicitly.)
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
