import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["http://localhost:3000", "192.168.50.34", '192.168.110.79']
};

export default nextConfig;
