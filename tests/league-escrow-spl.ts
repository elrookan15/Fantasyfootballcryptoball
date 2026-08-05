import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { assert } from "chai";
import { LeagueEscrow } from "../target/types/league_escrow";

describe("league-escrow (USDC / SPL token)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = (anchor.workspace.leagueEscrow ??
    anchor.workspace.LeagueEscrow) as Program<LeagueEscrow>;
  const connection = provider.connection;
  const admin = provider.wallet as anchor.Wallet;

  const DECIMALS = 6; // USDC-style
  const ENTRY_FEE = new BN(10 * 10 ** DECIMALS); // 10 tokens
  const MAX_PLAYERS = 4;

  let mint: PublicKey;
  let mintAuthority: Keypair;
  // Distinct id range from the SOL suite for readability (PDAs are namespaced
  // by admin+id anyway).
  let nextLeagueId = 1000;

  const tokenAccounts = {
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  };

  function leaguePda(adminKey: PublicKey, leagueId: BN): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("league"),
        adminKey.toBuffer(),
        leagueId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId,
    )[0];
  }

  function entryPda(league: PublicKey, player: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("entry"), league.toBuffer(), player.toBuffer()],
      program.programId,
    )[0];
  }

  /** Build the remainingAccounts array for resolveLeague, one entry per winner. */
  function winnerEntries(
    league: PublicKey,
    winners: PublicKey[],
  ): { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[] {
    return winners.map((w) => ({
      pubkey: entryPda(league, w),
      isWritable: false,
      isSigner: false,
    }));
  }

  const vaultAta = (league: PublicKey) =>
    getAssociatedTokenAddressSync(mint, league, true);

  async function airdrop(pubkey: PublicKey, sol: number) {
    const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
    const bh = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
  }

  async function fundedKeypair(sol = 2): Promise<Keypair> {
    const kp = Keypair.generate();
    await airdrop(kp.publicKey, sol);
    return kp;
  }

  // A player funded with SOL (for fees/rent) and minted `amount` tokens.
  async function playerWithTokens(amount: BN): Promise<Keypair> {
    const kp = await fundedKeypair(2);
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      kp,
      mint,
      kp.publicKey,
    );
    await mintTo(
      connection,
      mintAuthority,
      mint,
      ata.address,
      mintAuthority,
      BigInt(amount.toString()),
    );
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

  async function createLeague() {
    const leagueId = new BN(nextLeagueId++);
    const league = leaguePda(admin.publicKey, leagueId);
    const vault = vaultAta(league);
    await program.methods
      .createLeagueSpl(leagueId, ENTRY_FEE, MAX_PLAYERS, admin.publicKey)
      .accountsPartial({
        league,
        mint,
        vault,
        admin: admin.publicKey,
        ...tokenAccounts,
      })
      .rpc();
    return { leagueId, league, vault };
  }

  async function join(league: PublicKey, vault: PublicKey, player: Keypair) {
    await program.methods
      .joinLeagueSpl()
      .accountsPartial({
        league,
        playerEntry: entryPda(league, player.publicKey),
        player: player.publicKey,
        mint,
        vault,
        playerTokenAccount: getAssociatedTokenAddressSync(
          mint,
          player.publicKey,
        ),
        ...tokenAccounts,
      })
      .signers([player])
      .rpc();
  }

  async function lock(league: PublicKey) {
    await program.methods
      .lockLeague()
      .accountsPartial({ league, admin: admin.publicKey })
      .rpc();
  }

  function claimTx(league: PublicKey, vault: PublicKey, player: Keypair) {
    return program.methods
      .claimPayoutSpl()
      .accountsPartial({
        league,
        player: player.publicKey,
        mint,
        vault,
        playerTokenAccount: getAssociatedTokenAddressSync(
          mint,
          player.publicKey,
        ),
        ...tokenAccounts,
      })
      .signers([player]);
  }

  before(async () => {
    const balance = await connection.getBalance(admin.publicKey);
    if (balance < 5 * LAMPORTS_PER_SOL) await airdrop(admin.publicKey, 100);
    mintAuthority = await fundedKeypair(5);
    mint = await createMint(
      connection,
      mintAuthority,
      mintAuthority.publicKey,
      null,
      DECIMALS,
    );
  });

  it("runs the full happy path (USDC): create -> join x2 -> lock -> resolve -> claim", async () => {
    const { league, vault } = await createLeague();
    const p1 = await playerWithTokens(ENTRY_FEE);
    const p2 = await playerWithTokens(ENTRY_FEE);

    await join(league, vault, p1);
    await join(league, vault, p2);

    let state = await program.account.league.fetch(league);
    assert.strictEqual(state.playerCount, 2);
    assert.isNotNull(state.paymentMint);
    assert.strictEqual(state.paymentMint!.toBase58(), mint.toBase58());
    assert.ok(state.totalPot.eq(ENTRY_FEE.muln(2)));

    const vaultAcc = await getAccount(connection, vault);
    assert.strictEqual(
      vaultAcc.amount.toString(),
      ENTRY_FEE.muln(2).toString(),
    );

    await lock(league);

    const pot = ENTRY_FEE.muln(2);
    const w1 = pot.muln(60).divn(100);
    const w2 = pot.sub(w1);
    const winners = [p1.publicKey, p2.publicKey];
    await program.methods
      .resolveLeague(winners, [w1, w2])
      .accountsPartial({ league, authority: admin.publicKey })
      .remainingAccounts(winnerEntries(league, winners))
      .rpc();

    await claimTx(league, vault, p1).rpc();
    await claimTx(league, vault, p2).rpc();

    // Each player deposited their entire balance, so post-claim balance == payout.
    const p1Bal = (
      await getAccount(
        connection,
        getAssociatedTokenAddressSync(mint, p1.publicKey),
      )
    ).amount;
    const p2Bal = (
      await getAccount(
        connection,
        getAssociatedTokenAddressSync(mint, p2.publicKey),
      )
    ).amount;
    assert.strictEqual(p1Bal.toString(), w1.toString());
    assert.strictEqual(p2Bal.toString(), w2.toString());

    const vaultAfter = await getAccount(connection, vault);
    assert.strictEqual(vaultAfter.amount.toString(), "0");

    state = await program.account.league.fetch(league);
    assert.ok(state.totalPot.eqn(0));
    assert.ok(state.winners.every((w) => w.claimed));
  });

  it("rejects resolve from a non-admin / non-oracle signer (USDC)", async () => {
    const { league, vault } = await createLeague();
    const p1 = await playerWithTokens(ENTRY_FEE);
    await join(league, vault, p1);
    await lock(league);

    const outsider = await fundedKeypair();
    const winners = [p1.publicKey];
    await expectError(
      program.methods
        .resolveLeague(winners, [ENTRY_FEE])
        .accountsPartial({ league, authority: outsider.publicKey })
        .remainingAccounts(winnerEntries(league, winners))
        .signers([outsider])
        .rpc(),
      "Unauthorized",
    );
  });

  it("rejects a second claim by the same winner (double-claim, USDC)", async () => {
    const { league, vault } = await createLeague();
    const p1 = await playerWithTokens(ENTRY_FEE);
    const p2 = await playerWithTokens(ENTRY_FEE);
    await join(league, vault, p1);
    await join(league, vault, p2);
    await lock(league);
    // Resolve full pot with both players.
    const pot = ENTRY_FEE.muln(2);
    const w1 = pot.muln(60).divn(100);
    const w2 = pot.sub(w1);
    const winners = [p1.publicKey, p2.publicKey];
    await program.methods
      .resolveLeague(winners, [w1, w2])
      .accountsPartial({ league, authority: admin.publicKey })
      .remainingAccounts(winnerEntries(league, winners))
      .rpc();

    await claimTx(league, vault, p1).rpc();
    await expectError(claimTx(league, vault, p1).rpc(), "AlreadyClaimed");
  });

  it("rejects using the native-SOL join on an SPL league (currency guard)", async () => {
    const { league } = await createLeague();
    const p1 = await playerWithTokens(ENTRY_FEE);
    await expectError(
      program.methods
        .joinLeague()
        .accountsPartial({
          league,
          playerEntry: entryPda(league, p1.publicKey),
          player: p1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([p1])
        .rpc(),
      "WrongCurrency",
    );
  });

  it("rejects a payout split that exceeds the pot (USDC)", async () => {
    const { league, vault } = await createLeague();
    const p1 = await playerWithTokens(ENTRY_FEE);
    await join(league, vault, p1);
    await lock(league);
    const winners = [p1.publicKey];
    await expectError(
      program.methods
        .resolveLeague(winners, [ENTRY_FEE.muln(5)])
        .accountsPartial({ league, authority: admin.publicKey })
        .remainingAccounts(winnerEntries(league, winners))
        .rpc(),
      "PayoutMustEqualPot",
    );
  });

  it("rejects a payout split that is below the pot (USDC)", async () => {
    const { league, vault } = await createLeague();
    const p1 = await playerWithTokens(ENTRY_FEE);
    await join(league, vault, p1);
    await lock(league);
    const winners = [p1.publicKey];
    await expectError(
      program.methods
        .resolveLeague(winners, [ENTRY_FEE.subn(1)])
        .accountsPartial({ league, authority: admin.publicKey })
        .remainingAccounts(winnerEntries(league, winners))
        .rpc(),
      "PayoutMustEqualPot",
    );
  });

  it("rejects a non-participant winner (WinnerNotParticipant, USDC)", async () => {
    const { league, vault } = await createLeague();
    const p1 = await playerWithTokens(ENTRY_FEE);
    const outsider = await fundedKeypair();
    await join(league, vault, p1);
    await lock(league);

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
      "WinnerNotParticipant",
    );
  });

  it("cancels an open league and lets a player refund their USDC deposit", async () => {
    const { league, vault } = await createLeague();
    const p1 = await playerWithTokens(ENTRY_FEE);
    await join(league, vault, p1);

    await program.methods
      .cancelLeague()
      .accountsPartial({ league, admin: admin.publicKey })
      .rpc();

    let state = await program.account.league.fetch(league);
    assert.deepStrictEqual(state.status, { cancelled: {} });

    await program.methods
      .refundSpl()
      .accountsPartial({
        league,
        playerEntry: entryPda(league, p1.publicKey),
        player: p1.publicKey,
        mint,
        vault,
        playerTokenAccount: getAssociatedTokenAddressSync(mint, p1.publicKey),
        ...tokenAccounts,
      })
      .signers([p1])
      .rpc();

    const p1Token = await getAccount(
      connection,
      getAssociatedTokenAddressSync(mint, p1.publicKey),
    );
    assert.strictEqual(p1Token.amount.toString(), ENTRY_FEE.toString());

    state = await program.account.league.fetch(league);
    assert.ok(state.totalPot.eqn(0));
  });

  it("rejects a USDC refund before the league is cancelled", async () => {
    const { league, vault } = await createLeague();
    const p1 = await playerWithTokens(ENTRY_FEE);
    await join(league, vault, p1);

    await expectError(
      program.methods
        .refundSpl()
        .accountsPartial({
          league,
          playerEntry: entryPda(league, p1.publicKey),
          player: p1.publicKey,
          mint,
          vault,
          playerTokenAccount: getAssociatedTokenAddressSync(mint, p1.publicKey),
          ...tokenAccounts,
        })
        .signers([p1])
        .rpc(),
      "LeagueNotCancelled",
    );
  });
});
