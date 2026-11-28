import { readFileSync } from "node:fs"
import { z } from "zod"
import { createServiceClient } from "../lib/supabase/service"
import { seedReferenceData } from "./seed"

/**
 * Seed reference data from a JSON file you supply.
 *
 * Usage:
 *   npm run seed                 # reads supabase/seed/reference.json
 *   npm run seed -- path/to.json
 *
 * The file must contain REAL names and coordinates (OpenStreetMap / Google
 * Maps). Nothing is invented here. Mandi `name` must match the data.gov.in
 * `market` string exactly, and `district` the data.gov.in `district`.
 *
 * {
 *   "fpo": { "name": "...", "district": "..." },
 *   "villages":   [{ "name", "name_kn?", "taluk?", "district", "lat", "lng" }],
 *   "mandis":     [{ "name", "district", "lat", "lng", "commission_pct?" }],
 *   "warehouses": [{ "name", "lat", "lng", "wdra_registered?", "charge_per_qtl_month?", "capacity_qtl?" }]
 * }
 */

const lat = z.number().gte(-90).lte(90)
const lng = z.number().gte(-180).lte(180)

const referenceSchema = z.object({
  fpo: z.object({
    name: z.string().min(1),
    district: z.string().min(1),
  }),
  villages: z
    .array(
      z.object({
        name: z.string().min(1),
        name_kn: z.string().min(1).optional(),
        taluk: z.string().min(1).optional(),
        district: z.string().min(1),
        lat,
        lng,
      })
    )
    .default([]),
  mandis: z
    .array(
      z.object({
        name: z.string().min(1),
        district: z.string().min(1),
        lat,
        lng,
        commission_pct: z.number().min(0).max(100).optional(),
      })
    )
    .default([]),
  warehouses: z
    .array(
      z.object({
        name: z.string().min(1),
        lat,
        lng,
        wdra_registered: z.boolean().optional(),
        charge_per_qtl_month: z.number().min(0).optional(),
        capacity_qtl: z.number().positive().optional(),
      })
    )
    .default([]),
})

async function main() {
  const file = process.argv[2] ?? "supabase/seed/reference.json"

  let raw: string
  try {
    raw = readFileSync(file, "utf8")
  } catch {
    console.error(`Cannot read ${file}.
Create it from supabase/seed/reference.example.json and fill in real
coordinates (OpenStreetMap / Google Maps). Do not invent data.`)
    process.exit(1)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.error(`${file} is not valid JSON: ${(err as Error).message}`)
    process.exit(1)
  }

  const result = referenceSchema.safeParse(parsed)
  if (!result.success) {
    console.error(`${file} does not match the expected shape:`)
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    }
    process.exit(1)
  }

  const { fpo, villages, mandis, warehouses } = result.data
  const supabase = createServiceClient()

  await seedReferenceData({ supabase, fpo, villages, mandis, warehouses })
}

main().catch((err) => {
  console.error("Seed failed:", (err as Error).message)
  process.exit(1)
})
