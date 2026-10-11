/* Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic. Автор проекта Profectium. */
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { unoptimized: true },
  webpack(config, { webpack, isServer }) {
    if (isServer && webpack?.NormalModuleReplacementPlugin) {
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(
        /^cloudflare:workers$/,
        path.resolve(process.cwd(), "lib/server/node-runtime.ts"),
      ));
    }
    return config;
  },
};

export default nextConfig;
