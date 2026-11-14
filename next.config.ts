import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The bench pages moved under /evidence when the product pages took over the top level.
  async redirects() {
    return [
      { source: "/lab", destination: "/evidence/lab", permanent: true },
      { source: "/method", destination: "/evidence/method", permanent: true },
      { source: "/outreach", destination: "/evidence/statement-gate", permanent: true },
    ];
  },
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
