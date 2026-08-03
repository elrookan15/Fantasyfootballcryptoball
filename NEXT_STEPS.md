# NEXT_STEPS — Roadmap beyond the escrow MVP

This repository intentionally ships a small, working slice: a **league entry-fee
escrow** program plus a minimal wallet-connected frontend. The features below are
part of the longer-term RoundBlock vision but are **explicitly out of scope** for
this MVP. They are recorded here so the next iterations have a clear starting
point.

## Deferred features (not built yet)

- **Dynamic NFTs** — League passes / roster positions as evolving NFTs (metadata
  updates as the season progresses). Needs a metadata standard (e.g. Token
  Metadata / Core) and an update authority owned by the program.
- **DAO governance & voting** — On-chain proposals and voting for protocol
  parameters and dispute resolution. Would replace/augment the single
  admin/oracle authority in the escrow with a governance program.
- **AMM salary-cap draftboards** — Bonding-curve player pricing that scales with
  global ownership, instead of a static salary cap. Requires an on-chain AMM and
  price oracle.
- **FAAB commit–reveal waivers** — Blind free-agent bidding using a
  commit–reveal scheme to prevent front-running of waiver claims.
- **Aether AI draft advisor** — Off-chain AI (lineup synergy, win probability)
  surfaced in the UI; must never be a signing authority.
- **Full Draft Room UI** — Real-time draft board, pick queue, on-the-clock
  timers, WebSocket event streaming, contract-enforced positional limits and
  auto-pick. (See historical `DRAFT_ROOM_SPEC` in git history for the vision.)

## Already shipped since the first cut

- **USDC / SPL-token support.** ✅ Leagues can now be denominated in native SOL
  **or** an SPL token (USDC) via `create_league_spl` / `join_league_spl` /
  `claim_payout_spl`, using an ATA vault owned by the league PDA. The SOL path is
  unchanged and both are covered by tests.
- **On-chain winner verification at resolve.** ✅ `resolve_league` derives each
  winner's `PlayerEntry` PDA and asserts it belongs to that league/player before
  recording payouts, instead of trusting the admin/oracle's word alone.
- **Refund / cancel path.** ✅ `cancel_league` (admin-only, only while `Open`)
  moves a league to `Cancelled`; `refund` / `refund_spl` then let each player
  reclaim their exact deposit (SOL or SPL) and close their `PlayerEntry` PDA
  back to themselves, recovering its rent too. Covered by tests in both suites.
- **Rent reclamation for resolved leagues.** ✅ `close_league` (admin-only, after
  all winners have claimed) closes the `League` PDA back to the admin, returning
  its rent-exempt reserve. For SPL leagues it also closes the empty vault ATA via
  `close_account` CPI, recovering its rent too. Covered by tests in both suites.
- **Deadlines / timestamps.** ✅ `create_league` / `create_league_spl` now accept
  optional `join_deadline` and `lock_deadline` Unix timestamps (pass `0` for no
  deadline). `join_league` / `join_league_spl` reject joins after `join_deadline`;
  `lock_league` rejects locks after `lock_deadline`. Both are enforced via
  `Clock::get()` and covered by tests in both suites.

## Natural follow-ups to the escrow program itself

These harden/extend what already exists and are the most logical next commits:

1. **Events → indexer.** Index the emitted events (`LeagueCreated`,
   `PlayerJoined`, `LeagueResolved`, `PayoutClaimed`, `LeagueCancelled`,
   `PlayerRefunded`, `LeagueClosed`) for a richer UI and history.
2. **Security review.** Independent audit + fuzzing before any mainnet value.
