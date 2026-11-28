import { createServerClient } from "@/lib/supabase/server"
import { getOperatorFpoId, getPoolWithMembers } from "@/lib/data/dashboard"
import { maskPhone } from "@/lib/data/mask"
import { ConfirmPoolForm } from "./confirm-form"

export default async function PoolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerClient()
  const fpoId = await getOperatorFpoId(supabase)
  const poolData = fpoId
    ? await getPoolWithMembers({
        supabase,
        poolId: id,
        fpoId,
      })
    : null

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
              <dd className="font-medium">{pool.target_mandi_name || "—"}</dd>
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
              <div
                key={m.id}
                className="flex items-center justify-between py-1 text-sm border-b border-gray-100 last:border-0"
              >
                <span className="text-slate-900">
                  {maskPhone(m.farmer_phone)} ({m.quantity_qtl} qtl)
                </span>
                <span
                  className={`text-xs font-medium ${
                    m.response === "yes"
                      ? "text-green-600"
                      : m.response === "no"
                        ? "text-red-600"
                        : "text-gray-500"
                  }`}
                >
                  {m.response === "pending"
                    ? "Pending"
                    : m.response === "yes"
                      ? "Yes"
                      : m.response === "no"
                        ? "No"
                        : "No answer"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {pool.status === "proposed" && (
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Confirm Pool</h2>
          <ConfirmPoolForm poolId={pool.id} />
        </div>
      )}
    </div>
  )
}
