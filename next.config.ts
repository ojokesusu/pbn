import type { NextConfig } from "next";
import path from "node:path";

// Pin Turbopack workspace root to this project folder — locally there is a
// stray `package-lock.json` one level up that Next 16 would otherwise pick
// as the root, breaking module resolution for Tailwind CSS and routes.
// Using __dirname resolves correctly on both Windows (local) and Linux (Railway).
const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
