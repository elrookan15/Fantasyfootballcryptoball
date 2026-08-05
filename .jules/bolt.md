## 2023-10-27 - Memcmp filter logic

**Learning:** When adding `memcmp` filter constants to Anchor accounts (such as offsets and values), use the `bs58` directly in Next.js instead of nested `@coral-xyz/anchor/dist/cjs/utils/bytes/index.js` which can cause module resolution issues due to internal bundling logic in Next.js/Webpack or Node.
**Action:** Just use `bs58` directly as it's common practice in Solana frontend. Document the struct byte offset cleanly in constants.
