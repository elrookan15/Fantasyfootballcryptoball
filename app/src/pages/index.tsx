import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Head from "next/head";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  entryPda,
  getProgram,
  getReadonlyProgram,
  leaguePda,
  statusLabel,
} from "../lib/program";
import { NETWORK_LABEL } from "../lib/constants";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (m) => m.WalletMultiButton
    ),
  { ssr: false }
);

type LeagueRef = { admin: string; leagueId: string };

type LeagueView = {
  address: string;
  admin: string;
  oracle: string;
  entryFeeSol: number;
  maxPlayers: number;
  playerCount: number;
  potSol: number;
  escrowBalanceSol: number;
  status: string;
  winners: { player: string; amountSol: number; claimed: boolean }[];
};

export default function Home() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();

  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Create-league form.
  const [entryFee, setEntryFee] = useState("0.1");
  const [maxPlayers, setMaxPlayers] = useState("4");
  const [leagueId, setLeagueId] = useState(
    () => String(Math.floor(Math.random() * 1_000_000))
  );

  // Selected/looked-up league.
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
        const balance = await connection.getBalance(pda);
        setLeague({
          address: pda.toBase58(),
          admin: acc.admin.toBase58(),
          oracle: acc.oracle.toBase58(),
          entryFeeSol: acc.entryFee.toNumber() / LAMPORTS_PER_SOL,
          maxPlayers: acc.maxPlayers,
          playerCount: acc.playerCount,
          potSol: acc.totalPot.toNumber() / LAMPORTS_PER_SOL,
          escrowBalanceSol: balance / LAMPORTS_PER_SOL,
          status: statusLabel(acc.status as Record<string, unknown>),
          winners: acc.winners.map((w) => ({
            player: w.player.toBase58(),
            amountSol: w.amount.toNumber() / LAMPORTS_PER_SOL,
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

  useEffect(() => {
    if (ref) void refresh(ref);
    // Poll for on-chain updates so escrow balance/status stay fresh.
    const id = ref ? setInterval(() => void refresh(ref), 8000) : undefined;
    return () => id && clearInterval(id);
  }, [ref, refresh]);

  const run = useCallback(
    async (label: string, fn: () => Promise<string>) => {
      if (!wallet) return notify("Connect a wallet first.");
      setBusy(true);
      notify(`${label}…`);
      try {
        const sig = await fn();
        notify(`${label} ✓  (tx ${sig.slice(0, 8)}…)`);
        if (ref) await refresh(ref);
      } catch (e) {
        notify(`${label} failed: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [wallet, ref, refresh, notify]
  );

  const onCreate = () =>
    run("Create league", async () => {
      const program = getProgram(connection, wallet!);
      const id = new BN(leagueId);
      const pda = leaguePda(wallet!.publicKey, id);
      const sig = await program.methods
        .createLeague(
          id,
          new BN(Math.round(parseFloat(entryFee) * LAMPORTS_PER_SOL)),
          parseInt(maxPlayers, 10),
          wallet!.publicKey // admin doubles as oracle by default
        )
        .accountsPartial({
          league: pda,
          admin: wallet!.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      const newRef = { admin: wallet!.publicKey.toBase58(), leagueId };
      setRef(newRef);
      setLookupAdmin(newRef.admin);
      setLookupId(leagueId);
      return sig;
    });

  const onLookup = () => {
    if (!lookupAdmin || !lookupId) return notify("Enter admin + league id.");
    setRef({ admin: lookupAdmin.trim(), leagueId: lookupId.trim() });
  };

  const onJoin = () =>
    run("Join league", async () => {
      const program = getProgram(connection, wallet!);
      const pda = new PublicKey(league!.address);
      return program.methods
        .joinLeague()
        .accountsPartial({
          league: pda,
          playerEntry: entryPda(pda, wallet!.publicKey),
          player: wallet!.publicKey,
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
      const winner = new PublicKey(winnerAddr.trim());
      const amount = new BN(
        Math.round(parseFloat(winnerAmt) * LAMPORTS_PER_SOL)
      );
      return program.methods
        .resolveLeague([winner], [amount])
        .accountsPartial({
          league: new PublicKey(league!.address),
          authority: wallet!.publicKey,
        })
        .rpc();
    });

  const onClaim = () =>
    run("Claim payout", async () => {
      const program = getProgram(connection, wallet!);
      return program.methods
        .claimPayout()
        .accountsPartial({
          league: new PublicKey(league!.address),
          player: wallet!.publicKey,
        })
        .rpc();
    });

  const isAdmin = useMemo(
    () =>
      !!publicKey && !!league && league.admin === publicKey.toBase58(),
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
              Entry fee (SOL)
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
            Create league
          </button>
        </section>

        <section className="card">
          <h2>2 · Open an existing league</h2>
          <div className="row">
            <label className="grow">
              Admin pubkey
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
                <dt>Escrow balance</dt>
                <dd>{league.escrowBalanceSol.toFixed(4)} SOL</dd>
              </div>
              <div>
                <dt>Pot (fees)</dt>
                <dd>{league.potSol.toFixed(4)} SOL</dd>
              </div>
              <div>
                <dt>Players</dt>
                <dd>
                  {league.playerCount} / {league.maxPlayers}
                </dd>
              </div>
              <div>
                <dt>Entry fee</dt>
                <dd>{league.entryFeeSol} SOL</dd>
              </div>
            </dl>
            <p className="mono">PDA: {league.address}</p>

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
                      <td>{w.amountSol.toFixed(4)} SOL</td>
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
                Join / deposit {league.entryFeeSol} SOL
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
                    Payout (SOL)
                    <input
                      value={winnerAmt}
                      onChange={(e) => setWinnerAmt(e.target.value)}
                      placeholder={String(league.potSol)}
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
