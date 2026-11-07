import { describe, expect, it } from "vitest";
import { lenders, programs } from "@/data/reference";
import { evaluateLender, matchLenders, type MatchInput } from "../matching";

const usBusiness: MatchInput = {
  country: "US",
  currency: "USD",
  customerType: "business",
  financingType: "loan",
  requestedAmount: 120000,
  termMonths: 60,
  category: "industrial",
  profile: { credit: "good", annualRevenue: 5_000_000, yearsOperating: 8 },
  yearsInBusiness: 8,
};

const lender = (id: string) => lenders.find((l) => l.id === id)!;

describe("lender matching (mock rule-based screening)", () => {
  it("flags a clean US business loan as a potential match", () => {
    const m = evaluateLender(usBusiness, lender("lnd-northbridge"), programs);
    expect(m.verdict).toBe("potential");
  });

  it("rejects lenders that do not serve the country", () => {
    const m = evaluateLender(usBusiness, lender("lnd-maple"), programs);
    expect(m.verdict).toBe("ineligible");
    expect(m.checks.find((c) => c.key === "country")?.result).toBe("fail");
  });

  it("rejects when the product is unsupported (lease-only vs loan request)", () => {
    const m = evaluateLender(usBusiness, lender("lnd-summit"), programs);
    expect(m.verdict).toBe("ineligible");
  });

  it("marks inactive lenders as not eligible", () => {
    const m = evaluateLender({ ...usBusiness, customerType: "individual" }, lender("lnd-redwood"), programs);
    expect(m.verdict).toBe("ineligible");
    expect(m.checks.find((c) => c.key === "active")?.result).toBe("fail");
  });

  it("asks for review when credit is one tier below the guideline", () => {
    const m = evaluateLender({ ...usBusiness, profile: { ...usBusiness.profile, credit: "fair" } }, lender("lnd-northbridge"), programs);
    expect(m.verdict).toBe("review");
  });

  it("rejects when the amount is well outside the program range", () => {
    const m = evaluateLender({ ...usBusiness, requestedAmount: 5000 }, lender("lnd-northbridge"), programs);
    expect(m.verdict).toBe("ineligible");
  });

  it("applies robot-category restrictions", () => {
    const m = evaluateLender({ ...usBusiness, category: "humanoid" }, lender("lnd-northbridge"), programs);
    expect(m.verdict).toBe("ineligible");
  });

  it("matches Canadian consumer leases to CAD lenders only", () => {
    const input: MatchInput = {
      country: "CA",
      currency: "CAD",
      customerType: "individual",
      financingType: "lease",
      requestedAmount: 45000,
      termMonths: 36,
      category: "humanoid",
      profile: { credit: "good" },
    };
    const results = matchLenders(input, lenders, programs);
    const eligible = results.filter((r) => r.verdict !== "ineligible").map((r) => r.lender.id);
    expect(eligible).toEqual(["lnd-maple"]);
  });

  it("sorts potential matches before review and ineligible", () => {
    const results = matchLenders(usBusiness, lenders, programs);
    const order = results.map((r) => r.verdict);
    const rank = { potential: 0, review: 1, ineligible: 2 } as const;
    expect([...order].sort((a, b) => rank[a] - rank[b])).toEqual(order);
  });
});
