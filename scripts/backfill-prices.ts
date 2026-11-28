import "server-only"

import { createServiceClient } from "../lib/supabase/server"
import fs from "node:fs"
import path from "node:path"

/**
 * Backfill historical mandi prices from AGMARKNET CSV exports.
 * CSVs live in data/backfill/ (gitignored). Each CSV must have columns:
 * market, district, commodity, arrival_date (dd/mm/yyyy), min_price,
 * max_price, modal_price.
 *
 * Uses the same cleaner as ingest-prices.ts. Idempotent: rerun upserts
 * nothing new. No random data is inserted.
 */

const BACKFILL_DIR = path.join(process.cwd(), "data", "backfill")

interface BackfillRow {
  market: string
  district: string
  commodity: string
  arrival_date: string
  min_price: string | number
  max_price: string | number
  modal_price: string | number
}

function parseDateIST(s: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim())
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 12, 0, 0, 0)
  if (isNaN(d.getTime())) return null
  return d
}

function parsePrice(v: string | number): number | null {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export async function backfillPrices({
  supabase,
  dir = BACKFILL_DIR,
  log = console.log,
}: {
  supabase: ReturnType<typeof createServiceClient>
  dir?: string
  log?: (msg: string) => void
}): Promise<{ inserted: number; skipped: number; files: string[] }> {
  let inserted = 0
  let skipped = 0
  const files: string[] = []

  // Load alias map
  const { data: aliases, error: aliasError } = await supabase
    .from("crop_aliases")
    .select("alias, crop_id")
  if (aliasError) throw aliasError
  const aliasMap = new Map<string, string>()
  for (const a of aliases ?? []) {
    aliasMap.set(a.alias.toLowerCase(), a.crop_id)
  }

  // Load mandi map
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

  if (!fs.existsSync(dir)) {
    log(`Backfill directory not found: ${dir}`)
    return { inserted: 0, skipped: 0, files: [] }
  }

  const csvFiles = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .sort()

  for (const file of csvFiles) {
    files.push(file)
    const filePath = path.join(dir, file)
    const content = fs.readFileSync(filePath, "utf-8")
    const lines = content.trim().split("\n")
    if (lines.length < 2) continue

    const header = lines[0].split(",").map((h) => h.trim())
    const colIndex: Record<string, number> = {}
    header.forEach((h, i) => {
      colIndex[h] = i
    })

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",")
      const get = (name: string): string => cols[colIndex[name] ?? -1]?.trim() ?? ""

      const row: BackfillRow = {
        market: get("market"),
        district: get("district"),
        commodity: get("commodity"),
        arrival_date: get("arrival_date"),
        min_price: get("min_price"),
        max_price: get("max_price"),
        modal_price: get("modal_price"),
      }

      const cropId = aliasMap.get(row.commodity.toLowerCase())
      if (!cropId) continue

      const mandiKey = `${row.market.toLowerCase()}|${row.district.toLowerCase()}`
      const mandi = mandiMap.get(mandiKey)
      if (!mandi) {
        log(`Unknown market in backfill: ${row.market} (${row.district})`)
        skipped++
        continue
      }

      const date = parseDateIST(row.arrival_date)
      if (!date) {
        log(`Invalid date in ${file}: ${row.arrival_date}`)
        skipped++
        continue
      }

      const min = parsePrice(row.min_price)
      const max = parsePrice(row.max_price)
      const modal = parsePrice(row.modal_price)
      if (!min || !max || !modal) {
        log(`Invalid prices in ${file} line ${i + 1}`)
        skipped++
        continue
      }
      if (modal < min || modal > max) {
        log(`Modal outside [min,max] in ${file} line ${i + 1}`)
        skipped++
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
            source: "AGMARKNET",
          },
          { onConflict: "mandi_id,crop_id,price_date" }
        )
      if (error) {
        log(`Upsert failed in ${file} line ${i + 1}: ${error.message}`)
        skipped++
        continue
      }
      inserted++
    }
  }

  log(`Backfill complete: inserted=${inserted} skipped=${skipped} files=${files.length}`)
  return { inserted, skipped, files }
}

if (require.main === module) {
  const supabase = createServiceClient()
  backfillPrices({ supabase }).catch((err) => {
    console.error("Backfill failed:", err.message)
    process.exit(1)
  })
}
