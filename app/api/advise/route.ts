import { NextResponse } from "next/server"
import { z } from "zod"
import { checkBolnaSecret } from "@/lib/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { maskPhone } from "@/lib/data/mask"
import { sendSms } from "@/lib/sms/client"
import { adviceSmsTemplate } from "@/lib/sms/templates"
import { upsertFarmer, saveSaleRequest, resolveVillage, loadMandiPrices, loadForecast, loadOpenRequestsForPool } from "@/lib/data/advise"
import { CALC_CONFIG, SUPPORTED_CROPS } from "@/lib/calc/config"
import { buildAdvice, toApiOption, type ApiOption } from "@/lib/advise/build-advice"
import { kolkataDate, kolkataISOWeek } from "@/lib/calc/time"

const adviseSchema = z.object({
  crop: z.string().min(1),
  quantity_quintals: z.coerce.number().positive().max(CALC_CONFIG.MAX_QUANTITY_QTLS), // Bolna sends strings
  village: z.string().min(1),
  debt_rupees: z.coerce.number().nonnegative().default(0),
  caller_phone: z.string().optional(),
  call_id: z.string().optional(),
})

export const runtime = "nodejs"

export async function POST(req: Request) {
  const start = Date.now() // latency logging only, not business logic

  // 1. Auth: Bolna secret
  if (!checkBolnaSecret(req.headers.get("x-api-secret"), process.env.BOLNA_TOOL_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // 2. Parse + validate
  let body: z.infer<typeof adviseSchema>
  try {
    body = adviseSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "invalid_quantity" }, { status: 400 })
  }

  const { crop, quantity_quintals: qtl, village, debt_rupees: debt, caller_phone, call_id } = body

  // 3. Crop
  if (!SUPPORTED_CROPS.includes(crop)) {
    return NextResponse.json({ status: "unsupported_crop", supported_crops: SUPPORTED_CROPS })
  }

  const supabase = createServiceClient()

  // 4. Village
  const resolved = await resolveVillage({ supabase, villageName: village })
  if (!resolved) return NextResponse.json({ status: "needs_clarification", field: "village" })
  if (!resolved.location) return NextResponse.json({ status: "needs_clarification", field: "village_location" })
  const { lat, lng } = resolved.location

  // 5. Load data (own DB only)
  const mandiPrices = await loadMandiPrices({
    supabase, cropId: crop, lat, lng,
    maxDistanceKm: CALC_CONFIG.FAR_MANDI_MAX_KM,
    staleDays: CALC_CONFIG.PRICE_STALE_DAYS,
  })
  if (mandiPrices.length === 0) return NextResponse.json({ status: "no_price" })

  mandiPrices.sort((a, b) => a.distance_km - b.distance_km)
  const localMandi = mandiPrices[0]
  const farCandidates = mandiPrices.slice(1)

  const today = new Date()
  const openRequests = await loadOpenRequestsForPool({
    supabase, cropId: crop,
    saleWeek: kolkataDate(today),
    lat, lng, radiusKm: CALC_CONFIG.POOL_RADIUS_KM,
  })

  const forecast = await loadForecast({
    supabase, mandiId: localMandi.mandi_id, cropId: crop,
    isoWeek: kolkataISOWeek(today),
  })

  // 6. Pure calc
  const advice = buildAdvice({
    crop, qtl, debt, localMandi, farCandidates, forecast, openRequests, today,
  })

  const options: ApiOption[] = advice.ranked.spoken.map((o) => toApiOption(o, localMandi))

  // 7. Persist sale request
  let farmerId: string | undefined
  let fpoId: string | null = null
  let requestId = call_id ?? ""
  try {
    if (caller_phone) {
      farmerId = await upsertFarmer({ supabase, phone: caller_phone, villageId: resolved.id, fpoId: resolved.fpo_id })
      fpoId = resolved.fpo_id
    }
    requestId = await saveSaleRequest({
      supabase, farmerId: farmerId ?? "", fpoId,
      callId: call_id ?? "", cropId: crop, quantityQtls: qtl, debtRupees: debt,
      lat, lng, saleWeek: advice.saleWeek,
      options: { status: "ok", options, pool_available: advice.ranked.poolAvailable, debt_note: advice.debtNote },
    })
  } catch (err) {
    console.error("DB save failed:", err instanceof Error ? err.message : "unknown")
  }

  // 8. SMS only when caller_phone present; failure never fails the call
  let smsQueued = false
  if (caller_phone) {
    const sms = await sendSms({
      to: caller_phone,
      body: adviceSmsTemplate({
        to: caller_phone, crop, quantityQtls: qtl,
        options: advice.ranked.spoken.map((o) => ({ label: o.label, sayAmountRs: o.sayAmountRs, confidence: o.confidence })),
        poolAvailable: advice.ranked.poolAvailable,
      }).body,
      kind: "advice", farmerId, supabase,
    }).catch(() => ({ queued: false }))
    smsQueued = sms.queued
  }

  const latencyMs = Date.now() - start
  console.log(`/api/advise ${maskPhone(caller_phone)} crop=${crop} qtl=${qtl} village=${village} latency=${latencyMs}ms`)

  return NextResponse.json({
    status: "ok" as const,
    request_id: requestId,
    crop, quantity_quintals: qtl,
    options,
    pool_available: advice.ranked.poolAvailable,
    debt_note: advice.debtNote,
    sms_queued: smsQueued,
  })
}
