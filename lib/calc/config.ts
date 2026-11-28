// Mandi Saathi — pure calculation config
// All cost constants live here and only here. Values marked ASSUMPTION are
// placeholders until confirmed by field calls (see CALC_SPEC.md §2).
// Per-mandi / per-warehouse overrides come from the DB and are passed in as
// parameters; this file holds the defaults only.

export const CALC_CONFIG = {
  // Commission: fraction of gross taken by the mandi commission agent.
  // ASSUMPTION. Per-mandi override via mandis.commission_pct.
  COMMISSION_PCT: 0.02,

  // Local tractor/tempo trip: fixed cost per trip.
  // ASSUMPTION.
  LOCAL_TRIP_COST: 500,
  LOCAL_TRIP_CAPACITY_QTL: 20,

  // Truck: fixed base + per-km (one-way km, return trip included in rate).
  // ASSUMPTION.
  TRUCK_BASE_COST: 1000,
  TRUCK_COST_PER_KM: 30,
  TRUCK_CAPACITY_QTL: 50,

  // Pooling thresholds.
  POOL_MIN_FILL: 0.6, // pool proposed at >= 60% of truck capacity
  POOL_RADIUS_KM: 15,
  FAR_MANDI_MAX_KM: 80, // mandis beyond this are ignored

  // Warehouse storage.
  // ASSUMPTION. Overridden by warehouses.charge_per_qtl_month.
  WAREHOUSE_COST_PER_QTL_MONTH: 10,

  // Pledge loan (KCC).
  LOAN_RATE_PA: 0.07,
  LOAN_LTV: 0.75,
  LOAN_MIN: 100000, // SBI agri pledge-loan minimum

  // Store option horizon (4 weeks).
  STORE_MONTHS: 1,

  // Price staleness.
  PRICE_STALE_DAYS: 7, // mandis with older prices are excluded
  PRICE_OLD_DAYS: 2, // older than this -> spoken caveat
} as const

export type CalcConfig = typeof CALC_CONFIG

// Crop properties mirroring the `crops` table in the DB.
// Do not invent crops; these match supabase/migrations/0001_init.sql.
export const CROPS: Record<string, {
  storable: boolean
  transitLossPct: number // fractional transit loss for far mandi
  storageLossPctPerMonth: number // fractional storage loss per month
}> = {
  ragi: { storable: true, transitLossPct: 0, storageLossPctPerMonth: 0.005 },
  tur: { storable: true, transitLossPct: 0, storageLossPctPerMonth: 0.005 },
  tomato: { storable: false, transitLossPct: 0.03, storageLossPctPerMonth: 0 },
}

export const SUPPORTED_CROPS = Object.keys(CROPS)
