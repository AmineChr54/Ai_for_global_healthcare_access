/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },

  // Proxy /api to FastAPI when using combined start (e.g. Databricks). Ignored when frontend calls API by full URL (local dev).
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "http://127.0.0.1:8001/api/:path*" },
    ];
  },

  // Keep WASM-based and DOM-dependent packages out of the server bundle
  // so they don't break SSR module resolution.
  serverExternalPackages: ["h3-js", "leaflet", "leaflet.markercluster"],

  webpack: (config, { isServer }) => {
    // Enable async WASM for h3-js
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // On the server, stub out client-only packages that dynamic(ssr:false)
    // already excludes from rendering but whose module entries can still
    // confuse webpack's __webpack_exec__.
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "leaflet.heat": false,
      };
    }

    return config;
  },
};

module.exports = nextConfig;
