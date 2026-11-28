import "server-only"

import { createServiceClient } from "../supabase/server"
import type { ProposedPool } from "./group"

export interface PoolingInputs {
  pools: Array<{
    type: ProposedPool["type"]
    memberIds: string[]
    totalQtls: number
    targetMandiId?: string
    targetWarehouseId?: string
    fpoId: string
    cropId: string
    saleWeek: string
  }>
}

/**
 * Persist proposed pools to the database. Idempotent: skips requests
 * already in a non-cancelled pool.
 */
export async function persistPools({
  supabase,
  pools,
}: {
  supabase: ReturnType<typeof createServiceClient>
  pools: PoolingInputs["pools"]
}): Promise<{ created: number; skipped: number }> {
  let created = 0
  let skipped = 0

  for (const p of pools) {
    // Check if any member is already in a non-cancelled pool
    const { data: existingMembers } = await supabase
      .from("pool_members")
      .select("pool_id, pools (status)")
      .eq("sale_request_id", p.memberIds[0])

    const alreadyPooled = existingMembers?.some(
      (m: any) =>
        m.pools && m.pools.status !== "cancelled" && m.pools.status !== "confirmed"
    )

    if (alreadyPooled) {
      skipped++
      continue
    }

    // Create pool
    const { data: pool, error: poolError } = await supabase
      .from("pools")
      .insert({
        fpo_id: p.fpoId,
        crop_id: p.cropId,
        type: p.type,
        target_mandi_id: p.targetMandiId ?? null,
        target_warehouse_id: p.targetWarehouseId ?? null,
        total_qtl: p.totalQtls,
        sale_week: p.saleWeek,
        status: "proposed",
      })
      .select("id")
      .single()

    if (poolError) {
      skipped++
      continue
    }

    // Add members
    for (const memberId of p.memberIds) {
      await supabase.from("pool_members").insert({
        pool_id: pool.id,
        sale_request_id: memberId,
        response: "pending",
      })

      // Mark request as pooled
      await supabase
        .from("sale_requests")
        .update({ status: "pooled" })
        .eq("id", memberId)
    }

    created++
  }

  return { created, skipped }
}
