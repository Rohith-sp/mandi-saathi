import "server-only"

import { createServiceClient } from "../lib/supabase/server"
import { MS_PER_DAY } from "../lib/calc/time"

/**
 * Weekly forecast recompute.
 * For each (mandi, crop, ISO week w): collect every historical day in week w,
 * compute the price change to the same mandi's price 28 days later (nearest
 * available within ±3 days), take P10/P50/P90 percentiles. Store with
 * years_of_data. Fewer than 20 samples → skip.
 */

interface PriceRow {
  price_date: string
  modal_price: number
}

interface ForecastInput {
  mandi_id: string
  crop_id: string
  iso_week: number
  prices: PriceRow[] // all historical prices for this mandi/crop, sorted
}

function getISOWeek(d: Date): number {
  const tmp = new Date(d.getTime())
  tmp.setHours(0, 0, 0, 0)
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
  const week1 = new Date(tmp.getFullYear(), 0, 4)
  return (
    1 +
    Math.round(
      ((tmp.getTime() - week1.getTime()) / MS_PER_DAY -
        (week1.getDay() + 6) % 7 +
        3) /
        7
    )
  )
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const idx = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)
  const frac = idx - lower
  return sorted[lower] + (sorted[upper] - sorted[lower]) * frac
}

export async function computeForecasts({
  supabase,
  log = console.log,
}: {
  supabase: ReturnType<typeof createServiceClient>
  log?: (msg: string) => void
}): Promise<{ computed: number; skipped: number }> {
  let computed = 0
  let skipped = 0

  // Load all prices sorted by mandi, crop, date
  const { data: prices, error: priceError } = await supabase
    .from("prices")
    .select("mandi_id, crop_id, price_date, modal_price")
    .order("price_date")
  if (priceError) throw priceError

  // Group by (mandi_id, crop_id)
  const groups = new Map<string, PriceRow[]>()
  for (const p of prices ?? []) {
    const key = `${p.mandi_id}|${p.crop_id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push({
      price_date: p.price_date,
      modal_price: p.modal_price,
    })
  }

  for (const [key, rows] of groups) {
    const [mandiId, cropId] = key.split("|")

    // Group prices by ISO week
    const byWeek = new Map<number, { date: Date; price: number }[]>()
    for (const r of rows) {
      const d = new Date(`${r.price_date}T12:00:00`)
      const week = getISOWeek(d)
      if (!byWeek.has(week)) byWeek.set(week, [])
      byWeek.get(week)!.push({ date: d, price: r.modal_price })
    }

    // Build a date → price map for lookup
    const dateToPrice = new Map<string, number>()
    for (const r of rows) {
      dateToPrice.set(r.price_date, r.modal_price)
    }

    const dates = rows.map((r) => new Date(`${r.price_date}T12:00:00`))
    const minDate = dates.reduce((a, b) => (a < b ? a : b), dates[0])
    const maxDate = dates.reduce((a, b) => (a > b ? a : b), dates[0])
    const yearsOfData = Math.max(
      1,
      Math.round((maxDate.getTime() - minDate.getTime()) / (365.25 * MS_PER_DAY))
    )

    for (const [weekStr, weekRows] of byWeek) {
      const isoWeek = Number(weekStr)
      if (weekRows.length < 20) {
        skipped++
        continue
      }

      // For each day in this week, find price 28 days later (±3 days)
      const changes: number[] = []
      for (const wr of weekRows) {
        const target = new Date(wr.date.getTime())
        target.setDate(target.getDate() + 28)

        // Find nearest price within ±3 days
        let bestPrice: number | null = null
        let bestDiff = Infinity
        for (let offset = -3; offset <= 3; offset++) {
          const check = new Date(target.getTime())
          check.setDate(check.getDate() + offset)
          const key = check.toISOString().slice(0, 10)
          if (dateToPrice.has(key)) {
            bestPrice = dateToPrice.get(key)!
            break
          }
        }
        if (bestPrice !== null) {
          changes.push((bestPrice - wr.price) / wr.price)
        }
      }

      if (changes.length < 10) {
        skipped++
        continue
      }

      changes.sort((a, b) => a - b)
      const r10 = percentile(changes, 10)
      const r50 = percentile(changes, 50)
      const r90 = percentile(changes, 90)

      const { error } = await supabase
        .from("forecasts")
        .upsert(
          {
            mandi_id: mandiId,
            crop_id: cropId,
            iso_week: isoWeek,
            horizon_weeks: 4,
            r10,
            r50,
            r90,
            years_of_data: yearsOfData,
          },
          { onConflict: "mandi_id,crop_id,iso_week,horizon_weeks" }
        )
      if (error) {
        log(`Forecast upsert failed for ${mandiId}/${cropId} week ${isoWeek}: ${error.message}`)
        skipped++
        continue
      }
      computed++
    }
  }

  log(`Forecasts complete: computed=${computed} skipped=${skipped}`)
  return { computed, skipped }
}

if (require.main === module) {
  const supabase = createServiceClient()
  computeForecasts({ supabase }).catch((err) => {
    console.error("Forecasts failed:", err.message)
    process.exit(1)
  })
}
