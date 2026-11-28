// Confidence labels per CALC_SPEC.md §6.
// Pure: same inputs always produce the same label.

import { CALC_CONFIG } from "./config"

export type Confidence = "high" | "medium" | "low"

/**
 * Confidence for same-day sale options (sell_local, sell_far_alone,
 * sell_far_pooled). Based on price age only.
 *
 * high: price age <= 2 days
 * medium: 3-5 days
 * low: 6-7 days (or older)
 */
export function saleConfidence(priceAgeDays: number): Confidence {
  if (priceAgeDays <= CALC_CONFIG.PRICE_OLD_DAYS) return "high"
  if (priceAgeDays <= 5) return "medium"
  return "low"
}

/**
 * Confidence for the store_loan option.
 *
 * high: band (net90 - net10) / net50 <= 0.10 AND price age <= 2 AND years >= 3
 * medium: band <= 0.20 AND years >= 3 (and not high)
 * low: otherwise, or forecast built from < 3 years of data
 */
export function storeLoanConfidence(inputs: {
  band: number
  priceAgeDays: number
  yearsOfData: number
}): Confidence {
  const { band, priceAgeDays, yearsOfData } = inputs
  if (yearsOfData < 3) return "low"
  if (priceAgeDays > CALC_CONFIG.PRICE_OLD_DAYS) return "low"
  if (band <= 0.10) return "high"
  if (band <= 0.20) return "medium"
  return "low"
}

/**
 * Cap confidence for sell_far_pooled when the pool size is assumed rather
 * than observed from actual nearby requests.
 */
export function capPooledConfidence(
  confidence: Confidence,
  poolBasis: "observed" | "assumed"
): Confidence {
  if (poolBasis !== "assumed") return confidence
  if (confidence === "high") return "medium"
  return confidence
}
