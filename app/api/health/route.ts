import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({ ok: true, latest_price_date: null })
}
