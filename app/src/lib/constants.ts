import { clusterApiUrl, PublicKey } from "@solana/web3.js";

// Devnet by default; override with NEXT_PUBLIC_SOLANA_RPC_URL for a custom RPC
// (e.g. http://127.0.0.1:8899 for a local validator).
export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? clusterApiUrl("devnet");

export const NETWORK_LABEL =
  process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet";

// USDC mint used for SPL-token leagues. Defaults to Circle's devnet USDC.
// Override with NEXT_PUBLIC_USDC_MINT (e.g. the mainnet USDC mint).
export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ??
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

export const USDC_DECIMALS = 6;
export const SOL_DECIMALS = 9;
