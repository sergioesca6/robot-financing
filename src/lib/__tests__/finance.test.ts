import { describe, expect, it } from "vitest";
import {
  amortizationSchedule,
  calculateLease,
  calculateLoan,
  computeOfferEconomics,
  leasePaymentFromCap,
  loanPayment,
  purchaseTotal,
  requestedAmount,
  validateLeaseInput,
  validateLoanInput,
} from "../finance";

describe("loanPayment", () => {
  it("matches the standard amortizing formula", () => {
    // $100,000 at 6% for 60 months => $1,933.28
    expect(loanPayment(100000, 6, 60)).toBeCloseTo(1933.28, 2);
    // $50,000 at 8.5% for 48 months => $1,232.94 (rounded)
    expect(loanPayment(50000, 8.5, 48)).toBeCloseTo(1232.42, 2);
  });
  it("divides evenly at 0% APR", () => {
    expect(loanPayment(12000, 0, 24)).toBe(500);
  });
  it("returns 0 for non-positive inputs", () => {
    expect(loanPayment(0, 5, 12)).toBe(0);
    expect(loanPayment(1000, 5, 0)).toBe(0);
  });
});

describe("amortizationSchedule", () => {
  it("fully amortizes to zero and sums principal to the loan amount", () => {
    const rows = amortizationSchedule(75000, 7.25, 60);
    expect(rows).toHaveLength(60);
    expect(rows.at(-1)!.balance).toBe(0);
    const principal = rows.reduce((s, r) => s + r.principal, 0);
    expect(principal).toBeCloseTo(75000, 1);
  });
});

describe("calculateLoan", () => {
  const base = { price: 100000, downPayment: 10000, fees: 500, aprPercent: 7, termMonths: 60, financeFees: true, taxRatePercent: 0 };
  it("finances price minus down plus financed fees", () => {
    const r = calculateLoan(base);
    expect(r.amountFinanced).toBe(90500);
    expect(r.upfrontCost).toBe(10000);
    expect(r.totalPayments).toBeCloseTo(r.monthlyPayment * 60, 0);
    expect(r.totalInterest).toBeCloseTo(r.totalPayments - 90500, 2);
    expect(r.totalCost).toBeCloseTo(10000 + r.totalPayments, 2);
  });
  it("moves fees to upfront cost when not financed", () => {
    const r = calculateLoan({ ...base, financeFees: false });
    expect(r.amountFinanced).toBe(90000);
    expect(r.upfrontCost).toBe(10500);
  });
  it("applies tax only when explicitly configured", () => {
    expect(calculateLoan(base).taxAmount).toBe(0);
    const taxed = calculateLoan({ ...base, taxRatePercent: 8 });
    expect(taxed.taxAmount).toBe(8000);
    expect(taxed.amountFinanced).toBe(98500);
  });
});

describe("calculateLease", () => {
  const base = {
    price: 60000,
    upfront: 3000,
    fees: 600,
    termMonths: 36,
    residualPercent: 25,
    moneyFactor: 0.0025,
    capitalizeFees: true,
    taxRatePercent: 0,
  };
  it("uses depreciation + rent charge on the capitalized cost", () => {
    const r = calculateLease(base);
    expect(r.capitalizedCost).toBe(57600);
    expect(r.residual).toBe(15000);
    expect(r.depreciationPerMonth).toBeCloseTo((57600 - 15000) / 36, 2);
    expect(r.rentChargePerMonth).toBeCloseTo((57600 + 15000) * 0.0025, 2);
    expect(r.monthlyPayment).toBeCloseTo(1183.33 + 181.5, 1);
    expect(r.totalLeasePayments).toBeCloseTo(r.monthlyPayment * 36, 2);
    expect(r.equivalentApr).toBeCloseTo(6, 2);
  });
  it("keeps fees upfront when not capitalized and adds buyout when purchased", () => {
    const r = calculateLease({ ...base, capitalizeFees: false });
    expect(r.capitalizedCost).toBe(57000);
    expect(r.upfrontCost).toBe(3600);
    expect(r.totalCostIfPurchased).toBeCloseTo(r.totalCostIfReturned + r.residual, 2);
  });
  it("prefers explicit residual value over percentage", () => {
    expect(calculateLease({ ...base, residualValue: 20000 }).residual).toBe(20000);
  });
  it("adds explicit tax to the monthly payment only", () => {
    const r = calculateLease({ ...base, taxRatePercent: 10 });
    expect(r.taxPerMonth).toBeCloseTo(r.monthlyPayment / 11, 1);
  });
  it("lease payment is not computed from loan APR maths", () => {
    // Zero money factor leaves only depreciation.
    const p = leasePaymentFromCap(50000, 20000, 0, 30);
    expect(p.payment).toBe(1000);
  });
});

describe("validation", () => {
  it("flags invalid loan inputs", () => {
    const e = validateLoanInput({ price: 0, downPayment: -1, fees: -5, aprPercent: 70, termMonths: 0, financeFees: true, taxRatePercent: 0 });
    expect(Object.keys(e)).toEqual(expect.arrayContaining(["price", "downPayment", "fees", "aprPercent", "termMonths"]));
  });
  it("flags residual >= capitalized cost", () => {
    const e = validateLeaseInput({ price: 10000, upfront: 0, fees: 0, termMonths: 24, residualValue: 12000, moneyFactor: 0.002, capitalizeFees: true, taxRatePercent: 0 });
    expect(e.residual).toBeDefined();
  });
  it("accepts sensible inputs", () => {
    expect(validateLoanInput({ price: 50000, downPayment: 5000, fees: 0, aprPercent: 7, termMonths: 48, financeFees: true, taxRatePercent: 0 })).toEqual({});
  });
});

describe("computeOfferEconomics", () => {
  it("loan: total cost = down + fees + scheduled payments", () => {
    const e = computeOfferEconomics({ product: "loan", approvedAmount: 90000, downPayment: 10000, apr: 7, termMonths: 60, fees: 495 });
    expect(e.monthlyPayment).toBeCloseTo(loanPayment(90000, 7, 60), 2);
    expect(e.upfrontCost).toBe(10495);
    expect(e.totalCost).toBeGreaterThan(90000 + 10495);
  });
  it("lease: total excludes buyout", () => {
    const e = computeOfferEconomics({ product: "lease", approvedAmount: 50000, downPayment: 2000, moneyFactor: 0.0024, termMonths: 36, fees: 400, residualValue: 15000 });
    expect(e.totalCost).toBeCloseTo(2400 + e.monthlyPayment * 36, 2);
  });
});

describe("purchase helpers", () => {
  it("computes totals and requested amount", () => {
    const total = purchaseTotal({ quantity: 2, unitPrice: 50000, installationCost: 3000, shippingCost: 1500 });
    expect(total).toBe(104500);
    expect(requestedAmount(total, 10000, 2500)).toBe(92000);
    expect(requestedAmount(1000, 5000, 0)).toBe(0);
  });
});
