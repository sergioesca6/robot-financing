/**
 * Robot Trader integration boundary (NOT implemented — no cross-app calls).
 *
 * Target flow:
 *   Customer selects a robot in Robot Trader
 *   → dealership creates a financing application (prefilled from the deal)
 *   → application reviewed → lender submissions managed → offer accepted
 *   → financing completed → Robot Trader receives the updated financing status.
 *
 * This module documents the payload contracts and provides pure mapping
 * helpers + mock examples so the real sync can be added later behind a server
 * route with proper authentication.
 */
import type { ApplicationStatus, Country, Currency, FinancingApplication, RobotCategory } from "@/domain/types";

/** Inbound: what Robot Trader would send when a customer selects a robot. */
export interface RobotTraderDealPayload {
  robotTraderCustomerId: string;
  robotTraderListingId: string;
  robotTraderDealId: string;
  customer: { name: string; companyName?: string; email: string; phone?: string; country: Country; region: string };
  robot: { manufacturer: string; model: string; category: RobotCategory; condition: "new" | "used"; quantity: number };
  agreedPurchasePrice: number;
  currency: Currency;
}

/** Outbound: what Finance would push back as the deal progresses. */
export interface FinancingStatusUpdatePayload {
  robotTraderDealId: string;
  financingApplicationId: string;
  financingStatus: ApplicationStatus;
  fundedAmount?: number;
  currency: Currency;
  updatedAt: string;
}

export interface RobotTraderGateway {
  fetchDeal(dealId: string): Promise<RobotTraderDealPayload>;
  pushFinancingStatus(update: FinancingStatusUpdatePayload): Promise<void>;
}

export const MOCK_DEAL_PAYLOAD: RobotTraderDealPayload = {
  robotTraderCustomerId: "RT-C-3150",
  robotTraderListingId: "RT-L-48450",
  robotTraderDealId: "RT-D-9250",
  customer: {
    name: "Jordan Ellis",
    companyName: "Ellis Precision Machining",
    email: "jordan@ellis-machining.example",
    phone: "+1 (555) 010-2200",
    country: "US",
    region: "OH",
  },
  robot: { manufacturer: "Universal Robots", model: "UR10e", category: "collaborative", condition: "new", quantity: 2 },
  agreedPurchasePrice: 104000,
  currency: "USD",
};

export function statusUpdateFor(app: FinancingApplication): FinancingStatusUpdatePayload | null {
  const dealId = app.robotTrader?.dealId;
  if (!dealId) return null;
  return {
    robotTraderDealId: dealId,
    financingApplicationId: app.id,
    financingStatus: app.status,
    fundedAmount: app.fundedAmount,
    currency: app.currency,
    updatedAt: app.lastActivityAt,
  };
}

/** Wizard prefill derived from a Robot Trader deal. */
export function prefillFromDeal(p: RobotTraderDealPayload) {
  return {
    customerType: p.customer.companyName ? ("business" as const) : ("individual" as const),
    name: p.customer.name,
    companyName: p.customer.companyName ?? "",
    email: p.customer.email,
    phone: p.customer.phone ?? "",
    country: p.customer.country,
    region: p.customer.region,
    manufacturer: p.robot.manufacturer,
    model: p.robot.model,
    category: p.robot.category,
    condition: p.robot.condition,
    quantity: p.robot.quantity,
    unitPrice: Math.round(p.agreedPurchasePrice / p.robot.quantity),
    currency: p.currency,
    robotTrader: {
      customerId: p.robotTraderCustomerId,
      listingId: p.robotTraderListingId,
      dealId: p.robotTraderDealId,
    },
  };
}
