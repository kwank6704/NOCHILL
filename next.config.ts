import type { NextConfig } from 'next';

// Strip a stray BOM/whitespace (Windows shells add them when piping env values in).
const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/^﻿/, '').trim().replace(/\/$/, '');

const config: NextConfig = {
  reactStrictMode: true,
  // The repo root has its own lockfile (for `concurrently`); pin Turbopack to this app.
  turbopack: { root: __dirname },
  // Let phones on the same Wi-Fi open the dev server via the machine's LAN IP.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.*.*.*', '*.local'],
  // Proxy /api/* to the Express backend so the browser never deals with CORS.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default config;
