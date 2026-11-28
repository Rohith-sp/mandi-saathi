import { describe, it, expect } from "vitest"
import { adviceSmsTemplate, poolConfirmSmsTemplate, validateTemplate } from "../lib/sms/templates"

describe("SMS templates", () => {
  describe("adviceSmsTemplate", () => {
    const template = adviceSmsTemplate({
      to: "+919999999999",
      crop: "ragi",
      quantityQtls: 15,
      options: [
        { label: "Sell at Kolar", sayAmountRs: 28900, confidence: "high" },
        { label: "Shared truck to Chintamani", sayAmountRs: 33000, confidence: "high" },
      ],
      poolAvailable: true,
    })

    it("has kind 'advice'", () => {
      expect(template.kind).toBe("advice")
    })

    it("body is non-empty", () => {
      expect(template.body.length).toBeGreaterThan(0)
    })

    it("segment count is ≤ 3 UCS-2 segments", () => {
      const result = validateTemplate(template)
      expect(result.ok).toBe(true)
      expect(result.segments).toBeLessThanOrEqual(3)
    })

    it("body length is ≤ 210 characters", () => {
      expect(template.body.length).toBeLessThanOrEqual(210)
    })
  })

  describe("poolConfirmSmsTemplate", () => {
    const template = poolConfirmSmsTemplate({
      to: "+919999999999",
      crop: "ragi",
      pickupDate: "2026-12-05",
      pickupPlace: "Mulbagal bus stand",
      vehicleNote: "Tata 407",
    })

    it("has kind 'pool_confirm'", () => {
      expect(template.kind).toBe("pool_confirm")
    })

    it("body is non-empty", () => {
      expect(template.body.length).toBeGreaterThan(0)
    })

    it("segment count is ≤ 3 UCS-2 segments", () => {
      const result = validateTemplate(template)
      expect(result.ok).toBe(true)
      expect(result.segments).toBeLessThanOrEqual(3)
    })
  })

  describe("validateTemplate", () => {
    it("accepts templates with ≤ 3 segments", () => {
      expect(validateTemplate({ kind: "advice", to: "", body: "hello", segments: 1 }).ok).toBe(true)
    })

    it("rejects templates with > 3 segments", () => {
      expect(validateTemplate({ kind: "advice", to: "", body: "", segments: 4 }).ok).toBe(false)
    })
  })
})
