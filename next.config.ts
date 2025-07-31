import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "https://10.239.115.52:3443", // Add your dev server IP and port here
    // Add more origins if needed
  ],
  // other config options...
};

export default nextConfig;
