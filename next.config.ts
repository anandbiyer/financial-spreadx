import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'],
  experimental: {
    serverActions: { bodySizeLimit: '52mb' },
  },
};

export default nextConfig;
