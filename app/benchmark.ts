import { performance } from 'perf_hooks';
import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import bs58 from 'bs58';
import IDL from './src/lib/idl/league_escrow.json';

const LEAGUE_STATUS_OFFSET = 92;
const LEAGUE_STATUS_OPEN = 0;

async function runBenchmark() {
  const connection = new Connection("https://api.devnet.solana.com");
  const wallet = new anchor.Wallet(anchor.web3.Keypair.generate());
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const programId = new PublicKey(IDL.address);
  // @ts-ignore
  const program = new anchor.Program(IDL, provider);

  console.log("Starting benchmark on Devnet...");

  const iterations = 3;

  let noFilterTime = 0;
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const allLeagues = await program.account.league.all();
    const openLeagues = allLeagues.filter((l: any) => "open" in (l.account.status as Record<string, unknown>));
    const end = performance.now();
    noFilterTime += (end - start);
    console.log(`No filter iteration ${i + 1}: ${(end - start).toFixed(2)}ms, found ${openLeagues.length} leagues`);
  }
  const avgNoFilterTime = noFilterTime / iterations;

  let filterTime = 0;
  const filter = {
    memcmp: {
      offset: LEAGUE_STATUS_OFFSET,
      bytes: bs58.encode(Buffer.from([LEAGUE_STATUS_OPEN])),
    },
  };

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const openLeagues = await program.account.league.all([filter]);
    const end = performance.now();
    filterTime += (end - start);
    console.log(`Filter iteration ${i + 1}: ${(end - start).toFixed(2)}ms, found ${openLeagues.length} leagues`);
  }
  const avgFilterTime = filterTime / iterations;

  console.log(`\nAverage time without filter: ${avgNoFilterTime.toFixed(2)}ms`);
  console.log(`Average time with memcmp filter: ${avgFilterTime.toFixed(2)}ms`);
  console.log(`Improvement: ${(((avgNoFilterTime - avgFilterTime) / avgNoFilterTime) * 100).toFixed(2)}%`);
}

runBenchmark().catch(console.error);
