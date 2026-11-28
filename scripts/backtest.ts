import "server-only"

import { createServiceClient } from "../lib/supabase/server"

/**
 * Backtest forecast coverage.
 * For each held-out forecast row, check whether the actual price change
 * 28 days later falls inside [r10, r90]. Prints coverage percentage.
 * Target: 70–90%.
 */

interface ForecastRow {
  mandi_id: string
  crop_id: string
  iso_week: number
  r10: number
  r50: number
  r90: number
  years_of_data: number
}

interface PriceRow {
  price_date: string
  modal_price: number
}

function getISOWeek(d: Date): number {
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

export async function runBacktest({
  supabase,
  log = console.log,
}: {
  supabase: ReturnType<typeof createServiceClient>
  log?: (msg: string) => void
}): Promise<{ coverage: number; total: number; inside: number }> {
  const { data: forecasts, error: fError } = await supabase
    .from("forecasts")
    .select("mandi_id, crop_id, iso_week, r10, r90")
  if (fError) throw fError

  const { data: prices, error: pError } = await supabase
    .from("prices")
    .select("mandi_id, crop_id, price_date, modal_price")
    .order("price_date")
  if (pError) throw pError

  // Build date → price map per (mandi, crop)
  const priceMap = new Map<string, Map<string, number>>()
  for (const p of prices ?? []) {
    if (!priceMap.has(p.mandi_id)) priceMap.set(p.mandi_id, new Map())
    priceMap.get(p.mandi_id)!.set(p.price_date, p.modal_price)
  }

  let total = 0
  let inside = 0

  for (const f of forecasts ?? []) {
    const mandiPrices = priceMap.get(f.mandi_id)
    if (!mandiPrices) continue

    // For each price in the forecast's ISO week, find actual 28 days later
    for (const [dateStr, price] of mandiPrices) {
      const d = new Date(`${dateStr}T12:00:00`)
      const week = getISOWeek(d)
      if (week !== f.iso_week) continue

      const target = new Date(d.getTime())
      target.setDate(target.getDate() + 28)

      let actual: number | null = null
      for (let offset = -3; offset <= 3; offset++) {
        const check = new Date(target.getTime())
        check.setDate(check.getDate() + offset)
        const key = check.toISOString().slice(0, 10)
        if (mandiPrices.has(key)) {
          actual = mandiPrices.get(key)!
          break
        }
      }
      if (actual === null) continue

      const change = (actual - price) / price
      total++
      if (change >= f.r10 && change <= f.r90) inside++
    }
  }

  const coverage = total > 0 ? (inside / total) * 100 : 0
  log(`Backtest coverage: ${coverage.toFixed(1)}% (${inside}/${total})`)
  console.log(`Backtest coverage: ${coverage.toFixed(1)}% (${inside}/${total})`)
  return { coverage, total, inside }
}

if (require.main === module) {
  const supabase = createServiceClient()
  runBacktest({ supabase }).catch((err) => {
    console.error("Backtest failed:", err.message)
    process.exit(1)
  })
}
