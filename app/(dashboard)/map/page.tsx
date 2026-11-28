import { createServerClient } from "@/lib/supabase/server"
import { listRequests } from "@/lib/data/dashboard"

export default async function MapPage() {
  const supabase = await createServerClient()
  const requests = await listRequests({
    supabase,
    fpoId: "demo-fpo-id",
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Request Map</h1>
        <p className="text-sm text-gray-600">
          Farmer sale request locations near your FPO
        </p>
      </div>

      <div className="aspect-video w-full rounded-lg border border-gray-200 bg-gray-100 overflow-hidden relative">
        {/* Map placeholder - Leaflet integration would go here */}
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="text-yellow-500 text-4xl mb-2">📍</div>
            <h3 className="text-sm font-medium text-slate-900">Interactive Map</h3>
            <p className="text-xs text-gray-500 mt-1">
              Leaflet + OpenStreetMap integration. Markers show farmer sale
              request locations within 15 km radius for pooling.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              <th className="text-left px-4 py-2 text-gray-500 font-medium">Village</th>
              <th className="text-left px-4 py-2 text-gray-500 font-medium">Crop</th>
              <th className="text-right px-4 py-2 text-gray-500 font-medium">Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {requests.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center py-8 text-gray-500">
                  No requests to display.
                </td>
              </tr>
            ) : (
              requests.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-slate-900">{r.village_name}</td>
                  <td className="px-4 py-3 text-slate-900">
                    {r.crop_name_kn} ({r.crop_name_en})
                  </td>
                  <td className="px-4 py-3 text-right text-slate-900 font-medium">
                    {r.quantity_qtl} qtl
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
