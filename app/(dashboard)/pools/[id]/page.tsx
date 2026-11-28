import { createServiceClient } from "@/lib/supabase/server"
import { getPoolWithMembers } from "@/lib/data/dashboard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default async function PoolDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createServiceClient()
  const poolData = await getPoolWithMembers({
    supabase,
    poolId: params.id,
    fpoId: "demo-fpo-id",
  })

  if (!poolData) {
    return (
      <div className="py-10 text-center">
        <h1 className="text-xl font-bold text-slate-900">Pool not found</h1>
      </div>
    )
  }

  const { pool, members } = poolData

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Pool #{pool.id.slice(0, 8)}
          </h1>
          <p className="text-sm text-gray-600">
            {pool.type === "truck" ? "Shared truck pool" : "Warehouse pool"}
          </p>
        </div>
        <div className="flex gap-2">
          {pool.status === "proposed" && (
            <button className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
              Confirm Pool
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">Pool details</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Type</dt>
              <dd className="font-medium">{pool.type}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Total quantity</dt>
              <dd className="font-medium">{pool.total_qtl} qtl</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Status</dt>
              <dd className="font-medium">{pool.status}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Target mandi</dt>
              <dd className="font-medium">
                {pool.target_mandi_name || "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">Pickup</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Date</dt>
              <dd className="font-medium">{pool.pickup_date || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Place</dt>
              <dd className="font-medium">{pool.pickup_place || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Vehicle</dt>
              <dd className="font-medium">{pool.vehicle_note || "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">Members</h2>
          <p className="text-sm text-gray-600 mb-2">
            {members.length} member(s)
          </p>
          <div className="space-y-1">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-1 text-sm border-b border-gray-100 last:border-0">
                <span className="text-slate-900">
                  Request {(m.sale_requests as any)?.[0]?.id?.slice(0, 8) ?? "—"}
                </span>
                <span className={`text-xs font-medium ${
                  m.response === "yes"
                    ? "text-green-600"
                    : m.response === "no"
                      ? "text-red-600"
                      : "text-gray-500"
                }`}>
                  {m.response === "pending" ? "Pending" : m.response === "yes" ? "Yes" : "No"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {pool.status === "proposed" && (
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Confirm Pool</h2>
          <form className="space-y-4 max-w-md">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-2 md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pickup date
                </label>
                <Input type="date" />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pickup place
                </label>
                <Input placeholder="e.g. Mulbagal bus stand" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vehicle note
              </label>
              <Input placeholder="e.g. Tata 407, KA-07-XXXX" />
            </div>
            <Button type="submit" className="w-full">
              Confirm pool and notify members
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
