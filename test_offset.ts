import { Program, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "./src/lib/idl/league_escrow.json";

console.log("Discriminator length:", 8);
console.log("admin:", 32);
console.log("oracle:", 32);
console.log("league_id:", 8);
console.log("entry_fee:", 8);
console.log("max_players:", 2);
console.log("player_count:", 2);
console.log("Total offset:", 8 + 32 + 32 + 8 + 8 + 2 + 2);
