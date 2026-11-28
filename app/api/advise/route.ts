import { NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { checkBolnaSecret } from "@/lib/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { maskPhone } from "@/lib/data/mask"
import { sendSms } from "@/lib/sms/client"
import { adviceSmsTemplate } from "@/lib/sms/templates"
import {
  upsertFarmer,
  saveSaleRequest,
  resolveVillage,
  loadMandiPrices,
  loadForecast,
  loadOpenRequestsForPool,
} from "@/lib/data/advise"
import { CALC_CONFIG, SUPPORTED_CROPS } from "@/lib/calc/config"
import { buildAdvice, toApiOption, type ApiOption } from "@/lib/advise/build-advice"
import { kolkataISOWeek, kolkataSaleWeek } from "@/lib/calc/time"

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
  } catch (err) {
    const isQuantityError =
      err instanceof ZodError &&
      err.issues.some((issue) => issue.path.includes("quantity_quintals"))
    return NextResponse.json(
      { error: isQuantityError ? "invalid_quantity" : "invalid_body" },
      { status: 400 }
    )
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
  if (!resolved.location) {
    return NextResponse.json({ status: "needs_clarification", field: "village_location" })
  }
  const { lat, lng } = resolved.location

  // 5. Load data (own DB only)
  const mandiPrices = await loadMandiPrices({
    supabase,
    cropId: crop,
    lat,
    lng,
    maxDistanceKm: CALC_CONFIG.FAR_MANDI_MAX_KM,
    staleDays: CALC_CONFIG.PRICE_STALE_DAYS,
  })
  if (mandiPrices.length === 0) return NextResponse.json({ status: "no_price" })

  mandiPrices.sort((a, b) => a.distance_km - b.distance_km)
  const localMandi = mandiPrices[0]
  const farCandidates = mandiPrices.slice(1)

  const today = new Date()
  const saleWeek = kolkataSaleWeek(today)
  const openRequests = await loadOpenRequestsForPool({
    supabase,
    cropId: crop,
    saleWeek,
    lat,
    lng,
    radiusKm: CALC_CONFIG.POOL_RADIUS_KM,
  })

  const forecast = await loadForecast({
    supabase,
    mandiId: localMandi.mandi_id,
    cropId: crop,
    isoWeek: kolkataISOWeek(today),
  })

  // 6. Pure calc
  const advice = buildAdvice({
    crop,
    qtl,
    debt,
    localMandi,
    farCandidates,
    forecast,
    openRequests,
    today,
  })

  const options: ApiOption[] = advice.ranked.spoken.map((o) => toApiOption(o, localMandi))
  const apiDebtNote = advice.debtNote
    ? {
        gap_per_qtl: advice.debtNote.gapPerQtls,
        best_option_id: advice.debtNote.bestOptionId,
        ...(advice.debtNote.bestOptionId === "store_loan" &&
        advice.debtNote.loanCoversDebt !== undefined
          ? { loan_covers_debt: advice.debtNote.loanCoversDebt }
          : {}),
      }
    : null

  // 7. Persist sale request when caller_phone is present (farmers.id is NOT NULL FK)
  let farmerId: string | undefined
  let requestId = call_id ?? ""
  try {
    if (caller_phone) {
      farmerId = await upsertFarmer({
        supabase,
        phone: caller_phone,
        villageId: resolved.id,
        fpoId: resolved.fpo_id,
      })
      requestId = await saveSaleRequest({
        supabase,
        farmerId,
        fpoId: resolved.fpo_id,
        callId: call_id ?? "",
        cropId: crop,
        quantityQtls: qtl,
        debtRupees: debt,
        lat,
        lng,
        saleWeek: advice.saleWeek,
        options: {
          status: "ok",
          options,
          pool_available: advice.ranked.poolAvailable,
          debt_note: apiDebtNote,
        },
      })
    }
  } catch (err) {
    console.error("DB save failed:", err instanceof Error ? err.message : "unknown")
  }

  // 8. SMS only when caller_phone present; failure never fails the call
  let smsQueued = false
  if (caller_phone) {
    const sms = await sendSms({
      to: caller_phone,
      body: adviceSmsTemplate({
        to: caller_phone,
        crop,
        quantityQtls: qtl,
        options: advice.ranked.spoken.map((o) => ({
          label: o.label,
          sayAmountRs: o.sayAmountRs,
          confidence: o.confidence,
        })),
        poolAvailable: advice.ranked.poolAvailable,
      }).body,
      kind: "advice",
      farmerId,
      supabase,
    }).catch(() => ({ queued: false }))
    smsQueued = sms.queued
  }

  const latencyMs = Date.now() - start
  console.log(
    `/api/advise ${maskPhone(caller_phone)} crop=${crop} qtl=${qtl} village=${village} latency=${latencyMs}ms`
  )

  return NextResponse.json({
    status: "ok" as const,
    request_id: requestId,
    crop,
    quantity_quintals: qtl,
    options,
    pool_available: advice.ranked.poolAvailable,
    debt_note: apiDebtNote,
    sms_queued: smsQueued,
  })
}
