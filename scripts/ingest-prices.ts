import "server-only"

import { createServiceClient } from "../lib/supabase/server"
import { maskPhone } from "../lib/data/mask"

/**
 * Daily mandi price ingestion from data.gov.in.
 * Fetches current daily prices for target state/districts/crops, cleans,
 * and upserts into `prices`. Idempotent: rerun inserts nothing new.
 *
 * No random data is inserted. Only real data.gov.in rows are upserted.
 * Unknown markets are logged (masked) and skipped.
 */

const DATA_GOV_BASE = "https://api.data.gov.in/resource"

interface DataGovRow {
  state: string
  district: string
  market: string
  commodity: string
  variety: string
  grade: string
  arrival_date: string // dd/mm/yyyy
  min_price: string | number
  max_price: string | number
  modal_price: string | number
}

interface CropAlias {
  alias: string
  crop_id: string
}

function parseDateIST(s: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim())
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 12, 0, 0, 0) // noon IST to avoid TZ shifts
  if (isNaN(d.getTime())) return null
  return d
}

function parsePrice(v: string | number): number | null {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export async function ingestPrices({
  apiKey,
  resourceId,
  state,
  districts,
  supabase,
  log = console.log,
}: {
  apiKey: string
  resourceId: string
  state: string
  districts: string[]
  supabase: ReturnType<typeof createServiceClient>
  log?: (msg: string) => void
}): Promise<{ inserted: number; skipped: number; unknownMarkets: string[] }> {
  let inserted = 0
  let skipped = 0
  const unknownMarkets: string[] = []

  // Build commodity → crop mapping from DB (crop_aliases)
  const { data: aliases, error: aliasError } = await supabase
    .from("crop_aliases")
    .select("alias, crop_id")
  if (aliasError) throw aliasError
  const aliasMap = new Map<string, string>()
  for (const a of aliases ?? []) {
    aliasMap.set(a.alias.toLowerCase(), a.crop_id)
  }

  // Build market → mandi mapping from DB
  const { data: mandis, error: mandiError } = await supabase
    .from("mandis")
    .select("id, name, district")
  if (mandiError) throw mandiError
  const mandiMap = new Map<string, { id: string; district: string }>()
  for (const m of mandis ?? []) {
    mandiMap.set(`${m.name.toLowerCase()}|${m.district.toLowerCase()}`, {
      id: m.id,
      district: m.district,
    })
  }

  for (const district of districts) {
    let offset = 0
    const limit = 1000
    let hasMore = true

    while (hasMore) {
      const url = new URL(`${DATA_GOV_BASE}/${resourceId}`)
      url.searchParams.set("api-key", apiKey)
      url.searchParams.set("format", "json")
      url.searchParams.set("limit", String(limit))
      url.searchParams.set("offset", String(offset))
      url.searchParams.set("filters[state]", state)
      url.searchParams.set("filters[district]", district)

      const res = await fetch(url.toString())
      if (!res.ok) {
        log(`data.gov.in fetch failed for ${district} offset ${offset}: ${res.status}`)
        break
      }

      const json = await res.json()
      const rows: DataGovRow[] = json.records ?? []
      if (!rows.length) {
        hasMore = false
        break
      }

      for (const row of rows) {
        const cropId = aliasMap.get(row.commodity.toLowerCase())
        if (!cropId) continue // commodity not in our demo set

        const mandiKey = `${row.market.toLowerCase()}|${district.toLowerCase()}`
        const mandi = mandiMap.get(mandiKey)
        if (!mandi) {
          if (!unknownMarkets.includes(row.market)) {
            unknownMarkets.push(row.market)
            log(`Unknown market (not in mandis table): ${row.market} (${district})`)
          }
          continue
        }

        const date = parseDateIST(row.arrival_date)
        if (!date) {
          log(`Invalid date: ${row.arrival_date}`)
          continue
        }

        const min = parsePrice(row.min_price)
        const max = parsePrice(row.max_price)
        const modal = parsePrice(row.modal_price)
        if (!min || !max || !modal) {
          log(`Invalid prices for ${row.market} ${row.commodity} ${row.arrival_date}`)
          continue
        }
        // Cleaning rule: modal must be within [min, max]
        if (modal < min || modal > max) {
          log(`Modal outside [min,max] for ${row.market} ${row.commodity} ${row.arrival_date}`)
          continue
        }

        const priceDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

        const { error } = await supabase
          .from("prices")
          .upsert(
            {
              mandi_id: mandi.id,
              crop_id: cropId,
              price_date: priceDate,
              min_price: min,
              max_price: max,
              modal_price: modal,
              source: "data.gov.in",
            },
            { onConflict: "mandi_id,crop_id,price_date" }
          )
        if (error) {
          log(`Upsert failed for ${row.market} ${cropId} ${priceDate}: ${error.message}`)
          skipped++
          continue
        }
        inserted++
      }

      offset += limit
      if (rows.length < limit) hasMore = false
    }
  }

  log(`Ingestion complete: inserted=${inserted} skipped=${skipped} unknownMarkets=${unknownMarkets.length}`)
  return { inserted, skipped, unknownMarkets }
}

if (require.main === module) {
  const apiKey = process.env.DATA_GOV_API_KEY
  const resourceId = process.env.DATA_GOV_RESOURCE_ID
  const state = process.env.INGEST_STATE
  const districtsRaw = process.env.INGEST_DISTRICTS

  if (!apiKey || !resourceId || !state || !districtsRaw) {
    console.error("Missing required env vars for ingestion")
    process.exit(1)
  }

  const districts = districtsRaw.split(",").map((d) => d.trim())
  const supabase = createServiceClient()

  ingestPrices({ apiKey, resourceId, state, districts, supabase }).catch((err) => {
    console.error("Ingestion failed:", err.message)
    process.exit(1)
  })
}
