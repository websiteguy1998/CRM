import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosted platforms like Hostinger run `next start` directly instead
  // of Vercel's optimized runtime — standalone output trims the deployed
  // app down to only the files actually needed to run it, so the server
  // has less to load into memory on every boot/restart.
  output: "standalone",
};

export default nextConfig;
