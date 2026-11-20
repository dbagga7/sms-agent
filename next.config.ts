import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen here is per-request admin data, so the cache-components
  // prerendering model is intentionally left off.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
