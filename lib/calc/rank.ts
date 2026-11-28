// Ranking and output assembly per CALC_SPEC.md §5.
// Pure: same inputs always produce the same output.

import {
  roundRs,
  type SellLocalOutput,
  type SellFarAloneOutput,
  type SellFarPooledOutput,
  type StoreLoanOutput,
} from "./options"
import type { OptionId } from "./options"

export interface DebtNote {
  gapPerQtls: number // whole rupees per quintal
  bestOptionId: OptionId
  loanCoversDebt?: boolean
}

export interface RankedOutput {
  /** All computed options, unsorted as returned by the calculators. */
  all: (SellLocalOutput | SellFarAloneOutput | SellFarPooledOutput | StoreLoanOutput)[]
  /** Spoken options, best first, at most 3. sell_local always included. */
  spoken: (SellLocalOutput | SellFarAloneOutput | SellFarPooledOutput | StoreLoanOutput)[]
  /** True if a pooled option is in the spoken list. */
  poolAvailable: boolean
  /** Debt note when debt > 0 and the best option beats selling locally. */
  debtNote: DebtNote | null
}

/**
 * Rank options and assemble the spoken list.
 *
 * 1. Sort by net (P50 for store_loan) descending.
 * 2. Spoken list: top 3 where spoken: true.
 * 3. sell_local is always included (trader baseline) even if ranked 4th.
 * 4. sell_far_alone is spoken=false if worse than sell_local.
 */
export function rankOptions(inputs: {
  local: SellLocalOutput
  farAlone?: SellFarAloneOutput
  farPooled?: SellFarPooledOutput
  storeLoan?: StoreLoanOutput
}): RankedOutput {
  const { local, farAlone, farPooled, storeLoan } = inputs

  const all: (SellLocalOutput | SellFarAloneOutput | SellFarPooledOutput | StoreLoanOutput)[] =
    [local]
  if (farAlone) all.push(farAlone)
  if (farPooled) all.push(farPooled)
  if (storeLoan) all.push(storeLoan)

  // sell_far_alone: omit from spoken if worse than sell_local
  if (farAlone && farAlone.netRs < local.netRs) {
    farAlone.spoken = false
  }

  const sorted = [...all].sort((a, b) => b.netRs - a.netRs)

  const spokenCandidates = sorted.filter((o) => o.spoken)
  let spoken = spokenCandidates.slice(0, 3)

  // sell_local is always included, even if ranked 4th
  if (!spoken.some((o) => o.id === "sell_local")) {
    if (spoken.length === 3) spoken.pop()
    spoken.push(local)
  }

  // CALC_SPEC §5: pool_available = sell_far_pooled OR pooled store_loan.
  // A store_loan that doesn't require pooling (requiresPool=false) isn't pooled.
  const poolAvailable = spoken.some(
    (o) =>
      o.id === "sell_far_pooled" ||
      (o.id === "store_loan" && (o as StoreLoanOutput).requiresPool)
  )

  return { all, spoken, poolAvailable, debtNote: null }
}

/**
 * Build the debt note when debt > 0.
 *
 * gap_per_qtl = round((best_net - sell_local_net) / q)
 * If gap <= 0, return null.
 * For store_loan also return loan_covers_debt = loan >= debt (only meaningful when pooled).
 */
export function debtNote(inputs: {
  debt: number
  qtl: number
  bestNetRs: number
  bestOptionId: OptionId
  sellLocalNetRs: number
  loanRs?: number
}): DebtNote | null {
  const { debt, qtl, bestNetRs, bestOptionId, sellLocalNetRs, loanRs } = inputs
  if (!debt || debt <= 0) return null

  const gapPerQtls = roundRs((bestNetRs - sellLocalNetRs) / qtl)
  if (gapPerQtls <= 0) return null

  const note: DebtNote = { gapPerQtls, bestOptionId }
  if (loanRs !== undefined) {
    note.loanCoversDebt = loanRs >= debt
  }
  return note
}
