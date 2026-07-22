# RoundBlock Protocol — League Escrow MVP

A crypto-native fantasy football platform on **Solana**. This repository is the
**escrow-first MVP**: the trust-minimized money layer that holds league entry
fees and pays out winners. It is deliberately small — the broader vision
(dynamic NFTs, DAO governance, AMM salary caps, an AI draft advisor, a full draft
room) is **not** built here and is tracked in [`NEXT_STEPS.md`](./NEXT_STEPS.md).

What ships today:

- An **Anchor (Rust)** program, `league-escrow`, that escrows league entry fees
  and distributes payouts, with PDA-based accounts, access control, and checked
  arithmetic.
- A **TypeScript integration test suite** (Anchor + Mocha) covering the full
  happy path and several failure cases.
- A minimal **Next.js** frontend using `@solana/wallet-adapter` and
  `@coral-xyz/anchor` to connect a wallet, create/join a league, and view escrow
  status.
- **GitHub Actions CI** that builds the program and runs its tests.

## Monorepo layout

```
.
├── programs/league-escrow/   # Anchor program (Rust)
│   └── src/lib.rs
├── tests/                     # Anchor TypeScript integration tests
│   └── league-escrow.ts
├── app/                       # Next.js frontend (wallet-adapter + anchor client)
│   └── src/{pages,components,lib}
├── Anchor.toml                # Anchor workspace config
├── Cargo.toml                 # Rust workspace
├── .github/workflows/ci.yml   # CI: anchor build + anchor test
├── NEXT_STEPS.md              # Deferred / future-phase features
└── .env.example
```

## The escrow program

Program id: `AHw96CksnrkLDHkjQUsRGPbHPpj8Xjyzh7BFrViRt6sc`

### Accounts

- **`League`** — PDA seeded by `["league", admin, league_id]`. Holds config
  (admin, oracle, entry fee, max players), lifecycle `status`
  (`Open → Locked → Resolved`), the running `total_pot`, and — after resolve —
  the winner payout table. The PDA account itself custodies the escrowed
  lamports (pot) on top of its rent-exempt reserve.
- **`PlayerEntry`** — PDA seeded by `["entry", league, player]`, created when a
  player joins. Because it is `init`-ed, a wallet can only join a league once.

### Instructions

| Instruction      | Who            | Effect |
| ---------------- | -------------- | ------ |
| `create_league`  | anyone (admin) | Initializes a `League` with entry fee, max players, and an oracle authority. |
| `join_league`    | any player     | Transfers the entry fee into the escrow PDA and registers a `PlayerEntry`. Rejected once locked or full. |
| `lock_league`    | admin only     | Closes entries (`Open → Locked`). |
| `resolve_league` | admin or oracle| Records winner(s) and their lamport split (`Locked → Resolved`). Validated: sum ≤ pot, no duplicates, count ≤ players. |
| `claim_payout`   | winning player | Withdraws the caller's share from escrow exactly once. |

Access control uses `has_one`/explicit checks; all balance math uses
`checked_add`/`checked_sub`; and the escrow keeps its rent-exempt reserve intact
on withdrawal.

### Currency choice: SOL vs USDC

This MVP escrows **native SOL (lamports)** to keep the program small — no SPL
token accounts, associated-token-account creation, or token-program CPIs. The
tradeoff is that leagues are denominated in a volatile asset. Migrating to
**USDC** later means adding an SPL-token vault PDA and replacing the
system-program transfers with `token::transfer` CPIs; the account model and
access control above are unaffected. See `NEXT_STEPS.md`.

## Prerequisites

- **Rust** (stable, ≥ 1.85 — some transitive deps require the 2024 edition)
- **Solana CLI (Agave)** — `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`
- **Anchor CLI 0.31.1** — `cargo install --git https://github.com/coral-xyz/anchor --tag v0.31.1 anchor-cli --locked`
- **Node.js ≥ 20** and **Yarn** (classic)

## Build & test (localnet)

```bash
# from the repo root
yarn install            # test-suite dependencies
anchor build            # compile the SBF program + generate IDL/types
anchor test             # spins up a local validator, deploys, runs the tests
```

`anchor test` should report **10 passing**: the full lifecycle
(create → join × 2 → lock → resolve → claim) plus failure cases (join after lock,
non-admin lock/resolve, resolve before lock, payout > pot, double-claim,
non-winner claim, duplicate join).

## Deploy to devnet

```bash
solana config set --url devnet
solana airdrop 2                      # fund your deploy wallet
anchor build
anchor deploy --provider.cluster devnet
```

If you generate a fresh program keypair, run `anchor keys sync` to update the
`declare_id!` and `Anchor.toml`, then rebuild.

## Run the frontend

```bash
cd app
cp .env.local.example .env.local      # point NEXT_PUBLIC_SOLANA_RPC_URL at devnet or localnet
npm install
npm run dev                           # http://localhost:3000
```

The IDL and generated types are committed under `app/src/lib/idl/`. After
changing the program, regenerate them:

```bash
anchor build
cp target/idl/league_escrow.json app/src/lib/idl/league_escrow.json
cp target/types/league_escrow.ts app/src/lib/idl/league_escrow.ts
```

Then in the browser: connect Phantom → **Create a league** → share your wallet
address + league id → other wallets **Load league** and **Join / deposit** →
admin **Lock** and **Resolve** → winners **Claim payout**.

## License

[MIT](./LICENSE)
