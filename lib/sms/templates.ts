/**
 * SMS message templates in Kannada + numerals.
 * All templates kept under 3 UCS-2 segments (≤ 210 chars, ~70 chars/segment).
 * UCS-2 encoding: each Kannada character counts as ~1-2 bytes; segment limit is 70 chars.
 */

export interface SmsTemplate {
  kind: "advice" | "pool_confirm"
  to: string
  body: string
  segments: number
}

/**
 * Advice SMS: summarizes the top spoken options.
 * body must be ≤ 210 chars for ≤ 3 UCS-2 segments.
 */
export function adviceSmsTemplate(inputs: {
  to: string
  crop: string
  quantityQtls: number
  options: Array<{ label: string; sayAmountRs: number; confidence: string }>
  poolAvailable: boolean
}): SmsTemplate {
  const { to, crop, quantityQtls, options, poolAvailable } = inputs

  const top = options.slice(0, 3)
  const lines = top.map((o) => `${o.label}: ₹${o.sayAmountRs.toLocaleString("en-IN")} (${o.confidence})`)
  const poolLine = poolAvailable ? "\nShared truck available - FPO will call." : ""

  let body = `ಮಂಡಿ ಸಾಥಿ: ${crop} ${quantityQtls} ಕ್ವಿಂಟಾಲ್\n${lines.join("\n")}${poolLine}\nನಿರ್ಧಾರ ನಿಮ್ಮದು.`

  // Ensure ≤ 3 UCS-2 segments (≤ 210 chars)
  if (body.length > 210) {
    body = body.slice(0, 207) + "..."
  }

  return {
    kind: "advice",
    to,
    body,
    segments: Math.ceil(body.length / 70),
  }
}

/**
 * Pool confirmation SMS: date, place, vehicle/warehouse details.
 */
export function poolConfirmSmsTemplate(inputs: {
  to: string
  crop: string
  pickupDate: string
  pickupPlace: string
  vehicleNote?: string
  warehouseNote?: string
}): SmsTemplate {
  const { to, crop, pickupDate, pickupPlace, vehicleNote, warehouseNote } = inputs

  const detail = vehicleNote
    ? `ವಾಹನ: ${vehicleNote}`
    : warehouseNote
      ? `ಗೋದಾಮು: ${warehouseNote}`
      : ""

  let body = `ಮಂಡಿ ಸಾಥಿ ಹಂಚಿಕೆ: ${crop}\nದಿನಾಂಕ: ${pickupDate}\nಸ್ಥಳ: ${pickupPlace}\n${detail}\nಹೌದು/ಇಲ್ಲ ಎಂದು ತಿಳಿಸಿ.`

  if (body.length > 210) {
    body = body.slice(0, 207) + "..."
  }

  return {
    kind: "pool_confirm",
    to,
    body,
    segments: Math.ceil(body.length / 70),
  }
}

/**
 * Validate that a template fits within 3 UCS-2 segments.
 */
export function validateTemplate(template: SmsTemplate): { ok: boolean; segments: number } {
  return { ok: template.segments <= 3, segments: template.segments }
}
