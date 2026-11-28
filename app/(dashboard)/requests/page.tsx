import { createServiceClient } from "@/lib/supabase/server"
import { listRequests } from "@/lib/data/dashboard"
import { maskPhone } from "@/lib/data/mask"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import {
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"

export default async function RequestsPage() {
  const supabase = createServiceClient()
  const [searchParams] = await Promise.resolve<[URLSearchParams]>([
    new URLSearchParams(),
  ])

  // In Server Component, we'd read searchParams from props. Using a placeholder
  // since Next.js 15 makes searchParams a Promise.
  const requests = await listRequests({
    supabase,
    fpoId: "demo-fpo-id", // resolved from operator session in middleware
    crop: undefined,
    week: undefined,
    status: undefined,
  })

  const crops = [...new Set(requests.map((r) => r.crop_id))]

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sale Requests</h1>
          <p className="text-sm text-gray-600">
            Farmer sale requests from your FPO
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <div className="relative w-full sm:w-48">
            <Input placeholder="Filter by crop or village..." />
          </div>
          <Select defaultValue="all">
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="pooled">Pooled</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Button>Apply</Button>
        </div>
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
                    {maskPhone("+919999999999")}
                  </TableCell>
                  <TableCell>{r.village_name}</TableCell>
                  <TableCell className="text-center text-sm">
                    {r.crop_name_kn} ({r.crop_name_en})
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {r.quantity_qtl}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {r.debt_rupees > 0 ? `₹${r.debt_rupees.toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      r.status === "open"
                        ? "bg-yellow-100 text-yellow-800"
                        : r.status === "pooled"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-800"
                    }`}>
                      {r.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {r.pool_interest ? (
                      <span className="text-green-600 font-medium">Yes</span>
                    ) : (
                      <span className="text-gray-500">No</span>
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
