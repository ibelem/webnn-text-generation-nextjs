import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "https://10.239.115.52:3000",
    "https://10.239.115.77:3000",
    "https://localhost:3000",
  ],
  // other config options...
  webpack: (config) => {
    // Prevent webpack from parsing the custom transformers.js bundle.
    // It's a self-contained build that resolves WASM/worker URLs at runtime
    // (via env.backends.onnx.wasm.wasmPaths). Parsing it causes webpack to
    // try to statically resolve `new URL("ort-wasm-simd-threaded.asyncify.wasm",
    // import.meta.url)` etc., which fails at build time.
    const noParse = config.module.noParse;
    const noParsePattern = /transformersjs-qwen3[\\/]transformers\.js$/;
    if (Array.isArray(noParse)) {
      config.module.noParse = [...noParse, noParsePattern];
    } else if (noParse) {
      config.module.noParse = [noParse, noParsePattern];
    } else {
      config.module.noParse = noParsePattern;
    }
    return config;
  },
};

export default nextConfig;
