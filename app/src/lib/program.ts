import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import type { Wallet } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import idl from "./idl/league_escrow.json";
import type { LeagueEscrow } from "./idl/league_escrow";

export { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID };

export const PROGRAM_ID = new PublicKey(
  (idl as { address: string }).address
);

/**
 * Minimal signing wallet. This matches both the browser `AnchorWallet` from
 * `@solana/wallet-adapter-react` and Anchor's internal provider wallet interface
 * (which is narrower than the exported `NodeWallet`, so we don't require `payer`).
 */
export type SignerWallet = Pick<
  Wallet,
  "publicKey" | "signTransaction" | "signAllTransactions"
>;

// ⚡ Bolt: Cache program instances to prevent re-parsing the large IDL object on every call.
// This reduces instantiation time from ~1.5ms to <0.05ms for repeated calls.
let cachedProgram: Program<LeagueEscrow> | null = null;
let cachedConnection: Connection | null = null;
let cachedWallet: SignerWallet | null = null;

export function getProgram(
  connection: Connection,
  wallet: SignerWallet
): Program<LeagueEscrow> {
  if (
    cachedProgram &&
    cachedConnection === connection &&
    cachedWallet === wallet
  ) {
    return cachedProgram;
  }

  const provider = new AnchorProvider(connection, wallet as Wallet, {
    commitment: "confirmed",
  });
  cachedProgram = new Program(idl as LeagueEscrow, provider);
  cachedConnection = connection;
  cachedWallet = wallet;
  return cachedProgram;
}

let cachedReadonlyProgram: Program<LeagueEscrow> | null = null;
let cachedReadonlyConnection: Connection | null = null;

/** Read-only program handle (no wallet required) for fetching account state. */
export function getReadonlyProgram(connection: Connection): Program<LeagueEscrow> {
  if (cachedReadonlyProgram && cachedReadonlyConnection === connection) {
    return cachedReadonlyProgram;
  }

  const readonlyWallet: SignerWallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  };
  const provider = new AnchorProvider(connection, readonlyWallet as Wallet, {
    commitment: "confirmed",
  });
  cachedReadonlyProgram = new Program(idl as LeagueEscrow, provider);
  cachedReadonlyConnection = connection;
  return cachedReadonlyProgram;
}

export function leaguePda(admin: PublicKey, leagueId: BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("league"),
      admin.toBuffer(),
      leagueId.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  )[0];
}

export function entryPda(league: PublicKey, player: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("entry"), league.toBuffer(), player.toBuffer()],
    PROGRAM_ID
  )[0];
}

/** Escrow vault = ATA of the league PDA (owner is off-curve). */
export function vaultAta(league: PublicKey, mint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, league, true);
}

/** A player's own ATA for a given mint. */
export function playerAta(mint: PublicKey, owner: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner);
}

export type LeagueStatus = "open" | "locked" | "resolved" | "cancelled";

export function statusLabel(status: Record<string, unknown>): LeagueStatus {
  if ("locked" in status) return "locked";
  if ("resolved" in status) return "resolved";
  if ("cancelled" in status) return "cancelled";
  return "open";
}
