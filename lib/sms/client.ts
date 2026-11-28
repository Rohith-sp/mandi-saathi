import "server-only"

import { Twilio } from "twilio"
import { maskPhone } from "../data/mask"
import { createServiceClient } from "../supabase/server"

/**
 * Twilio SMS client. Sends advice and pool-confirmation SMS.
 * SMS failure never fails the caller: errors are caught, logged to sms_log,
 * and the call continues.
 */

let twilioClient: Twilio | null = null

function getTwilioClient(): Twilio | null {
  if (twilioClient) return twilioClient
  const sid = process.env.TWILIO_SID
  const token = process.env.TWILIO_TOKEN
  if (!sid || !token) return null
  twilioClient = new Twilio(sid, token)
  return twilioClient
}

export interface SmsResult {
  queued: boolean
  providerId?: string
  error?: string
}

/**
 * Send an SMS. On failure, writes to sms_log and returns { queued: false }.
 * Never throws.
 */
export async function sendSms({
  to,
  body,
  kind,
  farmerId,
  supabase,
}: {
  to: string
  body: string
  kind: "advice" | "pool_confirm"
  farmerId?: string
  supabase: ReturnType<typeof createServiceClient>
}): Promise<SmsResult> {
  const client = getTwilioClient()
  const from = process.env.TWILIO_FROM
  const testPhone = process.env.TEST_PHONE

  const target = to || testPhone || from
  if (!client || !from || !target) {
    await logSmsFailure({ supabase, farmerId, kind, error: "sms_not_configured" })
    return { queued: false, error: "sms_not_configured" }
  }

  try {
    const msg = await client.messages.create({
      body,
      from,
      to: target,
    })

    await supabase.from("sms_log").insert({
      farmer_id: farmerId ?? null,
      kind,
      provider_id: msg.sid,
      status: "queued",
    })

    return { queued: true, providerId: msg.sid }
  } catch (err) {
    await logSmsFailure({
      supabase,
      farmerId,
      kind,
      error: err instanceof Error ? err.message : "unknown_sms_error",
    })
    // Mask phone in any console output
    console.error(`SMS failed to ${maskPhone(target)}: ${err instanceof Error ? err.message : "unknown"}`)
    return { queued: false, error: "sms_send_failed" }
  }
}

async function logSmsFailure(inputs: {
  supabase: ReturnType<typeof createServiceClient>
  farmerId?: string
  kind: "advice" | "pool_confirm"
  error: string
}): Promise<void> {
  try {
    await inputs.supabase.from("sms_log").insert({
      farmer_id: inputs.farmerId ?? null,
      kind: inputs.kind,
      provider_id: null,
      status: "failed",
      error: inputs.error,
    })
  } catch {
    // If we can't even log, there's nothing more to do
  }
}
