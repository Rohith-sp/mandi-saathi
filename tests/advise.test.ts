import { describe, it, expect, vi, beforeEach } from "vitest"
import { kolkataSaleWeek } from "../lib/calc/time"
import { buildAdvice, toApiOption } from "../lib/advise/build-advice"

const mocks = vi.hoisted(() => ({
  resolveVillage: vi.fn(),
  loadMandiPrices: vi.fn(),
  loadOpenRequestsForPool: vi.fn(),
  loadForecast: vi.fn(),
  upsertFarmer: vi.fn(),
  saveSaleRequest: vi.fn(),
  sendSms: vi.fn(),
}))

vi.mock("../lib/supabase/server", () => ({
  createServiceClient: () => ({}),
}))

vi.mock("../lib/data/advise", () => ({
  resolveVillage: mocks.resolveVillage,
  loadMandiPrices: mocks.loadMandiPrices,
  loadOpenRequestsForPool: mocks.loadOpenRequestsForPool,
  loadForecast: mocks.loadForecast,
  upsertFarmer: mocks.upsertFarmer,
  saveSaleRequest: mocks.saveSaleRequest,
}))

vi.mock("../lib/sms/client", () => ({
  sendSms: mocks.sendSms,
}))

import { POST } from "../app/api/advise/route"

describe("kolkataSaleWeek", () => {
  it("returns Monday in Asia/Kolkata regardless of UTC day", () => {
    // 2026-11-28T20:00:00Z is 2026-11-29T01:30:00+05:30 (Sunday IST); Monday is 2026-11-23
    expect(kolkataSaleWeek(new Date("2026-11-28T20:00:00Z"))).toBe("2026-11-23")
    // 2026-11-23T00:30:00+05:30 is Monday IST
    expect(kolkataSaleWeek(new Date("2026-11-22T19:00:00Z"))).toBe("2026-11-23")
  })
})

describe("buildAdvice + toApiOption", () => {
  it("preserves far mandi price_date on sell_far_* options", () => {
    const localMandi = {
      mandi_id: "m1",
      mandi_name: "Kolar",
      district: "Kolar",
      crop_id: "ragi",
      price_date: "2026-11-27",
      modal_price: 2000,
      price_age_days: 1,
      commission_pct: null,
      distance_km: 12,
    }
    const farMandi = {
      mandi_id: "m2",
      mandi_name: "Chintamani",
      district: "Chikkaballapur",
      crop_id: "ragi",
      price_date: "2026-11-26",
      modal_price: 2300,
      price_age_days: 2,
      commission_pct: null,
      distance_km: 55,
    }

    const advice = buildAdvice({
      crop: "ragi",
      qtl: 15,
      debt: 20000,
      localMandi,
      farCandidates: [farMandi],
      forecast: { r10: -0.03, r50: 0.06, r90: 0.12, years_of_data: 3 },
      openRequests: [{ id: "r1", quantity_qtl: 35, location: null, sale_week: "2026-11-23" }],
      today: new Date("2026-11-28T10:00:00Z"),
    })

    const apiOptions = advice.ranked.spoken.map((o) => toApiOption(o, localMandi))
    const pooled = apiOptions.find((o) => o.id === "sell_far_pooled")
    const local = apiOptions.find((o) => o.id === "sell_local")

    expect(pooled?.price_date).toBe("2026-11-26")
    expect(pooled?.net_rupees).toBe(33015)
    expect(local?.price_date).toBe("2026-11-27")
    expect(local?.net_rupees).toBe(28900)
    expect(advice.debtNote?.gapPerQtls).toBe(274)
  })
})

describe("POST /api/advise", () => {
  const SECRET = "test-bolna-secret"

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BOLNA_TOOL_SECRET = SECRET
  })

  function makeReq(body: unknown, secret: string | null = SECRET): Request {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (secret !== null) headers["x-api-secret"] = secret
    return new Request("http://localhost/api/advise", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
  }

  it("returns 401 when secret is missing or wrong", async () => {
    const res = await POST(makeReq({ crop: "ragi", quantity_quintals: 15, village: "Mulbagal" }, "wrong"))
    expect(res.status).toBe(401)
  })

  it("returns 400 invalid_quantity when q = 0", async () => {
    const res = await POST(makeReq({ crop: "ragi", quantity_quintals: 0, village: "Mulbagal" }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe("invalid_quantity")
  })

  it("returns 200 unsupported_crop for unknown crop", async () => {
    const res = await POST(makeReq({ crop: "wheat", quantity_quintals: 15, village: "Mulbagal" }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe("unsupported_crop")
    expect(json.supported_crops).toContain("ragi")
  })

  it("returns 200 needs_clarification when village not found", async () => {
    mocks.resolveVillage.mockResolvedValue(null)
    const res = await POST(makeReq({ crop: "ragi", quantity_quintals: 15, village: "UnknownVillage" }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe("needs_clarification")
    expect(json.field).toBe("village")
  })

  it("returns 200 no_price when no fresh mandi prices exist", async () => {
    mocks.resolveVillage.mockResolvedValue({
      id: "v1",
      name: "Mulbagal",
      district: "Kolar",
      location: { lat: 13.16, lng: 78.39 },
      fpo_id: "fpo1",
    })
    mocks.loadMandiPrices.mockResolvedValue([])
    const res = await POST(makeReq({ crop: "ragi", quantity_quintals: 15, village: "Mulbagal" }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe("no_price")
  })

  it("returns 200 ok with golden Case A numbers and snake_case debt_note", async () => {
    mocks.resolveVillage.mockResolvedValue({
      id: "v1",
      name: "Mulbagal",
      district: "Kolar",
      location: { lat: 13.16, lng: 78.39 },
      fpo_id: "fpo1",
    })
    mocks.loadMandiPrices.mockResolvedValue([
      {
        mandi_id: "m1",
        mandi_name: "Kolar",
        district: "Kolar",
        crop_id: "ragi",
        price_date: "2026-11-27",
        modal_price: 2000,
        price_age_days: 1,
        commission_pct: null,
        distance_km: 12,
      },
      {
        mandi_id: "m2",
        mandi_name: "Chintamani",
        district: "Chikkaballapur",
        crop_id: "ragi",
        price_date: "2026-11-27",
        modal_price: 2300,
        price_age_days: 1,
        commission_pct: null,
        distance_km: 55,
      },
    ])
    mocks.loadOpenRequestsForPool.mockResolvedValue([
      { id: "r1", quantity_qtl: 35, location: null, sale_week: "2026-11-23" },
    ])
    mocks.loadForecast.mockResolvedValue({ r10: -0.03, r50: 0.06, r90: 0.12, years_of_data: 3 })
    mocks.upsertFarmer.mockResolvedValue("farmer-1")
    mocks.saveSaleRequest.mockResolvedValue("req-1")
    mocks.sendSms.mockResolvedValue({ queued: true })

    const res = await POST(
      makeReq({
        crop: "ragi",
        quantity_quintals: "15",
        village: "Mulbagal",
        debt_rupees: "20000",
        caller_phone: "+919800000001",
        call_id: "call-1",
      })
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe("ok")
    expect(json.request_id).toBe("req-1")
    expect(json.pool_available).toBe(true)
    expect(json.sms_queued).toBe(true)
    expect(json.options[0].id).toBe("sell_far_pooled")
    expect(json.options[0].net_rupees).toBe(33015)
    expect(json.debt_note).toEqual({
      gap_per_qtl: 274,
      best_option_id: "sell_far_pooled",
    })
  })
})
