import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.trychannel3.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.trychannel3.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "trychannel3.com",
        pathname: "/**",
      },
    ],
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
