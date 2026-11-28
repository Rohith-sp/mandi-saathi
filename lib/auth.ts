import crypto from "node:crypto"

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

/**
 * Constant-time compare for the Bolna webhook secret (x-api-secret header).
 * Returns false when either value is missing.
 */
export function checkBolnaSecret(
  header: string | null,
  expected: string | undefined
): boolean {
  if (!header || !expected) return false
  return safeEqual(header, expected)
}

/**
 * Constant-time compare for the cron secret (Authorization: Bearer header).
 * Returns false when either value is missing.
 */
export function checkCronSecret(
  header: string | null,
  expected: string | undefined
): boolean {
  if (!header || !expected) return false
  return safeEqual(header, expected)
}
