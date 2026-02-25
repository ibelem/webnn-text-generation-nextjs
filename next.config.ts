import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "https://10.239.115.52:3000",
    "https://10.239.115.77:3000",
    "https://localhost:3000",
  ],
  // other config options...
};

export default nextConfig;
