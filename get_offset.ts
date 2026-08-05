import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes/index.js";
console.log("bs58 module", bs58.encode(Buffer.from([0])));
