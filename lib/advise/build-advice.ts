import { CALC_CONFIG, CROPS } from "../calc/config"
import { sellLocal, sellFarAlone, sellFarPooled, storeLoan } from "../calc/options"
import type {
  SellLocalOutput,
  SellFarAloneOutput,
  SellFarPooledOutput,
  StoreLoanOutput,
} from "../calc/options"
import { rankOptions, debtNote, type RankedOutput, type DebtNote } from "../calc/rank"
import { kolkataISOWeek, kolkataSaleWeek } from "../calc/time"
import type { MandiPriceRow, ForecastRow, OpenRequest } from "../data/advise"

/**
 * Pure advice assembly. All data is passed in (no I/O). Route handler
 * authorizes + loads data, calls this, then persists + responds.
 * CALC_SPEC §4–5. `today` is passed in (no Date.now()).
 */

export interface AdviceInputs {
  crop: string
  qtl: number
  debt: number
  localMandi: MandiPriceRow
  farCandidates: MandiPriceRow[]
  forecast: ForecastRow | null
  openRequests: OpenRequest[]
  today: Date
}

export interface AdviceResult {
  ranked: RankedOutput
  debtNote: DebtNote | null
  localMandi: MandiPriceRow
  farMandi: MandiPriceRow | undefined
  poolQty: number
  poolBasis: "observed" | "assumed"
  saleWeek: string
  isoWeek: number
}

export function buildAdvice(inputs: AdviceInputs): AdviceResult {
  const { crop, qtl, debt, localMandi, farCandidates, forecast, openRequests, today } = inputs
  const cropInfo = CROPS[crop]
  const commissionLocal = localMandi.commission_pct ?? CALC_CONFIG.COMMISSION_PCT

  // sale week = Monday of target week in Asia/Kolkata
  const saleWeek = kolkataSaleWeek(today)
  const isoWeek = kolkataISOWeek(today)

  // poolQty: this request's qtl + sum of other open requests, capped at truck capacity
  const otherPoolQty = openRequests.reduce((sum, r) => sum + r.quantity_qtl, 0)
  const poolQtyRaw = qtl + otherPoolQty
  const poolQty = Math.min(poolQtyRaw, CALC_CONFIG.TRUCK_CAPACITY_QTL)
  const poolMinFill = CALC_CONFIG.TRUCK_CAPACITY_QTL * CALC_CONFIG.POOL_MIN_FILL
  const poolBasis: "observed" | "assumed" = poolQtyRaw >= poolMinFill ? "observed" : "assumed"
  const assumedPoolQty = poolQtyRaw < poolMinFill ? poolMinFill : poolQty

  // sell_local
  const local: SellLocalOutput = {
    ...sellLocal({
      qtl,
      mandi: localMandi.mandi_name,
      priceRsPerQtl: localMandi.modal_price,
      priceAgeDays: localMandi.price_age_days,
      commissionPct: commissionLocal,
    }),
    priceDate: localMandi.price_date,
  }

  // sell_far_alone + sell_far_pooled: pick far mandi with highest pooled net
  let farMandi: MandiPriceRow | undefined
  let farAlone: SellFarAloneOutput | undefined
  let farPooled: SellFarPooledOutput | undefined

  for (const far of farCandidates) {
    const commissionFar = far.commission_pct ?? CALC_CONFIG.COMMISSION_PCT
    const alone: SellFarAloneOutput = {
      ...sellFarAlone({
        qtl,
        mandi: far.mandi_name,
        priceRsPerQtl: far.modal_price,
        priceAgeDays: far.price_age_days,
        distanceKm: far.distance_km,
        transitLossPct: cropInfo.transitLossPct,
        commissionPct: commissionFar,
      }),
      priceDate: far.price_date,
    }
    const pooled: SellFarPooledOutput = {
      ...sellFarPooled({
        qtl,
        mandi: far.mandi_name,
        priceRsPerQtl: far.modal_price,
        priceAgeDays: far.price_age_days,
        distanceKm: far.distance_km,
        transitLossPct: cropInfo.transitLossPct,
        poolQty: assumedPoolQty,
        poolBasis,
        commissionPct: commissionFar,
      }),
      priceDate: far.price_date,
    }

    if (!farMandi || pooled.netRs > (farPooled?.netRs ?? -Infinity)) {
      farMandi = far
      farAlone = alone
      farPooled = pooled
    }
  }

  // sell_far_alone spoken=false if worse than sell_local
  if (farAlone && farAlone.netRs < local.netRs) {
    farAlone.spoken = false
  }

  // store_loan (storable crops only, requires forecast)
  let storeLoanOpt: StoreLoanOutput | undefined
  if (cropInfo.storable && forecast) {
    storeLoanOpt = storeLoan({
      qtl,
      priceRsPerQtl: localMandi.modal_price,
      priceAgeDays: localMandi.price_age_days,
      r10: forecast.r10,
      r50: forecast.r50,
      r90: forecast.r90,
      yearsOfData: forecast.years_of_data,
      commissionPct: commissionLocal,
      storageLossPctPerMonth: cropInfo.storageLossPctPerMonth,
    })
  }

  const ranked = rankOptions({
    local,
    farAlone,
    farPooled,
    storeLoan: storeLoanOpt,
  })

  const note =
    debt > 0
      ? debtNote({
          debt,
          qtl,
          bestNetRs: ranked.spoken[0]?.netRs ?? local.netRs,
          bestOptionId: ranked.spoken[0]?.id ?? "sell_local",
          sellLocalNetRs: local.netRs,
          loanRs: storeLoanOpt?.loanRs,
        })
      : null

  return {
    ranked,
    debtNote: note,
    localMandi,
    farMandi,
    poolQty,
    poolBasis,
    saleWeek,
    isoWeek,
  }
}

// ---------------------------------------------------------------------------
// Output mapping (no `as any`)
// ---------------------------------------------------------------------------

export interface ApiOption {
  id: string
  label: string
  mandi: string | undefined
  distance_km: number | undefined
  net_rupees: number
  say_amount: number
  confidence: string
  price_date: string
  price_age_days: number
  pool_basis: string | undefined
  spoken: boolean
  net_range?: { p10: number; p50: number; p90: number }
  loan_rupees?: number
  loan_eligible_alone?: boolean
  requires_pool?: boolean
}

export function toApiOption(o: SellLocalOutput | SellFarAloneOutput | SellFarPooledOutput | StoreLoanOutput, localMandi: MandiPriceRow): ApiOption {
  const base: ApiOption = {
    id: o.id,
    label: o.label,
    mandi: o.id === "store_loan" ? undefined : (o as SellFarAloneOutput).mandi,
    distance_km: o.id === "store_loan" ? undefined : (o as SellFarAloneOutput).distanceKm,
    net_rupees: o.netRs,
    say_amount: o.sayAmountRs,
    confidence: o.confidence,
    price_date:
      o.id === "store_loan"
        ? localMandi.price_date
        : ((o as SellFarAloneOutput).priceDate || localMandi.price_date),
    price_age_days: (o as SellFarAloneOutput).priceAgeDays ?? localMandi.price_age_days,
    pool_basis: o.id === "sell_far_pooled" ? (o as SellFarPooledOutput).poolBasis : undefined,
    spoken: o.spoken,
  }

  if (o.id === "store_loan") {
    const s = o as StoreLoanOutput
    base.net_range = s.netRange
    base.loan_rupees = s.loanRs
    base.loan_eligible_alone = s.loanEligibleAlone
    base.requires_pool = s.requiresPool
  }

  return base
}
