import type {
  AppSettings,
  Commission,
  FinancingApplication,
  FinancingOffer,
  Lender,
} from "@/domain/types";
import { round2 } from "./finance";
import { uid } from "./id";

/**
 * Commissions are derived ONLY from explicitly configured rules:
 *  - lender dealer-fee % of funded amount (Lender.commission.dealerFeePercent)
 *  - lender flat financing fee (Lender.commission.financingFeeFlat)
 *  - salesperson % of funded amount (settings.commissionRules, per-employee override)
 * They are never inferred from loan interest. Demo rules are illustrative and
 * make no claim about legally permitted compensation arrangements.
 */
export function salespersonPercent(settings: AppSettings, employeeId: string): number {
  return settings.commissionRules.overrides[employeeId] ?? settings.commissionRules.defaultPercent;
}

export function buildCommissionLines(args: {
  application: FinancingApplication;
  offer: FinancingOffer;
  lender: Lender;
  settings: AppSettings;
  now: string;
}): Commission[] {
  const { application, offer, lender, settings, now } = args;
  const fundingAmount = offer.approvedAmount;
  const base = {
    applicationId: application.id,
    lenderId: lender.id,
    fundingAmount,
    currency: application.currency,
    status: "estimated" as const,
    createdAt: now,
  };
  const lines: Commission[] = [];
  if (lender.commission.dealerFeePercent > 0) {
    lines.push({
      ...base,
      id: uid("com"),
      kind: "dealer_fee",
      basis: "percent",
      rate: lender.commission.dealerFeePercent,
      estimated: round2((fundingAmount * lender.commission.dealerFeePercent) / 100),
    });
  }
  if (lender.commission.financingFeeFlat > 0) {
    lines.push({
      ...base,
      id: uid("com"),
      kind: "financing_fee",
      basis: "flat",
      rate: lender.commission.financingFeeFlat,
      estimated: round2(lender.commission.financingFeeFlat),
    });
  }
  const pct = salespersonPercent(settings, application.assignedEmployeeId);
  if (pct > 0) {
    lines.push({
      ...base,
      id: uid("com"),
      kind: "salesperson",
      employeeId: application.assignedEmployeeId,
      basis: "percent",
      rate: pct,
      estimated: round2((fundingAmount * pct) / 100),
    });
  }
  return lines;
}

export function recalcEstimated(c: Commission): number {
  return c.basis === "percent" ? round2((c.fundingAmount * c.rate) / 100) : round2(c.rate);
}
