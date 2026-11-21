import type { NextConfig } from "next";

const isStaticExport = process.env.STATIC_EXPORT === "true";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : undefined,
  outputFileTracingRoot: process.cwd(),
  typescript: { tsconfigPath: "tsconfig.build.json" },
  serverExternalPackages: [
    "pdfkit",
    "pdf-parse",
    "pdfjs-dist",
    "tesseract.js",
    "@napi-rs/canvas",
  ],
  outputFileTracingIncludes: {
    "/api/analyze": [
      // Worker entry points and WASM are loaded by path, outside the import graph.
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/tesseract.js/src/worker-script/**/*.js",
      "./node_modules/tesseract.js/src/constants/imageType.js",
      "./node_modules/tesseract.js-core/package.json",
      "./node_modules/tesseract.js-core/tesseract-core{,-lstm,-simd,-simd-lstm,-relaxedsimd,-relaxedsimd-lstm}.{js,wasm}",
      "./node_modules/wasm-feature-detect/package.json",
      "./node_modules/wasm-feature-detect/dist/cjs/index.cjs",
      "./node_modules/bmp-js/{package.json,index.js,lib/*.js}",
    ],
  },
  ...(isStaticExport
    ? {}
    : {
        async headers() {
          return [
            {
              source: "/(.*)",
              headers: [
                {
                  key: "Content-Security-Policy",
                  value: [
                    "default-src 'self'",
                    `script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === "development" ? "'unsafe-eval'" : "'wasm-unsafe-eval'"}`,
                    "style-src 'self' 'unsafe-inline'",
                    "img-src 'self' data: blob:",
                    "font-src 'self' data:",
                    "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
                    "worker-src 'self' blob:",
                    "frame-ancestors 'none'",
                    "base-uri 'self'",
                    "form-action 'self'",
                  ].join("; "),
                },
                { key: "X-Frame-Options", value: "DENY" },
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "Referrer-Policy", value: "no-referrer" },
                {
                  key: "Permissions-Policy",
                  value:
                    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
                },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
