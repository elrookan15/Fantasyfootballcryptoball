import { clusterApiUrl } from "@solana/web3.js";

// Devnet by default; override with NEXT_PUBLIC_SOLANA_RPC_URL for a custom RPC
// (e.g. http://127.0.0.1:8899 for a local validator).
export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? clusterApiUrl("devnet");

export const NETWORK_LABEL =
  process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet";
