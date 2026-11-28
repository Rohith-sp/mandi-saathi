import { NextResponse } from "next/server"
import { z } from "zod"
import { checkBolnaSecret } from "@/lib/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { sendSms } from "@/lib/sms/client"
import { poolConfirmSmsTemplate } from "@/lib/sms/templates"

const poolResponseSchema = z.object({
  pool_member_id: z.string(),
  answer: z.enum(["yes", "no"]),
})

export const runtime = "nodejs"

interface PoolMemberJoin {
  id: string
  pool_id: string
  sale_request_id: string
  pools: { id: string; crop_id: string; pickup_date: string | null; pickup_place: string | null; vehicle_note: string | null; target_warehouse_id: string | null; warehouses?: { name?: string } | null } | null
  sale_requests: { id: string; crop_id: string; quantity_qtl: number; farmers: { phone?: string } | null } | null
}

export async function POST(req: Request) {
  const secretHeader = req.headers.get("x-api-secret")
  const tokenParam = new URL(req.url).searchParams.get("token")
  const secret = (secretHeader ?? tokenParam ?? "") || null
  if (!checkBolnaSecret(secret, process.env.BOLNA_TOOL_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: z.infer<typeof poolResponseSchema>
  try {
    body = poolResponseSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const { pool_member_id, answer } = body
  const supabase = createServiceClient()

  // Update pool_members.response
  const { error: updateError } = await supabase
    .from("pool_members")
    .update({ response: answer, responded_at: new Date().toISOString() })
    .eq("id", pool_member_id)
  if (updateError) return NextResponse.json({ error: "db_update_failed" }, { status: 500 })

  // Fetch member + pool for SMS + status transition
  const { data: memberRows } = await supabase
    .from("pool_members")
    .select(`
      id, pool_id, sale_request_id,
      pools (id, crop_id, pickup_date, pickup_place, vehicle_note, target_warehouse_id, warehouses (name)),
      sale_requests (id, crop_id, quantity_qtl, farmers (phone))
    `)
    .eq("id", pool_member_id)
    .limit(1)

  const member = (memberRows?.[0] ?? null) as PoolMemberJoin | null
  const poolId = member?.pool_id

  // If yes, send confirmation SMS (SMS failure never fails)
  if (answer === "yes" && member) {
    const pool = member.pools
    const phone = member.sale_requests?.farmers?.phone
    if (pool && phone) {
      await sendSms({
        to: phone,
        body: poolConfirmSmsTemplate({
          to: phone,
          crop: pool.crop_id ?? "",
          pickupDate: pool.pickup_date ?? "",
          pickupPlace: pool.pickup_place ?? "",
          vehicleNote: pool.vehicle_note ?? undefined,
          warehouseNote: pool.target_warehouse_id ? `Warehouse: ${pool.warehouses?.name ?? ""}` : undefined,
        }).body,
        kind: "pool_confirm",
        farmerId: member.sale_request_id,
        supabase,
      }).catch(() => {}) // SMS failure never fails
    }
  }

  // When no members are pending, set pool status = confirmed (≥1 yes) or cancelled
  if (poolId) {
    const { data: allMembers } = await supabase
      .from("pool_members")
      .select("response")
      .eq("pool_id", poolId)

    const responses = (allMembers ?? []).map((m: { response: string }) => m.response)
    const noPending = responses.every((r) => r !== "pending")
    if (noPending) {
      const anyYes = responses.includes("yes")
      await supabase
        .from("pools")
        .update({ status: anyYes ? "confirmed" : "cancelled" })
        .eq("id", poolId)
    }
  }

  return NextResponse.json({ ok: true })
}
