import { Connection, PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import idl from "./src/lib/idl/league_escrow.json";
import * as anchor from "@coral-xyz/anchor";
import bs58 from "bs58"; // Might fail, let's use base58 from anchor or web3.js if needed

async function main() {
    const connection = new Connection("https://api.devnet.solana.com");
    const wallet = new anchor.Wallet(anchor.web3.Keypair.generate());
    const provider = new AnchorProvider(connection, wallet, {});
    const programId = new PublicKey(idl.metadata.address);
    // @ts-ignore
    const program = new Program(idl, programId, provider);

    const all = await program.account.league.all();
    console.log("Total leagues:", all.length);
    if (all.length > 0) {
        console.log("First league status:", all[0].account.status);
    }
}
main().catch(console.error);
