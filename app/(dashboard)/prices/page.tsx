import { createServiceClient } from "@/lib/supabase/server"
import { listLatestPrices } from "@/lib/data/dashboard"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default async function PricesPage() {
  const supabase = createServiceClient()
  const prices = await listLatestPrices({ supabase })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mandi Prices</h1>
        <p className="text-sm text-gray-600">
          Latest modal prices per crop per mandi
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mandi</TableHead>
              <TableHead>District</TableHead>
              <TableHead className="text-center">Crop</TableHead>
              <TableHead className="text-right">Price (₹/qtl)</TableHead>
              <TableHead className="text-center">Date</TableHead>
              <TableHead className="text-center">Age</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  No price data available.
                </TableCell>
              </TableRow>
            ) : (
              prices.map((p) => (
                <TableRow key={`${p.mandi_name}|${p.crop_id}`}>
                  <TableCell className="font-medium text-slate-900">
                    {p.mandi_name}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {p.district}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {p.crop_name_kn} ({p.crop_name_en})
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {p.modal_price.toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="text-center text-sm text-gray-600">
                    {p.price_date}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                      p.is_stale
                        ? "bg-red-100 text-red-700"
                        : p.price_age_days > 2
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-green-100 text-green-800"
                    }`}>
                      {p.price_age_days} day(s){" "}
                      {p.is_stale ? "stale" : "fresh"}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-gray-500">
        Prices older than 7 days are excluded from advice calculations.
        Prices older than 2 days show a staleness caveat on voice calls.
      </p>
    </div>
  )
}
