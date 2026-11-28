/**
 * Privacy helpers: mask phone numbers and debt amounts for logging.
 * Never log full phone numbers or debt amounts in plain text.
 */

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "unknown"
  // E.164: +9198XXXXXXXX -> +91******1234
  const digits = phone.replace(/\D/g, "")
  if (digits.length <= 4) return "****"
  const last4 = digits.slice(-4)
  const masked = "*".repeat(Math.max(digits.length - 4, 0))
  // Preserve leading + if present
  const prefix = phone.startsWith("+") ? "+" : ""
  return `${prefix}${masked}${last4}`
}

export function maskDebt(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "not_given"
  return `₹${Math.round(amount / 1000)}k+` // only show magnitude band
}
