import type { NextConfig } from "next";

/**
 * Product photos and business logos live in Supabase Storage, and the public
 * micro-site renders them through `next/image`. That component refuses any host
 * not declared here, so the pattern is derived from the project URL rather than
 * hardcoded — pointing the app at a different Supabase project must not require
 * a code change. Scoped to the public storage prefix: nothing else is an image.
 */
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
