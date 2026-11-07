import { CREDIT_LABEL, CREDIT_RANK, ROBOT_CATEGORY_LABEL } from "@/domain/labels";
import type {
  Customer,
  FinancingApplication,
  CreditProfile,
  Currency,
  Country,
  CustomerType,
  FinancingType,
  FinancialProfile,
  Lender,
  LenderProgram,
  RobotCategory,
} from "@/domain/types";
import { formatMoney } from "./format";

/**
 * MOCK RULE-BASED SCREENING. This is NOT a credit decision and does not
 * predict lender approval. It only compares application attributes against the
 * criteria stored on each lender and program profile.
 */

export interface MatchInput {
  country: Country;
  currency: Currency;
  customerType: CustomerType;
  financingType: FinancingType;
  requestedAmount: number;
  termMonths: number;
  category: RobotCategory;
  profile: Pick<FinancialProfile, "credit" | "annualRevenue" | "yearsOperating">;
  yearsInBusiness?: number;
}

export type CheckResult = "pass" | "warn" | "fail";
export type Verdict = "potential" | "review" | "ineligible";

export interface MatchCheck {
  key: string;
  label: string;
  result: CheckResult;
  detail: string;
}

export interface LenderMatch {
  lender: Lender;
  program?: LenderProgram;
  verdict: Verdict;
  checks: MatchCheck[];
  summary: string;
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  potential: "Potential Match",
  review: "Review Needed",
  ineligible: "Not Eligible",
};

export const SCREENING_DISCLAIMER =
  "Mock rule-based screening against lender profile criteria. Not a credit decision, pre-approval, or prediction of lender response.";

function rangeCheck(
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
  fmt: (n: number) => string,
): MatchCheck {
  if (value >= min && value <= max) {
    return { key, label, result: "pass", detail: `${fmt(value)} is within ${fmt(min)} – ${fmt(max)}.` };
  }
  const tolerance = 0.1;
  if (value < min) {
    const near = value >= min * (1 - tolerance);
    return {
      key,
      label,
      result: near ? "warn" : "fail",
      detail: `${fmt(value)} is below the ${fmt(min)} minimum${near ? " (within 10% — may need lender discretion)." : "."}`,
    };
  }
  const near = value <= max * (1 + tolerance);
  return {
    key,
    label,
    result: near ? "warn" : "fail",
    detail: `${fmt(value)} exceeds the ${fmt(max)} maximum${near ? " (within 10% — may need lender discretion)." : "."}`,
  };
}

function creditCheck(applicant: CreditProfile, required: CreditProfile): MatchCheck {
  if (applicant === "unknown") {
    return { key: "credit", label: "Credit profile", result: "warn", detail: `Credit not assessed; lender expects ${CREDIT_LABEL[required]} or better.` };
  }
  const gap = CREDIT_RANK[required] - CREDIT_RANK[applicant];
  if (gap <= 0) return { key: "credit", label: "Credit profile", result: "pass", detail: `${CREDIT_LABEL[applicant]} meets the ${CREDIT_LABEL[required]} guideline.` };
  if (gap === 1) return { key: "credit", label: "Credit profile", result: "warn", detail: `${CREDIT_LABEL[applicant]} is one tier below the ${CREDIT_LABEL[required]} guideline.` };
  return { key: "credit", label: "Credit profile", result: "fail", detail: `${CREDIT_LABEL[applicant]} is below the ${CREDIT_LABEL[required]} guideline.` };
}

function programChecks(input: MatchInput, program: LenderProgram): MatchCheck[] {
  const fmt = (n: number) => formatMoney(n, input.currency);
  const checks: MatchCheck[] = [];
  checks.push({
    key: "program",
    label: "Program",
    result: "pass",
    detail: `${program.name} (${program.product}).`,
  });
  if (!program.customerTypes.includes(input.customerType)) {
    checks.push({ key: "program_customer", label: "Program customer type", result: "fail", detail: `${program.name} does not serve ${input.customerType} customers.` });
  }
  checks.push(rangeCheck("amount", "Requested amount", input.requestedAmount, program.minAmount, program.maxAmount, fmt));
  if (program.terms.includes(input.termMonths)) {
    checks.push({ key: "term", label: "Term", result: "pass", detail: `${input.termMonths} months is an offered term.` });
  } else {
    const min = Math.min(...program.terms);
    const max = Math.max(...program.terms);
    if (input.termMonths >= min && input.termMonths <= max) {
      checks.push({ key: "term", label: "Term", result: "warn", detail: `${input.termMonths} months is within ${min}–${max} but not a standard term.` });
    } else {
      checks.push({ key: "term", label: "Term", result: "fail", detail: `${input.termMonths} months is outside the ${min}–${max} month range.` });
    }
  }
  checks.push(creditCheck(input.profile.credit, program.minCredit));
  return checks;
}

const score = (checks: MatchCheck[]) =>
  checks.reduce((s, c) => s + (c.result === "fail" ? 100 : c.result === "warn" ? 1 : 0), 0);

export function evaluateLender(input: MatchInput, lender: Lender, programs: LenderProgram[]): LenderMatch {
  const base: MatchCheck[] = [];
  base.push(
    lender.active
      ? { key: "active", label: "Lender status", result: "pass", detail: "Lender is active." }
      : { key: "active", label: "Lender status", result: "fail", detail: "Lender is inactive." },
  );
  base.push(
    lender.countries.includes(input.country)
      ? { key: "country", label: "Country", result: "pass", detail: `Serves ${input.country === "US" ? "United States" : "Canada"}.` }
      : { key: "country", label: "Country", result: "fail", detail: `Does not serve ${input.country === "US" ? "the United States" : "Canada"}.` },
  );
  base.push(
    lender.currencies.includes(input.currency)
      ? { key: "currency", label: "Currency", result: "pass", detail: `Supports ${input.currency}.` }
      : { key: "currency", label: "Currency", result: "fail", detail: `Does not fund in ${input.currency}.` },
  );
  base.push(
    lender.customerTypes.includes(input.customerType)
      ? { key: "customer", label: "Customer type", result: "pass", detail: `Serves ${input.customerType} customers.` }
      : { key: "customer", label: "Customer type", result: "fail", detail: `Does not serve ${input.customerType} customers.` },
  );
  base.push(
    lender.robotCategories.includes(input.category)
      ? { key: "category", label: "Robot category", result: "pass", detail: `${ROBOT_CATEGORY_LABEL[input.category]} equipment is supported.` }
      : { key: "category", label: "Robot category", result: "fail", detail: `${ROBOT_CATEGORY_LABEL[input.category]} equipment is not supported.` },
  );

  const candidates = programs.filter((p) => p.lenderId === lender.id && p.active && p.product === input.financingType);
  let program: LenderProgram | undefined;
  let pChecks: MatchCheck[] = [];
  if (candidates.length === 0) {
    pChecks = [
      {
        key: "product",
        label: "Financing product",
        result: "fail",
        detail: `No active ${input.financingType} program.`,
      },
    ];
  } else {
    const scored = candidates
      .map((p) => ({ p, checks: programChecks(input, p) }))
      .sort((a, b) => score(a.checks) - score(b.checks));
    program = scored[0]!.p;
    pChecks = scored[0]!.checks;
  }

  const business: MatchCheck[] = [];
  if (input.customerType === "business") {
    const years = input.profile.yearsOperating ?? input.yearsInBusiness;
    if (lender.minYearsInBusiness > 0) {
      if (years === undefined) {
        business.push({ key: "years", label: "Time in business", result: "warn", detail: `Years in business not provided; lender prefers ${lender.minYearsInBusiness}+.` });
      } else if (years >= lender.minYearsInBusiness) {
        business.push({ key: "years", label: "Time in business", result: "pass", detail: `${years} yrs meets the ${lender.minYearsInBusiness}-year guideline.` });
      } else {
        business.push({ key: "years", label: "Time in business", result: "warn", detail: `${years} yrs is below the ${lender.minYearsInBusiness}-year guideline.` });
      }
    }
    if (lender.minAnnualRevenue > 0) {
      const rev = input.profile.annualRevenue;
      if (rev === undefined) {
        business.push({ key: "revenue", label: "Annual revenue", result: "warn", detail: "Revenue not provided." });
      } else if (rev >= lender.minAnnualRevenue) {
        business.push({ key: "revenue", label: "Annual revenue", result: "pass", detail: `${formatMoney(rev, input.currency)} meets the ${formatMoney(lender.minAnnualRevenue, input.currency)} guideline.` });
      } else {
        business.push({ key: "revenue", label: "Annual revenue", result: "warn", detail: `${formatMoney(rev, input.currency)} is below the ${formatMoney(lender.minAnnualRevenue, input.currency)} guideline.` });
      }
    }
  }

  const checks = [...base, ...pChecks, ...business];
  const fails = checks.filter((c) => c.result === "fail");
  const warns = checks.filter((c) => c.result === "warn");
  const verdict: Verdict = fails.length ? "ineligible" : warns.length ? "review" : "potential";
  const summary =
    verdict === "ineligible"
      ? fails.map((c) => c.detail).slice(0, 2).join(" ")
      : verdict === "review"
        ? warns.map((c) => c.detail).slice(0, 2).join(" ")
        : "All screened criteria align with this lender's profile.";
  return { lender, program, verdict, checks, summary };
}

const VERDICT_ORDER: Record<Verdict, number> = { potential: 0, review: 1, ineligible: 2 };

export function matchLenders(input: MatchInput, lenders: Lender[], programs: LenderProgram[]): LenderMatch[] {
  return lenders
    .map((l) => evaluateLender(input, l, programs))
    .sort(
      (a, b) =>
        VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] ||
        a.lender.turnaroundDays - b.lender.turnaroundDays ||
        a.lender.name.localeCompare(b.lender.name),
    );
}

export function matchInputFromApplication(app: FinancingApplication, customer: Customer | undefined): MatchInput {
  return {
    country: app.country,
    currency: app.currency,
    customerType: customer?.type ?? "business",
    financingType: app.financingType,
    requestedAmount: app.requestedAmount,
    termMonths: app.preferredTermMonths,
    category: app.robot.category,
    profile: app.profile,
    yearsInBusiness: customer?.yearsInBusiness,
  };
}
