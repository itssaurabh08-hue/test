import type { NextConfig } from "next";

// GitHub Codespaces serves the dev server through a forwarded-port proxy
// at https://<codespace-name>-<port>.app.github.dev (the browser's Origin
// differs from the Host the Next.js server sees internally). Without
// these, Server Actions reject every request from that origin with
// "Invalid Server Actions request", and dev-asset requests are blocked
// too. See docs/app/api-reference/config/next-config-js/allowedDevOrigins
// and .../serverActions in node_modules/next/dist/docs.
const codespacesOrigins = ["*.app.github.dev", "**.app.github.dev"];

const nextConfig: NextConfig = {
  allowedDevOrigins: codespacesOrigins,
  experimental: {
    serverActions: {
      allowedOrigins: codespacesOrigins,
    },
  },
};

export default nextConfig;
