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
    fpoId: string | null
    cropId: string
    saleWeek: string
  }>
}

interface ExistingPoolMemberRow {
  pool_id: string
  pools: { status: string } | { status: string }[] | null
}

/**
 * Persist proposed pools to the database. Idempotent: skips pools where any
 * member request is already in a non-cancelled pool.
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
    if (p.memberIds.length === 0) {
      skipped++
      continue
    }

    // Check if ANY member is already in a non-cancelled pool
    const { data: existingMembers } = await supabase
      .from("pool_members")
      .select("pool_id, pools (status)")
      .in("sale_request_id", p.memberIds)

    const alreadyPooled = ((existingMembers ?? []) as ExistingPoolMemberRow[]).some((m) => {
      const poolObj = Array.isArray(m.pools) ? m.pools[0] : m.pools
      return poolObj && poolObj.status !== "cancelled"
    })

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

    if (poolError || !pool) {
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
