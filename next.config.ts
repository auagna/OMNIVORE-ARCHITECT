import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    if (process.env.NODE_ENV !== "production") return [];

    return {
      beforeFiles: [
        { source: "/design-lab", destination: "/__design-lab-disabled" },
        { source: "/design-lab/:path*", destination: "/__design-lab-disabled" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
