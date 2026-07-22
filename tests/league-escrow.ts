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
  }) {
    const leagueId = new BN(nextLeagueId++);
    const league = leaguePda(admin.publicKey, leagueId);
    const oracle = opts?.oracle ?? admin.publicKey;
    await program.methods
      .createLeague(
        leagueId,
        opts?.entryFee ?? ENTRY_FEE,
        opts?.maxPlayers ?? MAX_PLAYERS,
        oracle
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

    // Resolve with a 60/40 split of the full pot.
    const pot = ENTRY_FEE.muln(2);
    const winner1 = pot.muln(60).divn(100);
    const winner2 = pot.sub(winner1);
    await program.methods
      .resolveLeague(
        [p1.publicKey, p2.publicKey],
        [winner1, winner2]
      )
      .accountsPartial({ league, authority: admin.publicKey })
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

    await program.methods
      .resolveLeague([p1.publicKey], [ENTRY_FEE])
      .accountsPartial({ league, authority: oracle.publicKey })
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
    await expectError(
      program.methods
        .resolveLeague([p1.publicKey], [ENTRY_FEE])
        .accountsPartial({ league, authority: outsider.publicKey })
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
    await expectError(
      program.methods
        .resolveLeague([p1.publicKey], [ENTRY_FEE])
        .accountsPartial({ league, authority: admin.publicKey })
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
    await expectError(
      program.methods
        .resolveLeague([p1.publicKey], [ENTRY_FEE.muln(5)])
        .accountsPartial({ league, authority: admin.publicKey })
        .rpc(),
      "PayoutExceedsPot"
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
    await program.methods
      .resolveLeague([p1.publicKey], [ENTRY_FEE])
      .accountsPartial({ league, authority: admin.publicKey })
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
    await join(league, p2);
    await program.methods
      .lockLeague()
      .accountsPartial({ league, admin: admin.publicKey })
      .rpc();
    await program.methods
      .resolveLeague([p1.publicKey], [ENTRY_FEE])
      .accountsPartial({ league, authority: admin.publicKey })
      .rpc();

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
});
