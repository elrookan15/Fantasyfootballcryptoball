## 2024-05-15 - RPC Fetch Optimization
**Learning:** In Solana/Anchor, `program.account.<account_name>.all()` without filters fetches all accounts of that type from the RPC node. When the frontend filters these accounts client-side (e.g., for "open" leagues), it results in massive network payloads and high memory consumption as the number of accounts grows.
**Action:** Use `memcmp` in the `all(filters)` method to push the filtering to the RPC node, pulling only the accounts that actually match the criteria (e.g., using `@coral-xyz/anchor`'s `utils.bytes.bs58` to encode the byte matching the enum status).

## 2026-08-08 - IDL Parsing Optimization
**Learning:** Re-instantiating an Anchor `Program` repeatedly (e.g., in `getProgram`) causes a significant performance hit because parsing the large IDL object is an expensive synchronous operation. This led to instantiation times around 1.5ms per call.
**Action:** Always cache the `Program` instance at the module level (memoization), ensuring that if the dependencies (like the RPC connection or wallet signer) are identical, we return the cached instance instead of creating a new one. This reduces the time per call to under 0.05ms.
