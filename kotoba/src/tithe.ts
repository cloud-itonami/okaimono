/**
 * okaimono kotoba — tithe math.
 *
 * The 10% tithe to the Public Fund is an immutable constitutional constant
 * (ADR-2605192100 §2 / ADR-2605192130). On-chain this is enforced atomically by
 * TitheRouter.sol; these pure helpers compute the same split client-side so the
 * okaimono payment record matches what the contract will execute.
 *
 * All amounts are USDC base units (micros, 6 decimals) as bigint. Integer
 * division floors the tithe; the remainder accrues to the net (store) side, so
 * tithe + net === gross exactly with no rounding leak.
 */

/** Constitutional tithe rate, as a permille (100 / 1000 = 10%). */
export const TITHE_PERMILLE = 100n;

export interface TitheSplit {
  gross: bigint;
  tithe: bigint;
  net: bigint;
}

/**
 * Split a gross USDC amount (micros) into tithe (10%, floored) and net.
 * Invariant: tithe + net === gross.
 */
export function splitTithe(grossMicros: bigint): TitheSplit {
  if (grossMicros < 0n) {
    throw new RangeError("[okaimono/tithe] gross amount must be non-negative");
  }
  const tithe = (grossMicros * TITHE_PERMILLE) / 1000n;
  const net = grossMicros - tithe;
  return { gross: grossMicros, tithe, net };
}

/** Parse a decimal-string micros amount to bigint, rejecting non-integers. */
export function parseMicros(s: string): bigint {
  if (!/^\d+$/.test(s)) {
    throw new TypeError(
      `[okaimono/tithe] micros must be a non-negative integer string, got "${s}"`
    );
  }
  return BigInt(s);
}
