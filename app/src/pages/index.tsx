import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Head from "next/head";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  entryPda,
  getProgram,
  getReadonlyProgram,
  leaguePda,
  playerAta,
  statusLabel,
  vaultAta,
} from "../lib/program";
import {
  NETWORK_LABEL,
  SOL_DECIMALS,
  USDC_DECIMALS,
  USDC_MINT,
} from "../lib/constants";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

type Currency = "SOL" | "USDC" | "SPL";
type LeagueRef = { admin: string; leagueId: string };

type LeagueView = {
  address: string;
  admin: string;
  oracle: string;
  currency: Currency;
  decimals: number;
  paymentMint: string | null;
  vault: string | null;
  entryFee: number;
  maxPlayers: number;
  playerCount: number;
  pot: number;
  escrowBalance: number;
  status: string;
  winners: { player: string; amount: number; claimed: boolean }[];
};

type LeagueSummary = {
  admin: string;
  leagueId: string;
  currency: Currency;
  entryFee: number;
  playerCount: number;
  maxPlayers: number;
};

function currencyOf(paymentMint: PublicKey | null): Currency {
  if (!paymentMint) return "SOL";
  if (paymentMint.equals(USDC_MINT)) return "USDC";
  return "SPL";
}

function toBaseUnits(value: string, decimals: number): BN {
  const f = parseFloat(value);
  if (!isFinite(f) || f <= 0) throw new Error("Enter a positive amount");
  return new BN(Math.round(f * 10 ** decimals));
}

export default function Home() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();

  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Create-league form.
  const [currency, setCurrency] = useState<"SOL" | "USDC">("SOL");
  const [entryFee, setEntryFee] = useState("0.1");
  const [maxPlayers, setMaxPlayers] = useState("4");
  const [leagueId, setLeagueId] = useState(() =>
    String(Math.floor(Math.random() * 1_000_000))
  );

  // Browse + lookup.
  const [openLeagues, setOpenLeagues] = useState<LeagueSummary[]>([]);
  const [ref, setRef] = useState<LeagueRef | null>(null);
  const [lookupAdmin, setLookupAdmin] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [league, setLeague] = useState<LeagueView | null>(null);

  // Resolve form (admin/oracle only).
  const [winnerAddr, setWinnerAddr] = useState("");
  const [winnerAmt, setWinnerAmt] = useState("");

  const notify = useCallback((msg: string) => setStatus(msg), []);

  const refresh = useCallback(
    async (r: LeagueRef) => {
      try {
        const program = getReadonlyProgram(connection);
        const pda = leaguePda(new PublicKey(r.admin), new BN(r.leagueId));
        const acc = await program.account.league.fetch(pda);
        const paymentMint = acc.paymentMint as PublicKey | null;
        const cur = currencyOf(paymentMint);

        let decimals = SOL_DECIMALS;
        let escrowBalance = 0;
        if (!paymentMint) {
          escrowBalance = (await connection.getBalance(pda)) / 10 ** decimals;
        } else {
          const bal = await connection.getTokenAccountBalance(acc.vault);
          decimals = bal.value.decimals;
          escrowBalance = bal.value.uiAmount ?? 0;
        }

        setLeague({
          address: pda.toBase58(),
          admin: acc.admin.toBase58(),
          oracle: acc.oracle.toBase58(),
          currency: cur,
          decimals,
          paymentMint: paymentMint ? paymentMint.toBase58() : null,
          vault: paymentMint ? acc.vault.toBase58() : null,
          entryFee: acc.entryFee.toNumber() / 10 ** decimals,
          maxPlayers: acc.maxPlayers,
          playerCount: acc.playerCount,
          pot: acc.totalPot.toNumber() / 10 ** decimals,
          escrowBalance,
          status: statusLabel(acc.status as Record<string, unknown>),
          winners: acc.winners.map((w) => ({
            player: w.player.toBase58(),
            amount: w.amount.toNumber() / 10 ** decimals,
            claimed: w.claimed,
          })),
        });
      } catch (e) {
        setLeague(null);
        notify(`Could not load league: ${(e as Error).message}`);
      }
    },
    [connection, notify]
  );

  const loadOpenLeagues = useCallback(async () => {
    try {
      const program = getReadonlyProgram(connection);
      const all = await program.account.league.all();
      const open = all
        .filter((l) => "open" in (l.account.status as Record<string, unknown>))
        .map((l) => {
          const pm = l.account.paymentMint as PublicKey | null;
          const cur = currencyOf(pm);
          const dec = cur === "SOL" ? SOL_DECIMALS : USDC_DECIMALS;
          return {
            admin: l.account.admin.toBase58(),
            leagueId: l.account.leagueId.toString(),
            currency: cur,
            entryFee: l.account.entryFee.toNumber() / 10 ** dec,
            playerCount: l.account.playerCount,
            maxPlayers: l.account.maxPlayers,
          } as LeagueSummary;
        });
      setOpenLeagues(open);
      notify(`Found ${open.length} open league(s).`);
    } catch (e) {
      notify(`Could not list leagues: ${(e as Error).message}`);
    }
  }, [connection, notify]);

  useEffect(() => {
    if (ref) void refresh(ref);
    const id = ref ? setInterval(() => void refresh(ref), 8000) : undefined;
    return () => id && clearInterval(id);
  }, [ref, refresh]);

  useEffect(() => {
    void loadOpenLeagues();
  }, [loadOpenLeagues]);

  const run = useCallback(
    async (label: string, fn: () => Promise<string>) => {
      if (!wallet) return notify("Connect a wallet first.");
      setBusy(true);
      notify(`${label}…`);
      try {
        const sig = await fn();
        notify(`${label} ✓  (tx ${sig.slice(0, 8)}…)`);
        if (ref) await refresh(ref);
        await loadOpenLeagues();
      } catch (e) {
        notify(`${label} failed: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [wallet, ref, refresh, loadOpenLeagues, notify]
  );

  const onCreate = () =>
    run("Create league", async () => {
      const program = getProgram(connection, wallet!);
      const id = new BN(leagueId);
      const pda = leaguePda(wallet!.publicKey, id);
      const players = parseInt(maxPlayers, 10);
      const newRef = { admin: wallet!.publicKey.toBase58(), leagueId };

      let sig: string;
      if (currency === "SOL") {
        sig = await program.methods
          .createLeague(
            id,
            toBaseUnits(entryFee, SOL_DECIMALS),
            players,
            wallet!.publicKey
          )
          .accountsPartial({
            league: pda,
            admin: wallet!.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } else {
        sig = await program.methods
          .createLeagueSpl(
            id,
            toBaseUnits(entryFee, USDC_DECIMALS),
            players,
            wallet!.publicKey
          )
          .accountsPartial({
            league: pda,
            mint: USDC_MINT,
            vault: vaultAta(pda, USDC_MINT),
            admin: wallet!.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }
      setRef(newRef);
      setLookupAdmin(newRef.admin);
      setLookupId(leagueId);
      return sig;
    });

  const selectLeague = (admin: string, leagueId: string) => {
    setLookupAdmin(admin);
    setLookupId(leagueId);
    setRef({ admin, leagueId });
  };

  const onLookup = () => {
    if (!lookupAdmin || !lookupId) return notify("Enter admin + league id.");
    selectLeague(lookupAdmin.trim(), lookupId.trim());
  };

  const onJoin = () =>
    run("Join league", async () => {
      const program = getProgram(connection, wallet!);
      const pda = new PublicKey(league!.address);
      if (league!.paymentMint === null) {
        return program.methods
          .joinLeague()
          .accountsPartial({
            league: pda,
            playerEntry: entryPda(pda, wallet!.publicKey),
            player: wallet!.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }
      const mint = new PublicKey(league!.paymentMint);
      return program.methods
        .joinLeagueSpl()
        .accountsPartial({
          league: pda,
          playerEntry: entryPda(pda, wallet!.publicKey),
          player: wallet!.publicKey,
          mint,
          vault: new PublicKey(league!.vault!),
          playerTokenAccount: playerAta(mint, wallet!.publicKey),
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

  const onLock = () =>
    run("Lock league", async () => {
      const program = getProgram(connection, wallet!);
      return program.methods
        .lockLeague()
        .accountsPartial({
          league: new PublicKey(league!.address),
          admin: wallet!.publicKey,
        })
        .rpc();
    });

  const onResolve = () =>
    run("Resolve league", async () => {
      const program = getProgram(connection, wallet!);
      const leaguePubkey = new PublicKey(league!.address);
      const winner = new PublicKey(winnerAddr.trim());
      const amount = toBaseUnits(winnerAmt, league!.decimals);
      return program.methods
        .resolveLeague([winner], [amount])
        .accountsPartial({
          league: leaguePubkey,
          authority: wallet!.publicKey,
        })
        .remainingAccounts([
          {
            pubkey: entryPda(leaguePubkey, winner),
            isWritable: false,
            isSigner: false,
          },
        ])
        .rpc();
    });

  const onClaim = () =>
    run("Claim payout", async () => {
      const program = getProgram(connection, wallet!);
      const pda = new PublicKey(league!.address);
      if (league!.paymentMint === null) {
        return program.methods
          .claimPayout()
          .accountsPartial({ league: pda, player: wallet!.publicKey })
          .rpc();
      }
      const mint = new PublicKey(league!.paymentMint);
      return program.methods
        .claimPayoutSpl()
        .accountsPartial({
          league: pda,
          player: wallet!.publicKey,
          mint,
          vault: new PublicKey(league!.vault!),
          playerTokenAccount: playerAta(mint, wallet!.publicKey),
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

  const isAdmin = useMemo(
    () => !!publicKey && !!league && league.admin === publicKey.toBase58(),
    [publicKey, league]
  );
  const isAuthority = useMemo(
    () =>
      !!publicKey &&
      !!league &&
      (league.admin === publicKey.toBase58() ||
        league.oracle === publicKey.toBase58()),
    [publicKey, league]
  );

  return (
    <>
      <Head>
        <title>RoundBlock — League Escrow</title>
      </Head>
      <main className="container">
        <header className="header">
          <div>
            <h1>RoundBlock Protocol</h1>
            <p className="subtitle">
              League escrow MVP · network: <strong>{NETWORK_LABEL}</strong>
            </p>
          </div>
          <WalletMultiButton />
        </header>

        {status && <div className="banner">{status}</div>}

        <section className="card">
          <h2>1 · Create a league</h2>
          <div className="row">
            <label>
              Currency
              <select
                value={currency}
                onChange={(e) =>
                  setCurrency(e.target.value as "SOL" | "USDC")
                }
              >
                <option value="SOL">SOL (native)</option>
                <option value="USDC">USDC (SPL)</option>
              </select>
            </label>
            <label>
              Entry fee ({currency})
              <input
                value={entryFee}
                onChange={(e) => setEntryFee(e.target.value)}
              />
            </label>
            <label>
              Max players
              <input
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
              />
            </label>
            <label>
              League id
              <input
                value={leagueId}
                onChange={(e) => setLeagueId(e.target.value)}
              />
            </label>
          </div>
          <button disabled={!wallet || busy} onClick={onCreate}>
            Create {currency} league
          </button>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>2 · Browse open leagues</h2>
            <button className="ghost" disabled={busy} onClick={loadOpenLeagues}>
              Refresh
            </button>
          </div>
          {openLeagues.length === 0 ? (
            <p className="hint">No open leagues found yet.</p>
          ) : (
            <table className="winners">
              <thead>
                <tr>
                  <th>Admin</th>
                  <th>Id</th>
                  <th>Currency</th>
                  <th>Entry</th>
                  <th>Players</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {openLeagues.map((l) => (
                  <tr key={`${l.admin}-${l.leagueId}`}>
                    <td className="mono">
                      {l.admin.slice(0, 4)}…{l.admin.slice(-4)}
                    </td>
                    <td>{l.leagueId}</td>
                    <td>{l.currency}</td>
                    <td>
                      {l.entryFee} {l.currency}
                    </td>
                    <td>
                      {l.playerCount}/{l.maxPlayers}
                    </td>
                    <td>
                      <button
                        className="ghost"
                        disabled={busy}
                        onClick={() => selectLeague(l.admin, l.leagueId)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="row" style={{ marginTop: 14 }}>
            <label className="grow">
              …or open by admin pubkey
              <input
                value={lookupAdmin}
                onChange={(e) => setLookupAdmin(e.target.value)}
                placeholder="admin wallet address"
              />
            </label>
            <label>
              League id
              <input
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
              />
            </label>
          </div>
          <button disabled={busy} onClick={onLookup}>
            Load league
          </button>
        </section>

        {league && (
          <section className="card">
            <h2>3 · League status</h2>
            <dl className="stats">
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`pill pill-${league.status}`}>
                    {league.status}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Currency</dt>
                <dd>{league.currency}</dd>
              </div>
              <div>
                <dt>Escrow balance</dt>
                <dd>
                  {league.escrowBalance.toFixed(4)} {league.currency}
                </dd>
              </div>
              <div>
                <dt>Pot</dt>
                <dd>
                  {league.pot.toFixed(4)} {league.currency}
                </dd>
              </div>
              <div>
                <dt>Players</dt>
                <dd>
                  {league.playerCount} / {league.maxPlayers}
                </dd>
              </div>
              <div>
                <dt>Entry fee</dt>
                <dd>
                  {league.entryFee} {league.currency}
                </dd>
              </div>
            </dl>
            <p className="mono">PDA: {league.address}</p>
            {league.paymentMint && (
              <p className="mono">Mint: {league.paymentMint}</p>
            )}

            {league.winners.length > 0 && (
              <table className="winners">
                <thead>
                  <tr>
                    <th>Winner</th>
                    <th>Payout</th>
                    <th>Claimed</th>
                  </tr>
                </thead>
                <tbody>
                  {league.winners.map((w) => (
                    <tr key={w.player}>
                      <td className="mono">
                        {w.player.slice(0, 4)}…{w.player.slice(-4)}
                      </td>
                      <td>
                        {w.amount.toFixed(4)} {league.currency}
                      </td>
                      <td>{w.claimed ? "yes" : "no"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="actions">
              <button
                disabled={!wallet || busy || league.status !== "open"}
                onClick={onJoin}
              >
                Join / deposit {league.entryFee} {league.currency}
              </button>
              <button
                disabled={!wallet || busy || league.status !== "resolved"}
                onClick={onClaim}
              >
                Claim payout
              </button>
              {isAdmin && (
                <button
                  disabled={busy || league.status !== "open"}
                  onClick={onLock}
                >
                  Lock (admin)
                </button>
              )}
            </div>

            {isAuthority && league.status === "locked" && (
              <div className="resolve">
                <h3>Resolve (admin / oracle)</h3>
                <div className="row">
                  <label className="grow">
                    Winner pubkey
                    <input
                      value={winnerAddr}
                      onChange={(e) => setWinnerAddr(e.target.value)}
                      placeholder="winner wallet address"
                    />
                  </label>
                  <label>
                    Payout ({league.currency})
                    <input
                      value={winnerAmt}
                      onChange={(e) => setWinnerAmt(e.target.value)}
                      placeholder={String(league.pot)}
                    />
                  </label>
                </div>
                <button disabled={busy} onClick={onResolve}>
                  Resolve with single winner
                </button>
                <p className="hint">
                  MVP UI resolves to one winner. The program supports an
                  arbitrary winner/amount split via <code>resolve_league</code>.
                </p>
              </div>
            )}
          </section>
        )}

        <footer className="footer">
          Functional MVP — see <code>NEXT_STEPS.md</code> for deferred features.
        </footer>
      </main>
    </>
  );
}
