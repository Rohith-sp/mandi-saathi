import { NextResponse } from "next/server"
import { z } from "zod"
import { checkBolnaSecret } from "@/lib/auth"
import { createServiceClient } from "@/lib/supabase/server"

const callCompleteSchema = z.object({
  execution_id: z.string(),
  status: z.string().optional(),
  extracted_data: z
    .object({
      pool_interest: z.enum(["yes", "no", "not_asked"]).optional(),
      call_outcome: z.string().optional(),
    })
    .optional(),
  telephony_data: z
    .object({
      to_number: z.string().optional(),
      from_number: z.string().optional(),
      duration: z.number().optional(),
    })
    .optional(),
})

export const runtime = "nodejs"

export async function POST(req: Request) {
  // Auth: Bolna secret (header or ?token= query param)
  const secretHeader = req.headers.get("x-api-secret")
  const tokenParam = new URL(req.url).searchParams.get("token")
  const secret = (secretHeader ?? tokenParam ?? "") || null

  if (!checkBolnaSecret(secret, process.env.BOLNA_TOOL_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: z.infer<typeof callCompleteSchema>
  try {
    body = callCompleteSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const { execution_id, extracted_data, telephony_data } = body

  const supabase = createServiceClient()

  // Find sale_requests by call_id = execution_id
  const { data: existing } = await supabase
    .from("sale_requests")
    .select("id, call_id")
    .eq("call_id", execution_id)
    .maybeSingle()

  if (!existing) {
    // Unknown execution id: Bolna retries are harmless
    return NextResponse.json({ ok: true })
  }

  const updates: Record<string, unknown> = {}

  if (extracted_data?.pool_interest !== undefined) {
    const pi = extracted_data.pool_interest
    updates.pool_interest = pi === "yes" ? true : pi === "no" ? false : null
  }

  if (telephony_data?.duration !== undefined) {
    updates.call_duration_s = telephony_data.duration
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("sale_requests")
      .update(updates)
      .eq("id", existing.id)
    if (error) {
      return NextResponse.json({ error: "db_update_failed" }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
