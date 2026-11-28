import { NextResponse } from "next/server"
import { z } from "zod"
import { checkBolnaSecret } from "@/lib/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { maskPhone } from "@/lib/data/mask"
import { sendSms } from "@/lib/sms/client"
import { adviceSmsTemplate } from "@/lib/sms/templates"
import { upsertFarmer, saveSaleRequest, resolveVillage, loadMandiPrices, loadForecast, loadOpenRequestsForPool } from "@/lib/data/advise"
import { CALC_CONFIG, SUPPORTED_CROPS, CROPS } from "@/lib/calc/config"
import { sellLocal, sellFarAlone, sellFarPooled, storeLoan, roundRs, sayAmount } from "@/lib/calc/options"
import { rankOptions, debtNote } from "@/lib/calc/rank"
import { saleConfidence } from "@/lib/calc/confidence"

const adviseSchema = z.object({
  crop: z.string().min(1),
  quantity_quintals: z.coerce.number().positive().max(500), // Bolna sends strings
  village: z.string().min(1),
  debt_rupees: z.coerce.number().nonnegative().default(0),
  caller_phone: z.string().optional(),
  call_id: z.string().optional(),
})

export const runtime = "nodejs"

export async function POST(req: Request) {
  const start = Date.now()

  // 1. Auth: Bolna secret
  const secretHeader = req.headers.get("x-api-secret")
  if (!checkBolnaSecret(secretHeader, process.env.BOLNA_TOOL_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // 2. Parse + validate body
  let body: z.infer<typeof adviseSchema>
  try {
    body = adviseSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const { crop, quantity_quintals: qtl, village, debt_rupees: debt, caller_phone, call_id } = body

  // 3. Validate crop
  if (!SUPPORTED_CROPS.includes(crop)) {
    return NextResponse.json({
      status: "unsupported_crop",
      supported_crops: SUPPORTED_CROPS,
    })
  }

  const supabase = createServiceClient()

  // 4. Resolve village
  const resolved = await resolveVillage({ supabase, villageName: village })
  if (!resolved) {
    return NextResponse.json({ status: "needs_clarification", field: "village" })
  }

  // C2: do not invent coordinates; a village without location can't compute distances
  if (!resolved.location) {
    return NextResponse.json({ status: "needs_clarification", field: "village_location" })
  }
  const lat = resolved.location.lat
  const lng = resolved.location.lng

  // 5. Load mandi prices (non-stale, within 80 km)
  const mandiPrices = await loadMandiPrices({
    supabase,
    cropId: crop,
    lat,
    lng,
    maxDistanceKm: CALC_CONFIG.FAR_MANDI_MAX_KM,
    staleDays: CALC_CONFIG.PRICE_STALE_DAYS,
  })

  if (mandiPrices.length === 0) {
    return NextResponse.json({ status: "no_price" })
  }

  // Find local mandi = nearest with non-stale price
  mandiPrices.sort((a, b) => a.distance_km - b.distance_km)
  const localMandi = mandiPrices[0]

  // Find far mandi = highest pooled net among remaining within range
  // Compute far options for each candidate and pick best
  const cropInfo = CROPS[crop]
  const farCandidates = mandiPrices.slice(1)

  // Load open requests for pooling basis (same crop, week, radius)
  const today = new Date()
  const isoWeek = getISOWEEK(today)
  const saleWeek = today.toISOString().slice(0, 10)

  const openRequests = await loadOpenRequestsForPool({
    supabase,
    cropId: crop,
    saleWeek,
    lat,
    lng,
    radiusKm: CALC_CONFIG.POOL_RADIUS_KM,
  })

  // Compute poolQty: this request's qtl + sum of other open requests, capped at truck capacity
  const otherPoolQty = openRequests.reduce((sum, r) => sum + r.quantity_qtl, 0)
  const poolQtyRaw = qtl + otherPoolQty
  const poolQty = Math.min(poolQtyRaw, CALC_CONFIG.TRUCK_CAPACITY_QTL)
  const poolMinFill = CALC_CONFIG.TRUCK_CAPACITY_QTL * CALC_CONFIG.POOL_MIN_FILL
  const poolBasis = poolQtyRaw >= poolMinFill ? "observed" : "assumed"
  const assumedPoolQty = poolQtyRaw < poolMinFill ? poolMinFill : poolQty

  // Load forecast for local mandi
  const forecast = await loadForecast({
    supabase,
    mandiId: localMandi.mandi_id,
    cropId: crop,
    isoWeek,
  })

  // 6. Compute options using lib/calc (pure)
  const localOption = sellLocal({
    qtl,
    mandi: localMandi.mandi_name,
    priceRsPerQtl: localMandi.modal_price,
    priceAgeDays: localMandi.price_age_days,
    commissionPct: localMandi.commission_pct ?? CALC_CONFIG.COMMISSION_PCT,
  })

  let farAloneOption: ReturnType<typeof sellFarAlone> | undefined
  let farPooledOption: ReturnType<typeof sellFarPooled> | undefined
  let bestFarMandi: typeof localMandi | undefined

  for (const far of farCandidates) {
    const alone = sellFarAlone({
      qtl,
      mandi: far.mandi_name,
      priceRsPerQtl: far.modal_price,
      priceAgeDays: far.price_age_days,
      distanceKm: far.distance_km,
      transitLossPct: cropInfo.transitLossPct,
      commissionPct: far.commission_pct ?? CALC_CONFIG.COMMISSION_PCT,
    })

    const pooled = sellFarPooled({
      qtl,
      mandi: far.mandi_name,
      priceRsPerQtl: far.modal_price,
      priceAgeDays: far.price_age_days,
      distanceKm: far.distance_km,
      transitLossPct: cropInfo.transitLossPct,
      poolQty: assumedPoolQty,
      poolBasis,
      commissionPct: far.commission_pct ?? CALC_CONFIG.COMMISSION_PCT,
    })

    // Pick far mandi with highest pooled net
    if (!bestFarMandi || pooled.netRs > (farPooledOption?.netRs ?? -Infinity)) {
      bestFarMandi = far
      farAloneOption = alone
      farPooledOption = pooled
    }
  }

  // sell_far_alone spoken=false if worse than sell_local
  if (farAloneOption && farAloneOption.netRs < localOption.netRs) {
    farAloneOption.spoken = false
  }

  // store_loan (storable crops only)
  let storeLoanOption: ReturnType<typeof storeLoan> | undefined
  if (cropInfo.storable && forecast) {
    storeLoanOption = storeLoan({
      qtl,
      priceRsPerQtl: localMandi.modal_price,
      priceAgeDays: localMandi.price_age_days,
      r10: forecast.r10,
      r50: forecast.r50,
      r90: forecast.r90,
      yearsOfData: forecast.years_of_data,
      commissionPct: localMandi.commission_pct ?? CALC_CONFIG.COMMISSION_PCT,
    })
  }

  // 7. Rank
  const ranked = rankOptions({
    local: localOption,
    farAlone: farAloneOption,
    farPooled: farPooledOption,
    storeLoan: storeLoanOption,
  })

  // 8. Debt note
  const debtNoteResult =
    debt > 0
      ? debtNote({
          debt,
          qtl,
          bestNetRs: ranked.spoken[0]?.netRs ?? localOption.netRs,
          bestOptionId: ranked.spoken[0]?.id ?? "sell_local",
          sellLocalNetRs: localOption.netRs,
          loanRs: storeLoanOption?.loanRs,
        })
      : null

  // 9. Upsert farmer + save sale request
  let farmerId = ""
  let fpoId: string | null = null
  try {
    if (caller_phone) {
      farmerId = await upsertFarmer({
        supabase,
        phone: caller_phone,
        villageId: resolved.id,
        fpoId: resolved.fpo_id,
      })
      fpoId = resolved.fpo_id
    }

    await saveSaleRequest({
      supabase,
      farmerId,
      fpoId,
      callId: call_id ?? "",
      cropId: crop,
      quantityQtls: qtl,
      debtRupees: debt,
      lat,
      lng,
      saleWeek,
      options: {
        status: "ok",
        request_id: "",
        crop,
        quantity_quintals: qtl,
        options: ranked.spoken.map((o) => ({
          id: o.id,
          label: o.label,
          mandi: (o as any).mandi,
          distance_km: (o as any).distance_km,
          net_rupees: o.netRs,
          say_amount: o.sayAmountRs,
          confidence: o.confidence,
          price_age_days: (o as any).price_age_days,
          pool_basis: (o as any).poolBasis,
          spoken: o.spoken,
        })),
        pool_available: ranked.poolAvailable,
        debt_note: debtNoteResult,
        sms_queued: false, // updated after SMS
      },
    })
  } catch (err) {
    // DB errors shouldn't fail the advice response
    console.error("DB save failed:", err instanceof Error ? err.message : "unknown")
  }

  // 10. Send SMS after response is built (fire-and-forget, failure logged)
  const smsResult = await sendSms({
    to: caller_phone ?? "",
    body: adviceSmsTemplate({
      to: caller_phone ?? "",
      crop,
      quantityQtls: qtl,
      options: ranked.spoken.map((o) => ({
        label: o.label,
        sayAmountRs: o.sayAmountRs,
        confidence: o.confidence,
      })),
      poolAvailable: ranked.poolAvailable,
    }).body,
    kind: "advice",
    farmerId: farmerId || undefined,
    supabase,
  }).catch(() => ({ queued: false }))

  const response = {
    status: "ok" as const,
    request_id: call_id ?? "",
    crop,
    quantity_quintals: qtl,
    options: ranked.spoken.map((o) => ({
      id: o.id,
      label: o.label,
      mandi: (o as any).mandi,
      distance_km: (o as any).distance_km,
      net_rupees: o.netRs,
      say_amount: o.sayAmountRs,
      confidence: o.confidence,
      price_date: "",
      price_age_days: (o as any).price_age_days,
      pool_basis: (o as any).poolBasis,
      spoken: o.spoken,
      ...(o.id === "store_loan"
        ? {
            net_range: (o as any).netRange,
            loan_rupees: (o as any).loanRs,
            loan_eligible_alone: (o as any).loanEligibleAlone,
            requires_pool: (o as any).requiresPool,
          }
        : {}),
    })),
    pool_available: ranked.poolAvailable,
    debt_note: debtNoteResult,
    sms_queued: smsResult.queued,
  }

  const latency = Date.now() - start
  console.log(
    `/api/advise ${maskPhone(caller_phone)} crop=${crop} qtl=${qtl} village=${village} latency=${latency}ms`
  )

  return NextResponse.json(response)
}

function getISOWEEK(d: Date): number {
  const tmp = new Date(d.getTime())
  tmp.setHours(0, 0, 0, 0)
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
  const week1 = new Date(tmp.getFullYear(), 0, 4)
  return (
    1 +
    Math.round(
      ((tmp.getTime() - week1.getTime()) / 86400000 -
        (week1.getDay() + 6) % 7 +
        3) /
        7
    )
  )
}
