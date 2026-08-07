## 2024-05-15 - RPC Fetch Optimization
**Learning:** In Solana/Anchor, `program.account.<account_name>.all()` without filters fetches all accounts of that type from the RPC node. When the frontend filters these accounts client-side (e.g., for "open" leagues), it results in massive network payloads and high memory consumption as the number of accounts grows.
**Action:** Use `memcmp` in the `all(filters)` method to push the filtering to the RPC node, pulling only the accounts that actually match the criteria (e.g., using `@coral-xyz/anchor`'s `utils.bytes.bs58` to encode the byte matching the enum status).

## 2024-05-15 - RPC Fetch Single Call Optimization
**Learning:** In Solana/Anchor, `program.account.<account>.fetch(pda)` followed by `connection.getBalance(pda)` (or similar methods) performs multiple sequential RPC calls, increasing network latency and causing performance bottlenecks for polling updates.
**Action:** Use `connection.getAccountInfo(pda)` to get both the raw account data and the lamports/owner information in a single RPC call, and then use `program.coder.accounts.decode("<account>", accInfo.data)` to deserialize the account client-side, reducing RPC network load by half.
