import { createServerClient } from "@/lib/supabase/server"
import { listPools } from "@/lib/data/dashboard"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default async function PoolsPage() {
  const supabase = await createServerClient()
  const pools = await listPools({
    supabase,
    fpoId: "demo-fpo-id",
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pools</h1>
          <p className="text-sm text-gray-600">
            Proposed and confirmed shared truck / warehouse pools
          </p>
        </div>
        <Button>Propose Pool</Button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pool</TableHead>
              <TableHead className="text-center">Type</TableHead>
              <TableHead className="text-right">Qty (qtl)</TableHead>
              <TableHead className="text-center">Members</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pools.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  No pools found.
                </TableCell>
              </TableRow>
            ) : (
              pools.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium text-slate-900">
                    Pool #{p.id.slice(0, 8)}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      p.type === "truck"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-green-100 text-green-800"
                    }`}>
                      {p.type === "truck" ? "Truck" : "Warehouse"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {p.total_qtl}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {p.member_count}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      p.status === "proposed"
                        ? "bg-yellow-100 text-yellow-800"
                        : p.status === "confirming"
                          ? "bg-blue-100 text-blue-800"
                          : p.status === "confirmed"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                    }`}>
                      {p.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm text-gray-500">
                    {p.target_mandi_name || "—"}
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
