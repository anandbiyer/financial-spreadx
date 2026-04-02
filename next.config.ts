import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'],
  experimental: {
    serverActions: { bodySizeLimit: '52mb' },
  },
  outputFileTracingIncludes: {
    // pdfjs-dist dynamically imports pdf.worker.mjs at runtime but the
    // Vercel file tracer misses it — force-include the worker files.
    '/api/documents': [
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    ],
  },
};

export default nextConfig;
