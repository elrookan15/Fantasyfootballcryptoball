(async () => {
  const bs58 = await import('bs58');
  console.log("0 is:", bs58.default.encode(new Uint8Array([0])));
})();
