## 2024-05-15 - Fetching Accounts
**Learning:** In Solana/Anchor, `program.account.<account_name>.all()` fetches ALL accounts from the RPC node, which can be a huge bottleneck and cause large network payloads and memory usage. Filtering them client-side makes this even worse.
**Action:** Use `memcmp` filters in `program.account.<account_name>.all(filters)` to push filtering to the RPC node, fetching only the necessary data.
