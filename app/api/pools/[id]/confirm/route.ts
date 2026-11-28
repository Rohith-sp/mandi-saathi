import { NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import { bolnaOutboundCall } from "@/lib/bolna/client"

const confirmSchema = z.object({
  pickup_date: z.string().min(1),
  pickup_place: z.string().min(1),
  vehicle_note: z.string().optional(),
})

export const runtime = "nodejs"

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()

  // Auth: operator session (via Supabase Auth cookie)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // Verify operator belongs to an FPO and pool belongs to that FPO
  const { data: operator } = await supabase
    .from("operators")
    .select("fpo_id")
    .eq("user_id", user.id)
    .single()

  if (!operator) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const { data: pool, error: poolError } = await supabase
    .from("pools")
    .select("*, fpo_id, pool_members (*, sale_requests (farmers (phone)))")
    .eq("id", params.id)
    .eq("fpo_id", operator.fpo_id)
    .single()

  if (poolError || !pool) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  if (pool.status !== "proposed") {
    return NextResponse.json(
      { error: "pool_not_proposed" },
      { status: 400 }
    )
  }

  let body: z.infer<typeof confirmSchema>
  try {
    body = confirmSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const { pickup_date, pickup_place, vehicle_note } = body

  // Set pool to confirming
  const { error: updateError } = await supabase
    .from("pools")
    .update({
      status: "confirming",
      pickup_date,
      pickup_place,
      vehicle_note,
    })
    .eq("id", params.id)

  if (updateError) {
    return NextResponse.json({ error: "db_update_failed" }, { status: 500 })
  }

  // Trigger Bolna outbound calls to each member
  let callsStarted = 0
  const poolAgentId = process.env.BOLNA_POOL_AGENT_ID

  if (poolAgentId && pool.pool_members) {
    for (const member of pool.pool_members) {
      const request = member.sale_requests as any
      const farmer = request?.farmers as any

      if (farmer?.phone) {
        const result = await bolnaOutboundCall({
          agentId: poolAgentId,
          recipientPhoneNumber: farmer.phone,
          userData: {
            pool_member_id: member.id,
            pool_id: pool.id,
            crop_id: pool.crop_id,
            quantity_qtl: request.quantity_qtl,
            pickup_date,
            pickup_place,
            vehicle_note,
          },
        })

        if (result.success) {
          callsStarted++
        }

        // Rate-limit: 1 call/second
        await new Promise((r) => setTimeout(r, 1000))
      }
    }
  }

  return NextResponse.json({ calls_started: callsStarted })
}
