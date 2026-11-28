import { createServerClient } from "@/lib/supabase/server"
import { getOperatorFpoId, listRequests } from "@/lib/data/dashboard"
import { maskPhone } from "@/lib/data/mask"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default async function RequestsPage({
  searchParams,
}: {
  searchParams?: Promise<{ crop?: string; status?: string; week?: string }>
}) {
  const sp = (await searchParams) ?? {}
  const cropFilter = sp.crop?.trim() || undefined
  const statusFilter = sp.status?.trim() || undefined
  const weekFilter = sp.week?.trim() || undefined

  const supabase = await createServerClient()
  const fpoId = await getOperatorFpoId(supabase)
  const requests = fpoId
    ? await listRequests({
        supabase,
        fpoId,
        crop: cropFilter,
        week: weekFilter,
        status: statusFilter,
      })
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sale Requests</h1>
          <p className="text-sm text-gray-600">
            Farmer sale requests from your FPO
          </p>
        </div>
        <form method="GET" className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Input
            name="crop"
            defaultValue={cropFilter ?? ""}
            placeholder="Crop id (e.g. ragi)..."
            className="w-full sm:w-44"
          />
          <select
            name="status"
            defaultValue={statusFilter ?? "all"}
            className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="pooled">Pooled</option>
            <option value="closed">Closed</option>
          </select>
          <Button type="submit">Apply</Button>
        </form>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Farmer</TableHead>
              <TableHead>Village</TableHead>
              <TableHead className="text-center">Crop</TableHead>
              <TableHead className="text-right">Qty (qtl)</TableHead>
              <TableHead className="text-right">Debt</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Pool</TableHead>
              <TableHead className="text-right">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                  No sale requests found.
                </TableCell>
              </TableRow>
            ) : (
              requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-slate-900">
                    {maskPhone(r.farmer_phone ?? "")}
                  </TableCell>
                  <TableCell>{r.village_name || "—"}</TableCell>
                  <TableCell className="text-center text-sm">
                    {r.crop_name_kn} ({r.crop_name_en})
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {r.quantity_qtl}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {r.debt_rupees > 0 ? `₹${r.debt_rupees.toLocaleString("en-IN")}` : "—"}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        r.status === "open"
                          ? "bg-yellow-100 text-yellow-800"
                          : r.status === "pooled"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {r.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {r.pool_interest === true ? (
                      <span className="text-green-600 font-medium">Yes</span>
                    ) : r.pool_interest === false ? (
                      <span className="text-gray-500">No</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm text-gray-500">
                    {new Date(r.created_at).toLocaleDateString("en-IN")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
