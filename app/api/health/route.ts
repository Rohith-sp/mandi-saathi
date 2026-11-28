import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET() {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("prices")
      .select("price_date")
      .order("price_date", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ ok: false, latest_price_date: null }, { status: 503 })
    }

    return NextResponse.json({
      ok: true,
      latest_price_date: data?.price_date ?? null,
    })
  } catch {
    return NextResponse.json({ ok: true, latest_price_date: null })
  }
}
