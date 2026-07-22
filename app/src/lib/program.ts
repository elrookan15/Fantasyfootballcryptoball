import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import type { Wallet } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "./idl/league_escrow.json";
import type { LeagueEscrow } from "./idl/league_escrow";

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

export function getProgram(
  connection: Connection,
  wallet: SignerWallet
): Program<LeagueEscrow> {
  const provider = new AnchorProvider(connection, wallet as Wallet, {
    commitment: "confirmed",
  });
  return new Program(idl as LeagueEscrow, provider);
}

/** Read-only program handle (no wallet required) for fetching account state. */
export function getReadonlyProgram(connection: Connection): Program<LeagueEscrow> {
  const readonlyWallet: SignerWallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  };
  const provider = new AnchorProvider(connection, readonlyWallet as Wallet, {
    commitment: "confirmed",
  });
  return new Program(idl as LeagueEscrow, provider);
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

export type LeagueStatus = "open" | "locked" | "resolved";

export function statusLabel(status: Record<string, unknown>): LeagueStatus {
  if ("locked" in status) return "locked";
  if ("resolved" in status) return "resolved";
  return "open";
}
