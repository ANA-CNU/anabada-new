import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async redirects() {
    return [{ source: "/dashboard", destination: "/", permanent: true }];
  },
  logging: { fetches: { fullUrl: false } },
  experimental: { serverActions: { bodySizeLimit: "256kb" } },
};

export default config;
