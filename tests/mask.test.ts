import { describe, it, expect } from "vitest"
import { maskPhone, maskDebt } from "../lib/data/mask"

describe("maskPhone", () => {
  it("masks E.164 numbers preserving last 4 digits", () => {
    const result = maskPhone("+919812345678")
    expect(result).toMatch(/\*+5678$/)
    expect(result).not.toContain("981234")
  })

  it("handles null/undefined", () => {
    expect(maskPhone(null)).toBe("unknown")
    expect(maskPhone(undefined)).toBe("unknown")
    expect(maskPhone("")).toBe("unknown")
  })

  it("masks short numbers", () => {
    expect(maskPhone("1234")).toBe("****")
    expect(maskPhone("123")).toBe("****")
  })

  it("does not expose full number", () => {
    const result = maskPhone("+919876543210")
    expect(result).not.toContain("987654")
  })
})

describe("maskDebt", () => {
  it("returns 'not_given' for null/undefined", () => {
    expect(maskDebt(null)).toBe("not_given")
    expect(maskDebt(undefined)).toBe("not_given")
  })

  it("returns magnitude band not exact amount", () => {
    expect(maskDebt(15000)).toBe("₹15k+")
    expect(maskDebt(999)).toBe("₹1k+")
    expect(maskDebt(0)).toBe("₹0k+")
  })
})
