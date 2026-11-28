import "server-only"

/**
 * Bolna outbound call client.
 * Used by /api/pools/[id]/confirm to trigger pool-confirmation calls.
 * Exact payload verified against Bolna API docs (VOICE_AGENT.md §5).
 */

export interface BolnaOutboundCallInput {
  agentId: string
  recipientPhoneNumber: string
  userData: Record<string, unknown>
}

export interface BolnaOutboundCallResult {
  success: boolean
  callId?: string
  error?: string
}

export async function bolnaOutboundCall(
  input: BolnaOutboundCallInput
): Promise<BolnaOutboundCallResult> {
  const apiKey = process.env.BOLNA_API_KEY
  if (!apiKey) {
    return { success: false, error: "BOLNA_API_KEY not configured" }
  }

  try {
    const res = await fetch("https://api.bolna.ai/call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: input.agentId,
        recipient_phone_number: input.recipientPhoneNumber,
        user_data: input.userData,
      }),
    })

    if (!res.ok) {
      return {
        success: false,
        error: `Bolna API ${res.status}`,
      }
    }

    const json = await res.json()
    return { success: true, callId: json.call_id ?? json.id }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "unknown_bolna_error",
    }
  }
}
