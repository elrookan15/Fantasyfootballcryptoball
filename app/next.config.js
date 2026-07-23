/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // wallet-adapter ships untranspiled ESM; let Next transpile it.
  transpilePackages: [
    "@solana/wallet-adapter-base",
    "@solana/wallet-adapter-react",
    "@solana/wallet-adapter-react-ui",
    "@solana/wallet-adapter-wallets",
  ],
  webpack: (config) => {
    // web3.js references optional node built-ins that aren't needed in the browser.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, os: false };
    return config;
  },
};

module.exports = nextConfig;
