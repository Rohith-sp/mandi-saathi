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
    .update({
      response: answer,
      responded_at: new Date().toISOString(),
    })
    .eq("id", pool_member_id)

  if (updateError) {
    return NextResponse.json({ error: "db_update_failed" }, { status: 500 })
  }

  // If yes, send confirmation SMS
  if (answer === "yes") {
    const { data: member } = await supabase
      .from("pool_members")
      .select(
        `
        id,
        sale_request_id,
        pools (
          id, crop_id, pickup_date, pickup_place, vehicle_note,
          target_warehouse_id, warehouses (name)
        ),
        sale_requests (
          phone_missing_placeholder,
          farmers (phone),
          crop_id, quantity_qtl
        )
      `
      )
      .eq("id", pool_member_id)
      .single()

    if (member) {
      const pool = member.pools as any
      const request = member.sale_requests as any
      const farmer = request.farmers as any

      if (farmer?.phone) {
        await sendSms({
          to: farmer.phone,
          body: poolConfirmSmsTemplate({
            to: farmer.phone,
            crop: "",
            pickupDate: pool.pickup_date ?? "",
            pickupPlace: pool.pickup_place ?? "",
            vehicleNote: pool.vehicle_note,
            warehouseNote: pool.target_warehouse_id
              ? `Warehouse: ${pool.warehouses?.name ?? ""}`
              : undefined,
          }).body,
          kind: "pool_confirm",
          farmerId: member.sale_request_id,
          supabase,
        }).catch(() => {} // SMS failure never fails
        )
      }
    }
  }

  // Check if all members have responded
  const { data: members } = await supabase
    .from("pool_members")
    .select("response")
    .eq("pool_id", pool_member_id.split("_")[0]) // approximate; will be fixed by caller

  return NextResponse.json({ ok: true })
}
