/**
 * okaimono kotoba — real on-chain settlement adapter.
 *
 * Wraps `@etzhayyim/sdk` `donate()` into the okaimono `SettlementExecutor` seam
 * used by `settleOrder`. This is the production wiring; tests inject a fake
 * executor instead. The okaimono purpose enum (`internal-purchase` /
 * `escrow-refund`) is a subset of the SDK `DonatePurpose`, and `donate()` routes
 * the USDC transfer through TitheRouter (10% Public-Fund auto-split).
 *
 * Per ADR-2605172100, this is the only place value transfer is initiated, and it
 * goes through the SDK — never a direct viem/USDC call from okaimono code.
 */

import { donate, type DonateConfig } from "@etzhayyim/sdk";
import type { SettlementExecutor } from "./types.js";

/**
 * Build a SettlementExecutor backed by the SDK donate() path.
 *
 * @param cfg DonateConfig — { rpcUrl?, privateKey? (v0.1 EOA) | sponsored?
 *            (v0.2 ERC-4337 SmartAccount), tokenContract? }.
 */
export function donateSettlementExecutor(cfg: DonateConfig): SettlementExecutor {
  return async (opts) => {
    const result = await donate(
      {
        to: opts.to as `0x${string}`,
        amountUsdc: opts.amountMicros,
        purpose: opts.purpose,
        memo: opts.memo,
        forUri: opts.forUri,
      },
      cfg
    );
    return { txHash: result.txHash };
  };
}
