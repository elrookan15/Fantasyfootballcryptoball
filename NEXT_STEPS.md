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

## Natural follow-ups to the escrow program itself

These harden/extend what already exists and are the most logical next commits:

1. **USDC / SPL-token support.** Today the escrow holds native SOL for
   simplicity. Add an SPL-token vault PDA and swap the system-program transfers
   for `token::transfer` CPIs so leagues can be denominated in USDC. The account
   model and access control carry over unchanged.
2. **On-chain winner verification at resolve.** `resolve_league` currently trusts
   the admin/oracle to name winners. Pass each winner's `PlayerEntry` PDA as a
   remaining account and assert membership before recording payouts.
3. **Refund / cancel path.** Let the admin cancel an under-subscribed league and
   allow players to reclaim deposits (needed before a lock happens).
4. **Rent reclamation.** Close the `League` and `PlayerEntry` accounts after all
   payouts are claimed and return the rent to the payer(s).
5. **Deadlines / timestamps.** Add join/lock deadlines enforced by the on-chain
   clock rather than relying solely on a manual admin `lock_league` call.
6. **Events → indexer.** Index the emitted events (`LeagueCreated`,
   `PlayerJoined`, `LeagueResolved`, `PayoutClaimed`) for a richer UI and history.
7. **Security review.** Independent audit + fuzzing before any mainnet value.
