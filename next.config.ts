import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "", // Add your dev server IP and port here
    // Add more origins if needed
  ],
  serverExternalPackages: ["onnxruntime-node", "sharp"],
};

export default nextConfig;
