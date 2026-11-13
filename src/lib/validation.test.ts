import { describe, expect, it } from "vitest";
import { addressSchema, chainLabel, detectAddressKind, extractAddress, normalizeAddress } from "./validation";

const PUMP = "ErZcPNM8Zh2cY6qdvtEagBSg79SLixNdsMewg6mmpump";
const EVM = "0x6982508145454Ce325dDbE47a25d4ec3d2311933";

describe("address input", () => {
  it("accepts raw CAs on any chain format", () => {
    expect(detectAddressKind(PUMP)).toBe("solana");
    expect(detectAddressKind(EVM)).toBe("evm");
    expect(detectAddressKind("TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj")).toBe("solana"); // Tron (base58) is accepted too
    expect(detectAddressKind("534F4C4F00000000000000000000000000000000.rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz")).toBe("other"); // XRPL
    expect(detectAddressKind("hello")).toBeNull();
  });

  it("extracts the address from pasted links", () => {
    expect(extractAddress(`https://dexscreener.com/solana/${PUMP}`)).toBe(PUMP);
    expect(extractAddress(`https://pump.fun/coin/${PUMP}`)).toBe(PUMP);
    expect(extractAddress(`https://birdeye.so/token/${PUMP}?chain=solana`)).toBe(PUMP);
    expect(extractAddress(`https://gmgn.ai/sol/token/abc_${PUMP}`)).toBe(`abc_${PUMP}`);
    expect(extractAddress(`https://jup.ag/swap?outputMint=${PUMP}`)).toBe(PUMP);
    expect(extractAddress(`etherscan.io/token/${EVM}`)).toBe(EVM);
    expect(extractAddress(`  ${PUMP}  `)).toBe(PUMP);
  });

  it("validates through the schema (links included)", () => {
    expect(addressSchema.parse(`https://dexscreener.com/solana/${PUMP}`)).toBe(PUMP);
    expect(addressSchema.safeParse("not an address").success).toBe(false);
  });

  it("lowercases 0x addresses on any EVM chain, keeps others as-is", () => {
    expect(normalizeAddress("robinhood", EVM)).toBe(EVM.toLowerCase());
    expect(normalizeAddress("solana", PUMP)).toBe(PUMP);
  });

  it("labels unknown chains nicely", () => {
    expect(chainLabel("bsc")).toBe("BNB Chain");
    expect(chainLabel("some-new-chain")).toBe("Some New Chain");
  });
});
