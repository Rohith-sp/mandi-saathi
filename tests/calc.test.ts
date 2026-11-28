import { describe, it, expect } from "vitest"
import { CALC_CONFIG, SUPPORTED_CROPS, CROPS } from "../lib/calc/config"
import {
  sellLocal,
  sellFarAlone,
  sellFarPooled,
  storeLoan,
  roundRs,
  sayAmount,
  trips,
  truckCost,
} from "../lib/calc/options"
import {
  saleConfidence,
  storeLoanConfidence,
  capPooledConfidence,
} from "../lib/calc/confidence"
import { rankOptions, debtNote } from "../lib/calc/rank"

describe("calc config", () => {
  it("exposes the documented default constants", () => {
    expect(CALC_CONFIG.COMMISSION_PCT).toBe(0.02)
    expect(CALC_CONFIG.LOCAL_TRIP_COST).toBe(500)
    expect(CALC_CONFIG.TRUCK_BASE_COST).toBe(1000)
    expect(CALC_CONFIG.TRUCK_CAPACITY_QTL).toBe(50)
    expect(CALC_CONFIG.POOL_MIN_FILL).toBe(0.6)
    expect(CALC_CONFIG.LOAN_MIN).toBe(100000)
  })

  it("lists the supported crops", () => {
    expect(SUPPORTED_CROPS).toContain("ragi")
    expect(SUPPORTED_CROPS).toContain("tur")
    expect(SUPPORTED_CROPS).toContain("tomato")
    expect(CROPS.ragi.storable).toBe(true)
    expect(CROPS.tomato.storable).toBe(false)
  })
})

describe("helpers", () => {
  it("trips ceilings quantity to local-trip capacity", () => {
    expect(trips(15)).toBe(1)
    expect(trips(20)).toBe(1)
    expect(trips(21)).toBe(2)
    expect(trips(50)).toBe(3)
  })

  it("truckCost is base + per-km", () => {
    expect(truckCost(55)).toBe(1000 + 30 * 55) // 2650
    expect(truckCost(40)).toBe(1000 + 30 * 40) // 2200
  })

  it("roundRs rounds to whole rupees", () => {
    expect(roundRs(28900.4)).toBe(28900)
    expect(roundRs(28900.5)).toBe(28901)
  })

  it("sayAmount rounds to nearest ₹100", () => {
    expect(sayAmount(28900)).toBe(28900)
    expect(sayAmount(31160)).toBe(31200)
    expect(sayAmount(33015)).toBe(33000)
  })
})

describe("Case A — ragi, 15 qtl (golden)", () => {
  // P_local = 2000, P_far = 2300, d = 55 km, poolQty = 50,
  // forecast r = (-0.03, +0.06, +0.12), prices 1 day old.
  const qtl = 15
  const priceLocal = 2000
  const priceFar = 2300
  const distanceKm = 55
  const poolQty = 50
  const priceAgeDays = 1

  const local = sellLocal({
    qtl,
    mandi: "Kolar",
    priceRsPerQtl: priceLocal,
    priceAgeDays,
  })

  const farAlone = sellFarAlone({
    qtl,
    mandi: "Chintamani",
    priceRsPerQtl: priceFar,
    priceAgeDays,
    distanceKm,
    transitLossPct: CROPS.ragi.transitLossPct,
  })

  const farPooled = sellFarPooled({
    qtl,
    mandi: "Chintamani",
    priceRsPerQtl: priceFar,
    priceAgeDays,
    distanceKm,
    transitLossPct: CROPS.ragi.transitLossPct,
    poolQty,
    poolBasis: "observed",
  })

  const store = storeLoan({
    qtl,
    priceRsPerQtl: priceLocal,
    priceAgeDays,
    r10: -0.03,
    r50: 0.06,
    r90: 0.12,
    yearsOfData: 3,
  })

  it("sell_local net = 28,900, say = 28,900, high", () => {
    expect(local.netRs).toBe(28900)
    expect(local.sayAmountRs).toBe(28900)
    expect(local.confidence).toBe("high")
    expect(local.spoken).toBe(true)
  })

  it("sell_far_alone net = 31,160, say = 31,200, high", () => {
    expect(farAlone.netRs).toBe(31160)
    expect(farAlone.sayAmountRs).toBe(31200)
    expect(farAlone.confidence).toBe("high")
  })

  it("sell_far_pooled net = 33,015, say = 33,000, high, observed", () => {
    expect(farPooled.netRs).toBe(33015)
    expect(farPooled.sayAmountRs).toBe(33000)
    expect(farPooled.confidence).toBe("high")
    expect(farPooled.poolBasis).toBe("observed")
  })

  it("store_loan P10/P50/P90 = 27,094 / 29,727 / 31,482, medium (band 0.148)", () => {
    expect(store.netRange.p10).toBe(27094)
    expect(store.netRange.p50).toBe(29727)
    expect(store.netRange.p90).toBe(31482)
    expect(store.sayAmountRs).toBe(29700)
    expect(store.confidence).toBe("medium")
    expect(store.loanRs).toBe(22500)
    expect(store.loanEligibleAlone).toBe(false)
    expect(store.poolQtyForLoan).toBe(67)
    expect(store.requiresPool).toBe(true)
  })

  it("ranking: pooled > alone > store P50 > local; spoken = pooled, alone, local", () => {
    const ranked = rankOptions({ local, farAlone, farPooled, storeLoan: store })
    const nets = ranked.spoken.map((o) => o.netRs)
    expect(nets).toEqual([33015, 31160, 28900])
    expect(ranked.spoken.map((o) => o.id)).toEqual([
      "sell_far_pooled",
      "sell_far_alone",
      "sell_local",
    ])
    expect(ranked.poolAvailable).toBe(true)
  })

  it("debt note with debt=20000: gap_per_qtl = 274", () => {
    const note = debtNote({
      debt: 20000,
      qtl,
      bestNetRs: 33015,
      bestOptionId: "sell_far_pooled",
      sellLocalNetRs: 28900,
      loanRs: 22500,
    })
    expect(note).not.toBeNull()
    expect(note!.gapPerQtls).toBe(274)
    expect(note!.bestOptionId).toBe("sell_far_pooled")
    expect(note!.loanCoversDebt).toBe(true)
  })
})

describe("Case B — tomato, 20 qtl (golden)", () => {
  // P_local = 1200, P_far = 1500, d = 40 km, poolQty = 50, transit loss 3%.
  const qtl = 20
  const priceLocal = 1200
  const priceFar = 1500
  const distanceKm = 40

  const local = sellLocal({
    qtl,
    mandi: "Kolar",
    priceRsPerQtl: priceLocal,
    priceAgeDays: 1,
  })

  const farAlone = sellFarAlone({
    qtl,
    mandi: "Chintamani",
    priceRsPerQtl: priceFar,
    priceAgeDays: 1,
    distanceKm,
    transitLossPct: CROPS.tomato.transitLossPct,
  })

  const farPooled = sellFarPooled({
    qtl,
    mandi: "Chintamani",
    priceRsPerQtl: priceFar,
    priceAgeDays: 1,
    distanceKm,
    transitLossPct: CROPS.tomato.transitLossPct,
    poolQty: 50,
    poolBasis: "observed",
  })

  it("sell_local net = 23,020", () => {
    expect(local.netRs).toBe(23020)
  })

  it("sell_far_alone net = 26,318", () => {
    expect(farAlone.netRs).toBe(26318)
  })

  it("sell_far_pooled net = 27,638", () => {
    expect(farPooled.netRs).toBe(27638)
  })

  it("store_loan is not returned for non-storable tomato", () => {
    // storeLoan is only called for storable crops; this test documents intent
    expect(CROPS.tomato.storable).toBe(false)
  })
})

describe("confidence", () => {
  it("sale confidence: <=2 high, 3-5 medium, >=6 low", () => {
    expect(saleConfidence(1)).toBe("high")
    expect(saleConfidence(2)).toBe("high")
    expect(saleConfidence(3)).toBe("medium")
    expect(saleConfidence(5)).toBe("medium")
    expect(saleConfidence(6)).toBe("low")
    expect(saleConfidence(7)).toBe("low")
  })

  it("store loan confidence: band <= 0.10 high, <= 0.20 medium, else low", () => {
    expect(
      storeLoanConfidence({ band: 0.05, priceAgeDays: 1, yearsOfData: 3 })
    ).toBe("high")
    expect(
      storeLoanConfidence({ band: 0.15, priceAgeDays: 1, yearsOfData: 3 })
    ).toBe("medium")
    expect(
      storeLoanConfidence({ band: 0.25, priceAgeDays: 1, yearsOfData: 3 })
    ).toBe("low")
    expect(
      storeLoanConfidence({ band: 0.05, priceAgeDays: 1, yearsOfData: 2 })
    ).toBe("low") // < 3 years of data
  })

  it("assumed pool caps confidence at medium", () => {
    expect(capPooledConfidence("high", "assumed")).toBe("medium")
    expect(capPooledConfidence("medium", "assumed")).toBe("medium")
    expect(capPooledConfidence("high", "observed")).toBe("high")
  })
})

describe("ranking edge cases", () => {
  it("sell_far_alone is not spoken when worse than sell_local", () => {
    const local = sellLocal({
      qtl: 10,
      mandi: "Kolar",
      priceRsPerQtl: 2000,
      priceAgeDays: 1,
    }) // net = 10*2000 - 0.02*20000 - 500 = 19400

    const farAlone = sellFarAlone({
      qtl: 10,
      mandi: "Far",
      priceRsPerQtl: 1500,
      priceAgeDays: 1,
      distanceKm: 80,
      transitLossPct: 0,
    }) // gross=15000, comm=300, truck=3400, net=11300 < local

    const ranked = rankOptions({ local, farAlone })
    expect(farAlone.spoken).toBe(false)
    expect(ranked.spoken.map((o) => o.id)).toContain("sell_local")
    expect(ranked.spoken.map((o) => o.id)).not.toContain("sell_far_alone")
  })

  it("sell_local is forced into spoken list even when ranked 4th", () => {
    const local = sellLocal({
      qtl: 15,
      mandi: "Kolar",
      priceRsPerQtl: 2000,
      priceAgeDays: 1,
    })
    const farAlone = sellFarAlone({
      qtl: 15,
      mandi: "A",
      priceRsPerQtl: 2300,
      priceAgeDays: 1,
      distanceKm: 10,
      transitLossPct: 0,
    })
    const farPooled = sellFarPooled({
      qtl: 15,
      mandi: "B",
      priceRsPerQtl: 2300,
      priceAgeDays: 1,
      distanceKm: 10,
      transitLossPct: 0,
      poolQty: 50,
      poolBasis: "observed",
    })
    const store = storeLoan({
      qtl: 15,
      priceRsPerQtl: 2000,
      priceAgeDays: 1,
      r10: 0.05,
      r50: 0.1,
      r90: 0.15,
      yearsOfData: 3,
    })

    const ranked = rankOptions({ local, farAlone, farPooled, storeLoan: store })
    const ids = ranked.spoken.map((o) => o.id)
    expect(ids).toContain("sell_local")
    expect(ranked.spoken.length).toBeLessThanOrEqual(3)
  })
})

describe("debt note edge cases", () => {
  it("returns null when debt is 0", () => {
    expect(
      debtNote({
        debt: 0,
        qtl: 15,
        bestNetRs: 33015,
        bestOptionId: "sell_far_pooled",
        sellLocalNetRs: 28900,
      })
    ).toBeNull()
  })

  it("returns null when gap <= 0", () => {
    expect(
      debtNote({
        debt: 5000,
        qtl: 15,
        bestNetRs: 28900,
        bestOptionId: "sell_local",
        sellLocalNetRs: 28900,
      })
    ).toBeNull()
  })
})
