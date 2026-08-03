import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { assert } from "chai";
import { LeagueEscrow } from "../target/types/league_escrow";

describe("league-escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = (anchor.workspace.leagueEscrow ??
    anchor.workspace.LeagueEscrow) as Program<LeagueEscrow>;
  const connection = provider.connection;
  const admin = provider.wallet as anchor.Wallet;

  const ENTRY_FEE = new BN(0.5 * LAMPORTS_PER_SOL);
  const MAX_PLAYERS = 4;

  // A fresh league id per scenario keeps state isolated across tests.
  let nextLeagueId = 1;

  function leaguePda(adminKey: PublicKey, leagueId: BN): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("league"),
        adminKey.toBuffer(),
        leagueId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];
  }

  function entryPda(league: PublicKey, player: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("entry"), league.toBuffer(), player.toBuffer()],
      program.programId
    )[0];
  }

  /** Build the remainingAccounts array for resolveLeague, one entry per winner. */
  function winnerEntries(
    league: PublicKey,
    winners: PublicKey[]
  ): { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[] {
    return winners.map((w) => ({
      pubkey: entryPda(league, w),
      isWritable: false,
      isSigner: false,
    }));
  }

  async function airdrop(pubkey: PublicKey, sol: number) {
    const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
    const bh = await connection.getLatestBlockhash();
    await connection.confirmTransaction(
      { signature: sig, ...bh },
      "confirmed"
    );
  }

  async function fundedKeypair(sol = 2): Promise<Keypair> {
    const kp = Keypair.generate();
    await airdrop(kp.publicKey, sol);
    return kp;
  }

  async function expectError(p: Promise<unknown>, code: string) {
    try {
      await p;
      assert.fail(`expected transaction to fail with ${code}`);
    } catch (e) {
      const err = e as anchor.AnchorError;
      const actual = err?.error?.errorCode?.code;
      if (actual) {
        assert.strictEqual(actual, code, `expected ${code}, got ${actual}`);
      } else {
        assert.include(String(e), code);
      }
    }
  }

  async function createLeague(opts?: {
    oracle?: PublicKey;
    entryFee?: BN;
    maxPlayers?: number;
    joinDeadline?: BN;
    lockDeadline?: BN;
  }) {
    const leagueId = new BN(nextLeagueId++);
    const league = leaguePda(admin.publicKey, leagueId);
    const oracle = opts?.oracle ?? admin.publicKey;
    await program.methods
      .createLeague(
        leagueId,
        opts?.entryFee ?? ENTRY_FEE,
        opts?.maxPlayers ?? MAX_PLAYERS,
        oracle,
        opts?.joinDeadline ?? new BN(0),
        opts?.lockDeadline ?? new BN(0)
      )
      .accountsPartial({
        league,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return { leagueId, league, oracle };
  }

  async function join(league: PublicKey, player: Keypair) {
    await program.methods
      .joinLeague()
      .accountsPartial({
        league,
        playerEntry: entryPda(league, player.publicKey),
        player: player.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([player])
      .rpc();
  }

  before(async () => {
    const balance = await connection.getBalance(admin.publicKey);
    if (balance < 5 * LAMPORTS_PER_SOL) {
      await airdrop(admin.publicKey, 100);
    }
  });

  it("runs the full happy path: create -> join x2 -> lock -> resolve -> claim", async () => {
    const { league } = await createLeague();
    const p1 = await fundedKeypair();
    const p2 = await fundedKeypair();

    await join(league, p1);
    await join(league, p2);

    let state = await program.account.league.fetch(league);
    assert.strictEqual(state.playerCount, 2);
    assert.ok(state.totalPot.eq(ENTRY_FEE.muln(2)));
    assert.deepStrictEqual(state.status, { open: {} });

    // Lock entries (admin only).
    await program.methods
      .lockLeague()
      .accountsPartial({ league, admin: admin.publicKey })
      .rpc();
    state = await program.account.league.fetch(league);
    assert.deepStrictEqual(state.status, { locked: {} });

    // Resolve with a 60/40 split of the full pot (must equal total_pot exactly).
    const pot = ENTRY_FEE.muln(2);
    const winner1 = pot.muln(60).divn(100);
    const winner2 = pot.sub(winner1);
    const winners = [p1.publicKey, p2.publicKey];
    await program.methods
      .resolveLeague(winners, [winner1, winner2])
      .accountsPartial({ league, authority: admin.publicKey })
      .remainingAccounts(winnerEntries(league, winners))
      .rpc();
    state = await program.account.league.fetch(league);
    assert.deepStrictEqual(state.status, { resolved: {} });
    assert.strictEqual(state.winners.length, 2);

    // Winner 1 claims.
    const escrowBefore = await connection.getBalance(league);
    const p1Before = await connection.getBalance(p1.publicKey);
    await program.methods
      .claimPayout()
      .accountsPartial({ league, player: p1.publicKey })
      .signers([p1])
      .rpc();
    const escrowAfterP1 = await connection.getBalance(league);
    const p1After = await connection.getBalance(p1.publicKey);
    assert.strictEqual(escrowBefore - escrowAfterP1, winner1.toNumber());
    // p1 pays the tx fee, so net gain is slightly under the payout.
    assert.ok(p1After > p1Before);

    // Winner 2 claims.
    await program.methods
      .claimPayout()
      .accountsPartial({ league, player: p2.publicKey })
      .signers([p2])
      .rpc();
    const escrowAfterP2 = await connection.getBalance(league);
    assert.strictEqual(escrowAfterP1 - escrowAfterP2, winner2.toNumber());

    // Pot fully distributed; only the rent reserve remains.
    state = await program.account.league.fetch(league);
    assert.ok(state.totalPot.eqn(0));
    assert.ok(state.winners.every((w) => w.claimed));
  });

  it("lets the configured oracle (not just admin) resolve", async () => {
    const oracle = await fundedKeypair();
    const { league } = await createLeague({ oracle: oracle.publicKey });
    const p1 = await fundedKeypair();
    await join(league, p1);

    await program.methods
      .lockLeague()
      .accountsPartial({ league, admin: admin.publicKey })
      .rpc();

    const winners = [p1.publicKey];
    await program.methods
      .resolveLeague(winners, [ENTRY_FEE])
      .accountsPartial({ league, authority: oracle.publicKey })
      .remainingAccounts(winnerEntries(league, winners))
      .signers([oracle])
      .rpc();

    const state = await program.account.league.fetch(league);
    assert.deepStrictEqual(state.status, { resolved: {} });
  });

  it("rejects joining after the league is locked", async () => {
    const { league } = await createLeague();
    const p1 = await fundedKeypair();
    await join(league, p1);

    await program.methods
      .lockLeague()
      .accountsPartial({ league, admin: admin.publicKey })
      .rpc();

    const late = await fundedKeypair();
    await expectError(join(league, late), "LeagueNotOpen");
  });

  it("rejects resolve from a non-admin / non-oracle signer", async () => {
    const { league } = await createLeague();
    const p1 = await fundedKeypair();
    await join(league, p1);
    await program.methods
      .lockLeague()
      .accountsPartial({ league, admin: admin.publicKey })
      .rpc();

    const outsider = await fundedKeypair();
    const winners = [p1.publicKey];
    await expectError(
      program.methods
        .resolveLeague(winners, [ENTRY_FEE])
        .accountsPartial({ league, authority: outsider.publicKey })
        .remainingAccounts(winnerEntries(league, winners))
        .signers([outsider])
        .rpc(),
      "Unauthorized"
    );
  });

  it("rejects lock from a non-admin signer", async () => {
    const { league } = await createLeague();
    const outsider = await fundedKeypair();
    await expectError(
      program.methods
        .lockLeague()
        .accountsPartial({ league, admin: outsider.publicKey })
        .signers([outsider])
        .rpc(),
      "Unauthorized"
    );
  });

  it("rejects resolving before the league is locked", async () => {
    const { league } = await createLeague();
    const p1 = await fundedKeypair();
    await join(league, p1);
    const winners = [p1.publicKey];
    await expectError(
      program.methods
        .resolveLeague(winners, [ENTRY_FEE])
        .accountsPartial({ league, authority: admin.publicKey })
        .remainingAccounts(winnerEntries(league, winners))
        .rpc(),
      "LeagueNotLocked"
    );
  });

  it("rejects a payout split that exceeds the pot", async () => {
    const { league } = await createLeague();
    const p1 = await fundedKeypair();
    await join(league, p1);
    await program.methods
      .lockLeague()
      .accountsPartial({ league, admin: admin.publicKey })
      .rpc();
    const winners = [p1.publicKey];
    await expectError(
      program.methods
        .resolveLeague(winners, [ENTRY_FEE.muln(5)])
        .accountsPartial({ league, authority: admin.publicKey })
        .remainingAccounts(winnerEntries(league, winners))
        .rpc(),
      "PayoutMustEqualPot"
    );
  });

  it("rejects a payout split that is below the pot", async () => {
    const { league } = await createLeague();
    const p1 = await fundedKeypair();
    await join(league, p1);
    await program.methods
      .lockLeague()
      .accountsPartial({ league, admin: admin.publicKey })
      .rpc();
    const winners = [p1.publicKey];
    await expectError(
      program.methods
        .resolveLeague(winners, [ENTRY_FEE.subn(1)])
        .accountsPartial({ league, authority: admin.publicKey })
        .remainingAccounts(winnerEntries(league, winners))
        .rpc(),
      "PayoutMustEqualPot"
    );
  });

  it("rejects a second claim by the same winner (double-claim)", async () => {
    const { league } = await createLeague();
    const p1 = await fundedKeypair();
    const p2 = await fundedKeypair();
    await join(league, p1);
    await join(league, p2);
    await program.methods
      .lockLeague()
      .accountsPartial({ league, admin: admin.publicKey })
      .rpc();
    // Resolve full pot: both players as winners.
    const pot = ENTRY_FEE.muln(2);
    const winners = [p1.publicKey, p2.publicKey];
    await program.methods
      .resolveLeague(winners, [pot.muln(60).divn(100), pot.sub(pot.muln(60).divn(100))])
      .accountsPartial({ league, authority: admin.publicKey })
      .remainingAccounts(winnerEntries(league, winners))
      .rpc();

    await program.methods
      .claimPayout()
      .accountsPartial({ league, player: p1.publicKey })
      .signers([p1])
      .rpc();

    await expectError(
      program.methods
        .claimPayout()
        .accountsPartial({ league, player: p1.publicKey })
        .signers([p1])
        .rpc(),
      "AlreadyClaimed"
    );
  });

  it("rejects a claim from a non-winner", async () => {
    const { league } = await createLeague();
    const p1 = await fundedKeypair();
    const p2 = await fundedKeypair();
    await join(league, p1);
    await program.methods
      .lockLeague()
      .accountsPartial({ league, admin: admin.publicKey })
      .rpc();
    // Resolve full pot with only p1 as winner.
    const winners = [p1.publicKey];
    await program.methods
      .resolveLeague(winners, [ENTRY_FEE])
      .accountsPartial({ league, authority: admin.publicKey })
      .remainingAccounts(winnerEntries(league, winners))
      .rpc();

    // p2 never joined and is not a winner.
    await expectError(
      program.methods
        .claimPayout()
        .accountsPartial({ league, player: p2.publicKey })
        .signers([p2])
        .rpc(),
      "NotAWinner"
    );
  });

  it("rejects a duplicate join by the same wallet", async () => {
    const { league } = await createLeague();
    const p1 = await fundedKeypair();
    await join(league, p1);
    // The per-player entry PDA already exists, so re-joining fails at init.
    await expectError(join(league, p1), "already in use");
  });

  it("rejects a non-participant winner (WinnerNotParticipant)", async () => {
    const { league } = await createLeague();
    const p1 = await fundedKeypair();
    const outsider = await fundedKeypair();
    await join(league, p1);
    await program.methods
      .lockLeague()
      .accountsPartial({ league, admin: admin.publicKey })
      .rpc();

    // Attempt to name outsider (who never joined) as a winner.
    // Their entry PDA does not exist, so the program should reject.
    await expectError(
      program.methods
        .resolveLeague([outsider.publicKey], [ENTRY_FEE])
        .accountsPartial({ league, authority: admin.publicKey })
        .remainingAccounts([
          {
            pubkey: entryPda(league, outsider.publicKey),
            isWritable: false,
            isSigner: false,
          },
        ])
        .rpc(),
      "WinnerNotParticipant"
    );
  });

  it("rejects a missing winner-entry account (WinnerEntryMismatch)", async () => {
    const { league } = await createLeague();
    const p1 = await fundedKeypair();
    await join(league, p1);
    await program.methods
      .lockLeague()
      .accountsPartial({ league, admin: admin.publicKey })
      .rpc();

    // Pass zero remaining accounts for one winner.
    await expectError(
      program.methods
        .resolveLeague([p1.publicKey], [ENTRY_FEE])
        .accountsPartial({ league, authority: admin.publicKey })
        .remainingAccounts([])
        .rpc(),
      "WinnerEntryMismatch"
    );
  });

  it("rejects a misordered winner-entry account (WinnerEntryMismatch)", async () => {
    const { league } = await createLeague();
    const p1 = await fundedKeypair();
    const p2 = await fundedKeypair();
    await join(league, p1);
    await join(league, p2);
    await program.methods
      .lockLeague()
      .accountsPartial({ league, admin: admin.publicKey })
      .rpc();

    const pot = ENTRY_FEE.muln(2);
    const w1 = pot.muln(60).divn(100);
    const w2 = pot.sub(w1);

    // Pass entry accounts in reversed order (p2 entry for p1 winner slot).
    await expectError(
      program.methods
        .resolveLeague([p1.publicKey, p2.publicKey], [w1, w2])
        .accountsPartial({ league, authority: admin.publicKey })
        .remainingAccounts([
          { pubkey: entryPda(league, p2.publicKey), isWritable: false, isSigner: false },
          { pubkey: entryPda(league, p1.publicKey), isWritable: false, isSigner: false },
        ])
        .rpc(),
      "WinnerEntryMismatch"
    );
  });

  it("cancels an open league and lets both players refund their deposit (rent included)", async () => {
    const { league } = await createLeague();
    const p1 = await fundedKeypair();
    const p2 = await fundedKeypair();
    await join(league, p1);
    await join(league, p2);

    await program.methods
      .cancelLeague()
      .accountsPartial({ league, admin: admin.publicKey })
      .rpc();

    let state = await program.account.league.fetch(league);
    assert.deepStrictEqual(state.status, { cancelled: {} });

    const p1Before = await connection.getBalance(p1.publicKey);
    await program.methods
      .refund()
      .accountsPartial({
        league,
        playerEntry: entryPda(league, p1.publicKey),
        player: p1.publicKey,
      })
      .signers([p1])
      .rpc();
    const p1After = await connection.getBalance(p1.publicKey);
    // Gets back the entry fee plus the PlayerEntry rent, minus the tx fee.
    assert.ok(p1After > p1Before + ENTRY_FEE.toNumber() - 10_000);

    await program.methods
      .refund()
      .accountsPartial({
        league,
        playerEntry: entryPda(league, p2.publicKey),
        player: p2.publicKey,
      })
      .signers([p2])
      .rpc();

    state = await program.account.league.fetch(league);
    assert.ok(state.totalPot.eqn(0));

    // A second refund attempt has no PlayerEntry PDA left to close against.
    await expectError(
      program.methods
        .refund()
        .accountsPartial({
          league,
          playerEntry: entryPda(league, p1.publicKey),
          player: p1.publicKey,
        })
        .signers([p1])
        .rpc(),
      "AccountNotInitialized"
    );
  });

  it("rejects cancel from a non-admin signer", async () => {
    const { league } = await createLeague();
    const outsider = await fundedKeypair();
    await expectError(
      program.methods
        .cancelLeague()
        .accountsPartial({ league, admin: outsider.publicKey })
        .signers([outsider])
        .rpc(),
      "Unauthorized"
    );
  });

  it("rejects cancelling a locked league", async () => {
    const { league } = await createLeague();
    const p1 = await fundedKeypair();
    await join(league, p1);
    await program.methods
      .lockLeague()
      .accountsPartial({ league, admin: admin.publicKey })
      .rpc();

    await expectError(
      program.methods
        .cancelLeague()
        .accountsPartial({ league, admin: admin.publicKey })
        .rpc(),
      "CancelNotAllowed"
    );
  });

  it("rejects a refund before the league is cancelled", async () => {
    const { league } = await createLeague();
    const p1 = await fundedKeypair();
    await join(league, p1);

    await expectError(
      program.methods
        .refund()
        .accountsPartial({
          league,
          playerEntry: entryPda(league, p1.publicKey),
          player: p1.publicKey,
        })
        .signers([p1])
        .rpc(),
      "LeagueNotCancelled"
    );
  });

  // ── close_league (rent reclamation) ──────────────────────────────────────

  it("closes a fully-claimed SOL league and returns rent to admin", async () => {
    const { league } = await createLeague();
    const p1 = await fundedKeypair();
    const p2 = await fundedKeypair();
    await join(league, p1);
    await join(league, p2);

    await program.methods.lockLeague().accountsPartial({ league, admin: admin.publicKey }).rpc();

    const pot = ENTRY_FEE.muln(2);
    const w1 = pot.muln(60).divn(100);
    const w2 = pot.sub(w1);
    const winners = [p1.publicKey, p2.publicKey];
    await program.methods
      .resolveLeague(winners, [w1, w2])
      .accountsPartial({ league, authority: admin.publicKey })
      .remainingAccounts(winnerEntries(league, winners))
      .rpc();

    // Both winners claim.
    await program.methods.claimPayout().accountsPartial({ league, player: p1.publicKey }).signers([p1]).rpc();
    await program.methods.claimPayout().accountsPartial({ league, player: p2.publicKey }).signers([p2]).rpc();

    const adminBefore = await connection.getBalance(admin.publicKey);

    // Close returns the rent reserve to admin.
    await program.methods
      .closeLeague()
      .accountsPartial({
        league,
        admin: admin.publicKey,
        // SOL league: vault is unused but must be provided; pass a dummy (admin itself).
        vault: admin.publicKey,
      })
      .rpc();

    const adminAfter = await connection.getBalance(admin.publicKey);
    // Admin received rent minus tx fee; net balance should be higher.
    assert.ok(adminAfter > adminBefore - 10_000);

    // League account is now closed.
    const info = await connection.getAccountInfo(league);
    assert.isNull(info);
  });

  it("rejects closing a league before all winners have claimed", async () => {
    const { league } = await createLeague();
    const p1 = await fundedKeypair();
    const p2 = await fundedKeypair();
    await join(league, p1);
    await join(league, p2);

    await program.methods.lockLeague().accountsPartial({ league, admin: admin.publicKey }).rpc();

    const pot = ENTRY_FEE.muln(2);
    const w1 = pot.muln(60).divn(100);
    const w2 = pot.sub(w1);
    const winners = [p1.publicKey, p2.publicKey];
    await program.methods
      .resolveLeague(winners, [w1, w2])
      .accountsPartial({ league, authority: admin.publicKey })
      .remainingAccounts(winnerEntries(league, winners))
      .rpc();

    // Only p1 claims; p2 has not yet claimed.
    await program.methods.claimPayout().accountsPartial({ league, player: p1.publicKey }).signers([p1]).rpc();

    await expectError(
      program.methods
        .closeLeague()
        .accountsPartial({ league, admin: admin.publicKey, vault: admin.publicKey })
        .rpc(),
      "LeagueNotFullyClaimed"
    );
  });

  it("rejects closing a league that has not been resolved", async () => {
    const { league } = await createLeague();
    const p1 = await fundedKeypair();
    await join(league, p1);

    await expectError(
      program.methods
        .closeLeague()
        .accountsPartial({ league, admin: admin.publicKey, vault: admin.publicKey })
        .rpc(),
      "LeagueNotResolved"
    );
  });

  // ── deadline enforcement ─────────────────────────────────────────────────

  it("rejects joining after the join deadline has passed", async () => {
    // Deadline of 1 (Unix epoch + 1 second = long in the past).
    const { league } = await createLeague({ joinDeadline: new BN(1) });
    const late = await fundedKeypair();
    await expectError(join(league, late), "JoinDeadlineExceeded");
  });

  it("allows joining when the join deadline has not yet passed", async () => {
    // Deadline far in the future (year 2099).
    const { league } = await createLeague({ joinDeadline: new BN(4102444800) });
    const p1 = await fundedKeypair();
    await join(league, p1);
    const state = await program.account.league.fetch(league);
    assert.strictEqual(state.playerCount, 1);
  });

  it("rejects locking after the lock deadline has passed", async () => {
    const { league } = await createLeague({ lockDeadline: new BN(1) });
    await expectError(
      program.methods.lockLeague().accountsPartial({ league, admin: admin.publicKey }).rpc(),
      "LockDeadlineExceeded"
    );
  });

  it("allows locking when the lock deadline has not yet passed", async () => {
    const { league } = await createLeague({ lockDeadline: new BN(4102444800) });
    await program.methods.lockLeague().accountsPartial({ league, admin: admin.publicKey }).rpc();
    const state = await program.account.league.fetch(league);
    assert.deepStrictEqual(state.status, { locked: {} });
  });
});

