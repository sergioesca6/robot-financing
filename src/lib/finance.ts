/**
 * Financial calculation utilities.
 *
 * LOAN methodology: standard amortizing installment loan, payment =
 *   P * r / (1 - (1 + r)^-n), with r = APR / 12 (APR treated as a nominal annual
 *   rate compounded monthly). A 0% rate divides evenly.
 *
 * LEASE methodology (kept deliberately separate from APR maths): the common
 * residual / money-factor lease model,
 *   depreciation = (capCost - residual) / term
 *   rent charge  = (capCost + residual) * moneyFactor
 *   payment      = depreciation + rent charge  (+ tax on the payment, if configured)
 *
 * All figures are ESTIMATES. Taxes are NOT assumed: they are only applied when a
 * tax rate is explicitly supplied. Lender-specific fees, registration, insurance
 * and jurisdiction-specific charges are excluded unless entered as fees.
 */

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function loanPayment(principal: number, aprPercent: number, termMonths: number): number {
  if (!(principal > 0) || !(termMonths > 0)) return 0;
  const r = aprPercent / 100 / 12;
  if (r === 0) return round2(principal / termMonths);
  const factor = Math.pow(1 + r, -termMonths);
  return round2((principal * r) / (1 - factor));
}

export interface AmortizationRow {
  n: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

export function amortizationSchedule(principal: number, aprPercent: number, termMonths: number): AmortizationRow[] {
  const rows: AmortizationRow[] = [];
  if (!(principal > 0) || !(termMonths > 0)) return rows;
  const r = aprPercent / 100 / 12;
  const pmt = loanPayment(principal, aprPercent, termMonths);
  let balance = principal;
  for (let n = 1; n <= termMonths; n++) {
    const interest = round2(balance * r);
    let payment = pmt;
    let principalPart = round2(payment - interest);
    if (n === termMonths) {
      // Final payment clears any rounding residue.
      principalPart = round2(balance);
      payment = round2(principalPart + interest);
    }
    balance = round2(balance - principalPart);
    rows.push({ n, payment, principal: principalPart, interest, balance: Math.max(0, balance) });
  }
  return rows;
}

export interface LoanInput {
  price: number;
  downPayment: number;
  fees: number;
  aprPercent: number;
  termMonths: number;
  /** When true, fees are rolled into the amount financed; otherwise paid upfront. */
  financeFees: boolean;
  /** Optional, explicit sales-tax assumption applied to the price and financed. 0 = excluded. */
  taxRatePercent: number;
}

export interface LoanResult {
  taxAmount: number;
  amountFinanced: number;
  monthlyPayment: number;
  totalPayments: number;
  totalInterest: number;
  upfrontCost: number;
  totalCost: number;
  schedule: AmortizationRow[];
}

export function calculateLoan(input: LoanInput): LoanResult {
  const taxAmount = round2((input.price * input.taxRatePercent) / 100);
  const amountFinanced = Math.max(
    0,
    round2(input.price + taxAmount - input.downPayment + (input.financeFees ? input.fees : 0)),
  );
  const monthlyPayment = loanPayment(amountFinanced, input.aprPercent, input.termMonths);
  const schedule = amortizationSchedule(amountFinanced, input.aprPercent, input.termMonths);
  const totalPayments = round2(schedule.reduce((s, r) => s + r.payment, 0));
  const totalInterest = round2(totalPayments - amountFinanced);
  const upfrontCost = round2(input.downPayment + (input.financeFees ? 0 : input.fees));
  return {
    taxAmount,
    amountFinanced,
    monthlyPayment,
    totalPayments,
    totalInterest,
    upfrontCost,
    totalCost: round2(upfrontCost + totalPayments),
    schedule,
  };
}

export interface LeaseInput {
  price: number;
  /** Upfront payment / capitalized-cost reduction. */
  upfront: number;
  fees: number;
  termMonths: number;
  /** Provide either residualValue or residualPercent. residualValue wins when > 0. */
  residualValue?: number;
  residualPercent?: number;
  moneyFactor: number;
  /** When true, fees are capitalized into the lease; otherwise paid upfront. */
  capitalizeFees: boolean;
  /** Optional, explicit tax on each monthly payment. 0 = excluded. */
  taxRatePercent: number;
}

export interface LeaseResult {
  capitalizedCost: number;
  residual: number;
  depreciationPerMonth: number;
  rentChargePerMonth: number;
  taxPerMonth: number;
  monthlyPayment: number;
  totalLeasePayments: number;
  upfrontCost: number;
  /** Total outlay if the equipment is returned at lease end. */
  totalCostIfReturned: number;
  /** Total outlay if the customer buys out at the residual. */
  totalCostIfPurchased: number;
  /** Informational only: money factor x 2400. */
  equivalentApr: number;
}

export function resolveResidual(price: number, residualValue?: number, residualPercent?: number): number {
  if (residualValue && residualValue > 0) return round2(residualValue);
  return round2((price * (residualPercent ?? 0)) / 100);
}

/** Core lease payment given a capitalized cost. Pre-tax. */
export function leasePaymentFromCap(
  capCost: number,
  residual: number,
  moneyFactor: number,
  termMonths: number,
): { depreciation: number; rent: number; payment: number } {
  if (!(termMonths > 0) || !(capCost > 0)) return { depreciation: 0, rent: 0, payment: 0 };
  const depreciation = (capCost - residual) / termMonths;
  const rent = (capCost + residual) * moneyFactor;
  return { depreciation: round2(depreciation), rent: round2(rent), payment: round2(depreciation + rent) };
}

export function calculateLease(input: LeaseInput): LeaseResult {
  const residual = resolveResidual(input.price, input.residualValue, input.residualPercent);
  const capitalizedCost = Math.max(
    0,
    round2(input.price - input.upfront + (input.capitalizeFees ? input.fees : 0)),
  );
  const base = leasePaymentFromCap(capitalizedCost, residual, input.moneyFactor, input.termMonths);
  const taxPerMonth = round2((base.payment * input.taxRatePercent) / 100);
  const monthlyPayment = round2(base.payment + taxPerMonth);
  const totalLeasePayments = round2(monthlyPayment * input.termMonths);
  const upfrontCost = round2(input.upfront + (input.capitalizeFees ? 0 : input.fees));
  return {
    capitalizedCost,
    residual,
    depreciationPerMonth: base.depreciation,
    rentChargePerMonth: base.rent,
    taxPerMonth,
    monthlyPayment,
    totalLeasePayments,
    upfrontCost,
    totalCostIfReturned: round2(upfrontCost + totalLeasePayments),
    totalCostIfPurchased: round2(upfrontCost + totalLeasePayments + residual),
    equivalentApr: round2(input.moneyFactor * 2400 * 100) / 100,
  };
}

/** Validation shared by the calculator UI. Returns field -> message. */
export function validateLoanInput(i: LoanInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (!(i.price > 0)) e.price = "Enter a purchase price greater than 0.";
  if (i.downPayment < 0) e.downPayment = "Down payment cannot be negative.";
  if (i.downPayment > i.price) e.downPayment = "Down payment cannot exceed the purchase price.";
  if (i.fees < 0) e.fees = "Fees cannot be negative.";
  if (i.aprPercent < 0 || i.aprPercent > 60) e.aprPercent = "Rate must be between 0% and 60%.";
  if (!Number.isInteger(i.termMonths) || i.termMonths < 1 || i.termMonths > 120) e.termMonths = "Term must be 1–120 whole months.";
  if (i.taxRatePercent < 0 || i.taxRatePercent > 30) e.taxRatePercent = "Tax assumption must be between 0% and 30%.";
  return e;
}

export function validateLeaseInput(i: LeaseInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (!(i.price > 0)) e.price = "Enter a robot price greater than 0.";
  if (i.upfront < 0) e.upfront = "Upfront payment cannot be negative.";
  if (i.upfront > i.price) e.upfront = "Upfront payment cannot exceed the price.";
  if (i.fees < 0) e.fees = "Fees cannot be negative.";
  if (!Number.isInteger(i.termMonths) || i.termMonths < 6 || i.termMonths > 96) e.termMonths = "Lease term must be 6–96 whole months.";
  if (i.moneyFactor < 0 || i.moneyFactor > 0.02) e.moneyFactor = "Money factor should be between 0 and 0.02000.";
  const residual = resolveResidual(i.price, i.residualValue, i.residualPercent);
  const cap = i.price - i.upfront + (i.capitalizeFees ? i.fees : 0);
  if (residual >= cap && cap > 0) e.residual = "Residual must be lower than the capitalized cost.";
  if (i.residualPercent !== undefined && (i.residualPercent < 0 || i.residualPercent > 90)) e.residual = "Residual must be 0–90% of price.";
  if (i.taxRatePercent < 0 || i.taxRatePercent > 30) e.taxRatePercent = "Tax assumption must be between 0% and 30%.";
  return e;
}

/* ------------------------------------------------------------------ */
/* Offers                                                              */
/* ------------------------------------------------------------------ */

export interface OfferEconomicsInput {
  product: "loan" | "lease";
  /** Loan: amount financed. Lease: capitalized cost (net of down payment). */
  approvedAmount: number;
  downPayment: number;
  apr?: number;
  moneyFactor?: number;
  termMonths: number;
  /** Fees paid at signing, not financed. */
  fees: number;
  residualValue?: number;
}

export interface OfferEconomics {
  monthlyPayment: number;
  totalCost: number;
  upfrontCost: number;
}

/**
 * Single source of truth for offer maths. totalCost = down payment + fees +
 * all scheduled payments. Lease totals EXCLUDE any end-of-term buyout.
 */
export function computeOfferEconomics(i: OfferEconomicsInput): OfferEconomics {
  let monthlyPayment = 0;
  let scheduled = 0;
  if (i.product === "loan") {
    const sched = amortizationSchedule(i.approvedAmount, i.apr ?? 0, i.termMonths);
    monthlyPayment = loanPayment(i.approvedAmount, i.apr ?? 0, i.termMonths);
    scheduled = round2(sched.reduce((s, r) => s + r.payment, 0));
  } else {
    monthlyPayment = leasePaymentFromCap(i.approvedAmount, i.residualValue ?? 0, i.moneyFactor ?? 0, i.termMonths).payment;
    scheduled = round2(monthlyPayment * i.termMonths);
  }
  const upfrontCost = round2(i.downPayment + i.fees);
  return { monthlyPayment, totalCost: round2(upfrontCost + scheduled), upfrontCost };
}

/** Purchase total for a robot line (quantity x unit + install + shipping). */
export function purchaseTotal(line: {
  quantity: number;
  unitPrice: number;
  installationCost: number;
  shippingCost: number;
}): number {
  return round2(line.quantity * line.unitPrice + (line.installationCost || 0) + (line.shippingCost || 0));
}

export function requestedAmount(total: number, downPayment: number, tradeIn: number): number {
  return Math.max(0, round2(total - downPayment - tradeIn));
}
