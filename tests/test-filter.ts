import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LeagueEscrow } from "../target/types/league_escrow";
import { expect } from "chai";

describe("test-filter", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.LeagueEscrow as Program<LeagueEscrow>;

  it("filters correctly", async () => {
    const all = await program.account.league.all([
      {
        memcmp: {
          offset: 92,
          bytes: anchor.utils.bytes.bs58.encode(Buffer.from([0]))
        }
      }
    ]);
    console.log("Filtered length:", all.length);
  });
});
