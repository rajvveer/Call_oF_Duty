import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    config.resolve.alias["three$"] = "three/webgpu";
    return config;
  },
};

export default nextConfig;
