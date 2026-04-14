import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack workspace root to this project folder — there is a stray
  // `package-lock.json` and `package.json` one level up at `D:/PBN project/`
  // that Next 16 would otherwise pick as the root, breaking module resolution
  // for Tailwind CSS and app route registration.
  turbopack: {
    root: "D:/PBN project/pbn-dashboard",
  },
};

export default nextConfig;
