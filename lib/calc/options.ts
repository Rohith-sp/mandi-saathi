// Pure option calculations per CALC_SPEC.md §4.
// No I/O, no Supabase, no fetch, no Date.now(). All data is passed in.
// Money is computed in floating point; only the final net is Math.rounded.

import { CALC_CONFIG, CROPS } from "./config"
import type { Confidence } from "./confidence"
import { saleConfidence, storeLoanConfidence, capPooledConfidence } from "./confidence"

export type OptionId =
  | "sell_local"
  | "sell_far_alone"
  | "sell_far_pooled"
  | "store_loan"

/** Number of local trips needed for a quantity (ceil). */
export function trips(qtl: number): number {
  return Math.ceil(qtl / CALC_CONFIG.LOCAL_TRIP_CAPACITY_QTL)
}

/** Truck cost for a one-way distance km (return trip included in rate). */
export function truckCost(distanceKm: number): number {
  return CALC_CONFIG.TRUCK_BASE_COST + CALC_CONFIG.TRUCK_COST_PER_KM * distanceKm
}

/** Round a money value to whole rupees. Only the final net is rounded. */
export function roundRs(x: number): number {
  return Math.round(x)
}

/** Round a net to the nearest ₹100 for speaking. */
export function sayAmount(netRs: number): number {
  return Math.round(netRs / 100) * 100
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface MandiPriceInput {
  mandi: string
  priceRsPerQtl: number
  priceAgeDays: number
  commissionPct?: number // override config default
}

export interface SellLocalInput extends MandiPriceInput {
  qtl: number
}

export interface SellFarInput extends MandiPriceInput {
  qtl: number
  distanceKm: number
  transitLossPct: number
}

export interface StoreLoanInput {
  qtl: number
  priceRsPerQtl: number
  priceAgeDays: number
  r10: number
  r50: number
  r90: number
  yearsOfData: number
  commissionPct?: number
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface BaseOption {
  id: OptionId
  label: string
  netRs: number // whole rupees
  sayAmountRs: number // nearest ₹100
  confidence: Confidence
  spoken: boolean
}

export interface SellLocalOutput extends BaseOption {
  id: "sell_local"
  mandi: string
  distanceKm: number
  priceDate: string
  priceAgeDays: number
  spoken: true // always spoken (trader baseline)
}

export interface SellFarAloneOutput extends BaseOption {
  id: "sell_far_alone"
  mandi: string
  distanceKm: number
  priceDate: string
  priceAgeDays: number
  spoken: boolean
}

export interface SellFarPooledOutput extends BaseOption {
  id: "sell_far_pooled"
  mandi: string
  distanceKm: number
  priceDate: string
  priceAgeDays: number
  poolBasis: "observed" | "assumed"
  spoken: boolean
}

export interface StoreLoanOutput extends BaseOption {
  id: "store_loan"
  label: string
  netRange: { p10: number; p50: number; p90: number } // whole rupees each
  sayAmountRs: number // from p50
  loanRs: number // whole rupees, paid out today
  loanEligibleAlone: boolean
  poolQtyForLoan: number // quintals a pooled deposit needs
  requiresPool: boolean // true when not eligible alone
  priceAgeDays: number
  spoken: boolean
}

// ---------------------------------------------------------------------------
// sell_local
// ---------------------------------------------------------------------------
// gross = q * P_local
// net   = gross - COMMISSION_PCT * gross - LOCAL_TRIP_COST * trips(q)

export function sellLocal(input: SellLocalInput): SellLocalOutput {
  const {
    qtl,
    mandi,
    priceRsPerQtl,
    priceAgeDays,
    commissionPct = CALC_CONFIG.COMMISSION_PCT,
  } = input

  const gross = qtl * priceRsPerQtl // no transit loss locally
  const commission = commissionPct * gross
  const tripCost = CALC_CONFIG.LOCAL_TRIP_COST * trips(qtl)
  const net = roundRs(gross - commission - tripCost)

  return {
    id: "sell_local",
    label: `Sell at ${mandi}`,
    mandi,
    distanceKm: 0,
    priceDate: "", // filled by caller
    priceAgeDays,
    netRs: net,
    sayAmountRs: sayAmount(net),
    confidence: saleConfidence(priceAgeDays),
    spoken: true,
  }
}

// ---------------------------------------------------------------------------
// sell_far_alone
// ---------------------------------------------------------------------------
// gross = q * P_far * (1 - transit_loss_pct)
// net   = gross - COMMISSION_PCT * gross - truck(d)

export function sellFarAlone(input: SellFarInput): SellFarAloneOutput {
  const {
    qtl,
    mandi,
    priceRsPerQtl,
    priceAgeDays,
    distanceKm,
    transitLossPct,
    commissionPct = CALC_CONFIG.COMMISSION_PCT,
  } = input

  const gross = qtl * priceRsPerQtl * (1 - transitLossPct)
  const commission = commissionPct * gross
  const truck = truckCost(distanceKm)
  const net = roundRs(gross - commission - truck)

  return {
    id: "sell_far_alone",
    label: `Sell at ${mandi} (alone)`,
    mandi,
    distanceKm,
    priceDate: "",
    priceAgeDays,
    netRs: net,
    sayAmountRs: sayAmount(net),
    confidence: saleConfidence(priceAgeDays),
    spoken: true, // may be set to false by ranker if worse than local
  }
}

// ---------------------------------------------------------------------------
// sell_far_pooled
// ---------------------------------------------------------------------------
// gross = q * P_far * (1 - transit_loss_pct)
// share = truck(d) * q / poolQty
// net   = gross - COMMISSION_PCT * gross - share

export interface SellFarPooledInput extends SellFarInput {
  poolQty: number
  poolBasis: "observed" | "assumed"
}

export function sellFarPooled(input: SellFarPooledInput): SellFarPooledOutput {
  const {
    qtl,
    mandi,
    priceRsPerQtl,
    priceAgeDays,
    distanceKm,
    transitLossPct,
    poolQty,
    poolBasis,
    commissionPct = CALC_CONFIG.COMMISSION_PCT,
  } = input

  const gross = qtl * priceRsPerQtl * (1 - transitLossPct)
  const commission = commissionPct * gross
  const share = (truckCost(distanceKm) * qtl) / poolQty
  const net = roundRs(gross - commission - share)

  let confidence = saleConfidence(priceAgeDays)
  confidence = capPooledConfidence(confidence, poolBasis)

  return {
    id: "sell_far_pooled",
    label: `Shared truck to ${mandi}`,
    mandi,
    distanceKm,
    priceDate: "",
    priceAgeDays,
    netRs: net,
    sayAmountRs: sayAmount(net),
    confidence,
    poolBasis,
    spoken: true,
  }
}

// ---------------------------------------------------------------------------
// store_loan (storable crops only)
// ---------------------------------------------------------------------------
// V        = q * P_local
// loan     = LOAN_LTV * V
// interest = loan * LOAN_RATE_PA * STORE_MONTHS / 12
// for r in (r10, r50, r90):
//   g   = V * (1 + r) * (1 - storage_loss_pct_per_month * STORE_MONTHS)
//   g  -= COMMISSION_PCT * g
//   net = g - WAREHOUSE_COST_PER_QTL_MONTH * q * STORE_MONTHS - interest - 2 * LOCAL_TRIP_COST * trips(q)

export function storeLoan(input: StoreLoanInput): StoreLoanOutput {
  const {
    qtl,
    priceRsPerQtl,
    priceAgeDays,
    r10,
    r50,
    r90,
    yearsOfData,
    commissionPct = CALC_CONFIG.COMMISSION_PCT,
  } = input

  const crop = CROPS["ragi"] // default storage loss; caller should pass crop-specific
  const storageLossPctPerMonth = 0.005 // ragi/tur default

  const V = qtl * priceRsPerQtl
  const loan = CALC_CONFIG.LOAN_LTV * V
  const interest = (loan * CALC_CONFIG.LOAN_RATE_PA * CALC_CONFIG.STORE_MONTHS) / 12
  const storageLoss = storageLossPctPerMonth * CALC_CONFIG.STORE_MONTHS
  const warehouseCost = CALC_CONFIG.WAREHOUSE_COST_PER_QTL_MONTH * qtl * CALC_CONFIG.STORE_MONTHS
  const tripCost = 2 * CALC_CONFIG.LOCAL_TRIP_COST * trips(qtl)

  const netFor = (r: number): number => {
    let g = V * (1 + r) * (1 - storageLoss)
    g -= commissionPct * g
    return roundRs(g - warehouseCost - interest - tripCost)
  }

  const net10 = netFor(r10)
  const net50 = netFor(r50)
  const net90 = netFor(r90)

  const band = (net90 - net10) / net50
  const confidence = storeLoanConfidence({ band, priceAgeDays, yearsOfData })

  const loanEligibleAlone = loan >= CALC_CONFIG.LOAN_MIN
  const poolQtyForLoan = Math.ceil(
    CALC_CONFIG.LOAN_MIN / CALC_CONFIG.LOAN_LTV / priceRsPerQtl
  )

  return {
    id: "store_loan",
    label: "Store in FPO warehouse, take loan, sell in about a month",
    netRs: net50, // ranking uses P50
    sayAmountRs: sayAmount(net50),
    confidence,
    netRange: { p10: net10, p50: net50, p90: net90 },
    loanRs: roundRs(loan),
    loanEligibleAlone,
    poolQtyForLoan,
    requiresPool: !loanEligibleAlone,
    priceAgeDays,
    spoken: true,
  }
}
