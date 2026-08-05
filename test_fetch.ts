import { Program, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import idl from "./src/lib/idl/league_escrow.json";
import bs58 from "bs58";

const connection = new Connection("https://api.devnet.solana.com");
// Mock provider
const provider = { connection, publicKey: Keypair.generate().publicKey };
const programId = new PublicKey(idl.metadata.address);
// @ts-ignore
const program = new Program(idl as any, programId, provider);

console.log(bs58.encode(Buffer.from([0])));
console.log(bs58.encode(Buffer.from([1])));
console.log(bs58.encode(Buffer.from([2])));
