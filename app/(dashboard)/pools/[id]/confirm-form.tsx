"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function ConfirmPoolForm({ poolId }: { poolId: string }) {
  const router = useRouter()
  const [pickupDate, setPickupDate] = useState("")
  const [pickupPlace, setPickupPlace] = useState("")
  const [vehicleNote, setVehicleNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultMsg, setResultMsg] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResultMsg(null)
    setSubmitting(true)

    try {
      const res = await fetch(`/api/pools/${poolId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickup_date: pickupDate,
          pickup_place: pickupPlace,
          vehicle_note: vehicleNote || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? "Failed to confirm pool")
      } else {
        setResultMsg(`Started ${json.calls_started ?? 0} confirmation call(s).`)
        router.refresh()
      }
    } catch {
      setError("Network error while confirming pool")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="col-span-2 md:col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Pickup date
          </label>
          <Input
            type="date"
            required
            value={pickupDate}
            onChange={(e) => setPickupDate(e.target.value)}
          />
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Pickup place
          </label>
          <Input
            required
            value={pickupPlace}
            onChange={(e) => setPickupPlace(e.target.value)}
            placeholder="e.g. Mulbagal bus stand"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Vehicle note
        </label>
        <Input
          value={vehicleNote}
          onChange={(e) => setVehicleNote(e.target.value)}
          placeholder="e.g. Tata 407, KA-07-XXXX"
        />
      </div>
      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</div>
      )}
      {resultMsg && (
        <div className="text-sm text-green-700 bg-green-50 p-3 rounded-lg">{resultMsg}</div>
      )}
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Starting calls..." : "Confirm pool and notify members"}
      </Button>
    </form>
  )
}
