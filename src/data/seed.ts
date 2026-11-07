import { DOCUMENT_CHECKLISTS, DOCUMENT_TYPE_LABEL } from "@/domain/labels";
import type {
  ActivityEvent,
  AppData,
  AppNotification,
  ApplicationStatus,
  Commission,
  Currency,
  Customer,
  CustomerType,
  DocumentRecord,
  DocumentStatus,
  DocumentType,
  EmailRecord,
  FinancingApplication,
  FinancingOffer,
  FinancingType,
  FollowUpTask,
  Lender,
  LenderProgram,
  LenderSubmission,
  NotificationType,
  SubmissionEvent,
  SubmissionMethod,
  SubmissionStatus,
  TaskKind,
} from "@/domain/types";
import { buildCommissionLines } from "@/lib/commissions";
import { computeOfferEconomics, purchaseTotal, requestedAmount, round2 } from "@/lib/finance";
import { customerSeeds, defaultSettings, employees, lenders, programs, robots, USD_TO_CAD } from "./reference";

export const DATA_VERSION = 3;

/* Deterministic pseudo-random so the demo looks the same on every reset. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type DocMode = "complete" | "uploaded" | "partial" | "minimal" | "none";

interface SubSpec {
  l: string;
  s: SubmissionStatus;
  accepted?: boolean;
  conds?: string[];
  resolved?: boolean;
  note?: string;
  expiresInDays?: number;
}

interface AppSpec {
  k: string;
  cust: string;
  robot: string;
  qty: number;
  cond?: "new" | "used";
  type: FinancingType;
  status: ApplicationStatus;
  down: number; // percent of purchase total
  term: number;
  age: number; // days since created
  docs: DocMode;
  subs: SubSpec[];
  step?: number;
  desired?: number;
  rt?: boolean;
  trade?: number;
}

const specs: AppSpec[] = [
  { k: "ironwood-irb", cust: "cus-ironwood", robot: "rb-irb1200", qty: 2, type: "loan", status: "funded", down: 10, term: 60, age: 318, docs: "complete", rt: true,
    subs: [{ l: "lnd-northbridge", s: "approved", accepted: true }, { l: "lnd-atlas", s: "approved" }, { l: "lnd-harbor", s: "withdrawn", note: "Withdrawn after customer accepted another offer." }] },
  { k: "apex-locus", cust: "cus-apex", robot: "rb-locus", qty: 6, type: "lease", status: "funded", down: 5, term: 48, age: 262, docs: "complete", rt: true,
    subs: [{ l: "lnd-summit", s: "approved", accepted: true }, { l: "lnd-northbridge", s: "approved" }, { l: "lnd-cascade", s: "declined", note: "Exceeds internal exposure limit for single-customer fleets." }] },
  { k: "solstice-spot", cust: "cus-solstice", robot: "rb-spot", qty: 1, type: "loan", status: "declined", down: 10, term: 60, age: 190, docs: "uploaded",
    subs: [{ l: "lnd-northbridge", s: "declined", note: "Debt-service coverage below guideline." }, { l: "lnd-cascade", s: "declined", note: "Seasonal revenue pattern; could not verify cash flow." }, { l: "lnd-keystone", s: "declined", note: "Business credit profile below guideline." }] },
  { k: "northern-locus", cust: "cus-northern", robot: "rb-locus", qty: 4, type: "loan", status: "funded", down: 10, term: 60, age: 205, docs: "complete",
    subs: [{ l: "lnd-maple", s: "approved", accepted: true }, { l: "lnd-atlas", s: "approved" }] },
  { k: "pacific-crx", cust: "cus-pacific", robot: "rb-crx", qty: 3, type: "loan", status: "funded", down: 15, term: 48, age: 150, docs: "complete", rt: true,
    subs: [{ l: "lnd-maple", s: "approved", accepted: true }, { l: "lnd-harbor", s: "declined", note: "Sector concentration limits." }] },
  { k: "redline-irb", cust: "cus-redline", robot: "rb-irb1200", qty: 2, type: "loan", status: "closed", down: 10, term: 60, age: 140, docs: "uploaded",
    subs: [{ l: "lnd-northbridge", s: "withdrawn", note: "Customer postponed the project; request withdrawn." }, { l: "lnd-atlas", s: "withdrawn", note: "Customer postponed the project; request withdrawn." }] },
  { k: "brightline-gofa", cust: "cus-brightline", robot: "rb-gofa", qty: 1, type: "loan", status: "funded", down: 10, term: 48, age: 122, docs: "complete",
    subs: [{ l: "lnd-northbridge", s: "approved", accepted: true }, { l: "lnd-keystone", s: "approved" }] },
  { k: "meridian-bella", cust: "cus-meridian", robot: "rb-bella", qty: 8, type: "lease", status: "funded", down: 0, term: 36, age: 98, docs: "complete",
    subs: [{ l: "lnd-summit", s: "approved", accepted: true }, { l: "lnd-cascade", s: "approved" }] },
  { k: "wei-h1", cust: "cus-wei", robot: "rb-h1", qty: 1, type: "loan", status: "declined", down: 10, term: 60, age: 77, docs: "uploaded",
    subs: [{ l: "lnd-maple", s: "declined", note: "Debt-to-income ratio above program limit." }] },
  { k: "elena-g1", cust: "cus-elena", robot: "rb-g1", qty: 1, type: "loan", status: "funded", down: 20, term: 48, age: 66, docs: "complete",
    subs: [{ l: "lnd-keystone", s: "approved", accepted: true }] },
  { k: "kestrel-spot", cust: "cus-kestrel", robot: "rb-spot", qty: 2, type: "loan", status: "contracting", down: 10, term: 60, age: 52, docs: "complete", rt: true,
    subs: [{ l: "lnd-northbridge", s: "approved", accepted: true }, { l: "lnd-atlas", s: "approved" }, { l: "lnd-cascade", s: "declined", note: "Requested amount above comfort level for time in business." }] },
  { k: "frontier-spot", cust: "cus-frontier", robot: "rb-spot", qty: 1, type: "loan", status: "contracting", down: 12, term: 60, age: 40, docs: "complete", rt: true,
    subs: [{ l: "lnd-maple", s: "approved", accepted: true }, { l: "lnd-atlas", s: "approved" }] },
  { k: "james-g1", cust: "cus-james", robot: "rb-g1", qty: 1, type: "loan", status: "offer_accepted", down: 15, term: 48, age: 33, docs: "complete",
    subs: [{ l: "lnd-maple", s: "approved", accepted: true }] },
  { k: "brightline-ur10e", cust: "cus-brightline", robot: "rb-ur10e", qty: 1, type: "loan", status: "approved", down: 10, term: 60, age: 28, docs: "uploaded",
    subs: [{ l: "lnd-northbridge", s: "approved", expiresInDays: 4 }, { l: "lnd-keystone", s: "approved" }] },
  { k: "redline-kr10", cust: "cus-redline", robot: "rb-kr10", qty: 3, type: "lease", status: "approved", down: 5, term: 48, age: 21, docs: "uploaded",
    subs: [{ l: "lnd-summit", s: "approved" }, { l: "lnd-northbridge", s: "approved" }, { l: "lnd-atlas", s: "under_review" }] },
  { k: "laurentian-crx", cust: "cus-laurentian", robot: "rb-crx", qty: 2, type: "loan", status: "conditionally_approved", down: 10, term: 48, age: 19, docs: "partial",
    subs: [{ l: "lnd-maple", s: "conditionally_approved", conds: ["Two years of financial statements", "Proof of equipment insurance naming lender as loss payee"] }, { l: "lnd-atlas", s: "under_review" }] },
  { k: "pioneer-digit", cust: "cus-pioneer", robot: "rb-digit", qty: 1, type: "loan", status: "conditionally_approved", down: 15, term: 60, age: 16, docs: "partial",
    subs: [{ l: "lnd-atlas", s: "conditionally_approved", conds: ["Personal guarantee from principal shareholders", "Most recent interim financial statements"] }, { l: "lnd-cascade", s: "under_review" }] },
  { k: "solstice-b2", cust: "cus-solstice", robot: "rb-b2", qty: 2, type: "loan", status: "under_review", down: 10, term: 36, age: 12, docs: "uploaded",
    subs: [{ l: "lnd-northbridge", s: "under_review" }, { l: "lnd-cascade", s: "under_review" }] },
  { k: "wei-g1", cust: "cus-wei", robot: "rb-g1", qty: 1, type: "lease", status: "under_review", down: 10, term: 36, age: 10, docs: "uploaded",
    subs: [{ l: "lnd-maple", s: "under_review" }] },
  { k: "sofia-servi", cust: "cus-sofia", robot: "rb-servi", qty: 1, type: "loan", status: "under_review", down: 10, term: 36, age: 9, docs: "uploaded",
    subs: [{ l: "lnd-keystone", s: "under_review" }] },
  { k: "meridian-servi", cust: "cus-meridian", robot: "rb-servi", qty: 5, type: "loan", status: "needs_documents", down: 10, term: 36, age: 8, docs: "partial",
    subs: [] },
  { k: "ironwood-kr10", cust: "cus-ironwood", robot: "rb-kr10", qty: 2, type: "loan", status: "needs_documents", down: 10, term: 60, age: 7, docs: "partial",
    subs: [] },
  { k: "apex-neo", cust: "cus-apex", robot: "rb-neo", qty: 2, type: "loan", status: "submitted", down: 10, term: 48, age: 6, docs: "uploaded",
    subs: [{ l: "lnd-northbridge", s: "submitted" }, { l: "lnd-atlas", s: "submitted" }, { l: "lnd-cascade", s: "submitted" }] },
  { k: "aisha-bella", cust: "cus-aisha", robot: "rb-bella", qty: 1, type: "loan", status: "submitted", down: 10, term: 36, age: 5, docs: "uploaded",
    subs: [{ l: "lnd-prairie", s: "submitted" }] },
  { k: "daniel-g1", cust: "cus-daniel", robot: "rb-g1", qty: 1, type: "loan", status: "ready_to_submit", down: 15, term: 48, age: 4, docs: "uploaded", desired: 850,
    subs: [] },
  { k: "kestrel-h1", cust: "cus-kestrel", robot: "rb-h1", qty: 1, type: "lease", status: "ready_to_submit", down: 5, term: 48, age: 3, docs: "uploaded",
    subs: [] },
  { k: "northern-gofa", cust: "cus-northern", robot: "rb-gofa", qty: 1, type: "lease", status: "draft", down: 10, term: 48, age: 2, docs: "minimal", step: 2,
    subs: [] },
  { k: "pacific-neo", cust: "cus-pacific", robot: "rb-neo", qty: 1, type: "loan", status: "draft", down: 10, term: 60, age: 1, docs: "none", step: 1,
    subs: [] },
];

const CONDITIONS_SENT: SubmissionStatus[] = [
  "submitted", "under_review", "info_requested", "conditionally_approved", "approved", "declined", "withdrawn",
];

export function createSeedData(nowDate: Date = new Date()): AppData {
  const rnd = mulberry32(20261106);
  const nowMs = nowDate.getTime();
  const DAY = 86_400_000;
  const iso = (msAgo: number) => new Date(nowMs - msAgo).toISOString();
  const ago = (days: number) => iso(days * DAY);
  const fromAge = (age: number, plusDays: number) => iso((age - plusDays) * DAY);

  const lenderById = new Map<string, Lender>(lenders.map((l) => [l.id, l]));
  const customerById = new Map<string, Customer>();

  const customers: Customer[] = customerSeeds.map((c) => {
    const { profile: _p, age, ...rest } = c;
    void _p;
    const customer: Customer = { ...rest, notes: [], createdAt: ago(age) };
    customerById.set(customer.id, customer);
    return customer;
  });
  const profileById = new Map(customerSeeds.map((c) => [c.id, c.profile]));

  const applications: FinancingApplication[] = [];
  const submissions: LenderSubmission[] = [];
  const offers: FinancingOffer[] = [];
  const documents: DocumentRecord[] = [];
  const activity: ActivityEvent[] = [];
  const commissions: Commission[] = [];
  const keyToAppId = new Map<string, string>();

  let activityCounter = 0;
  const addActivity = (a: Omit<ActivityEvent, "id">) => activity.push({ id: `act-${++activityCounter}`, ...a });
  const financeManagerFor = (country: "US" | "CA") => (country === "CA" ? "emp-claire" : "emp-marcus");

  const ordered = [...specs].sort((a, b) => b.age - a.age);
  let subCounter = 0;
  let offerCounter = 0;
  let docCounter = 0;

  ordered.forEach((spec, idx) => {
    const customer = customerById.get(spec.cust)!;
    const catalog = robots.find((r) => r.id === spec.robot)!;
    const currency: Currency = customer.country === "CA" ? "CAD" : "USD";
    const unitPrice = Math.round((catalog.listPriceUsd * (currency === "CAD" ? USD_TO_CAD : 1)) / 100) * 100;
    const installationCost =
      catalog.category === "service" ? 0 : Math.round((unitPrice * spec.qty * 0.03) / 100) * 100;
    const shippingCost = spec.qty > 1 ? 2400 : 900;
    const line = { quantity: spec.qty, unitPrice, installationCost, shippingCost };
    const total = purchaseTotal(line);
    const downPayment = Math.round((total * spec.down) / 100 / 100) * 100;
    const tradeIn = spec.trade ?? 0;
    const requested = requestedAmount(total, downPayment, tradeIn);
    const appId = `APP-${1001 + idx}`;
    keyToAppId.set(spec.k, appId);
    const created = ago(spec.age);
    const preSubmission = ["draft", "needs_documents", "ready_to_submit"].includes(spec.status);
    const submittedAt = preSubmission ? undefined : fromAge(spec.age, 1);
    const profile = { ...profileById.get(spec.cust)! };

    const app: FinancingApplication = {
      id: appId,
      customerId: customer.id,
      status: spec.status,
      financingType: spec.type,
      currency,
      country: customer.country,
      robot: {
        catalogId: catalog.id,
        manufacturer: catalog.manufacturer,
        model: catalog.model,
        category: catalog.category,
        condition: spec.cond ?? "new",
        quantity: spec.qty,
        unitPrice,
        installationCost,
        shippingCost,
        robotTraderListingId: spec.rt ? `RT-L-${48200 + idx * 7}` : undefined,
      },
      purchaseTotal: total,
      downPayment,
      tradeInCredit: tradeIn,
      requestedAmount: requested,
      preferredTermMonths: spec.term,
      desiredMonthlyPayment: spec.desired,
      profile,
      assignedEmployeeId: customer.assignedEmployeeId,
      createdAt: created,
      submittedAt,
      lastActivityAt: created,
      archived: false,
      wizardStep: spec.status === "draft" ? spec.step ?? 0 : undefined,
      notes: [],
      robotTrader: spec.rt
        ? { customerId: `RT-C-${3100 + idx}`, listingId: `RT-L-${48200 + idx * 7}`, dealId: `RT-D-${9100 + idx * 3}` }
        : undefined,
    };

    addActivity({ applicationId: appId, customerId: customer.id, type: "created", message: `Application created for ${customer.companyName ?? customer.name}`, at: created, actorId: customer.assignedEmployeeId });

    /* ---------------- submissions & offers ---------------- */
    let acceptedOfferId: string | undefined;
    let acceptedAt: string | undefined;
    const appOffers: FinancingOffer[] = [];

    spec.subs.forEach((ss, si) => {
      const lender = lenderById.get(ss.l)!;
      const program: LenderProgram | undefined =
        programs.find((p) => p.lenderId === lender.id && p.product === spec.type && p.customerTypes.includes(customer.type)) ??
        programs.find((p) => p.lenderId === lender.id && p.product === spec.type);
      const subId = `sub-${++subCounter}`;
      const sAt = fromAge(spec.age, 1 + si * 0.1);
      const decisionDays = lender.turnaroundDays + Math.floor(rnd() * 2);
      const decisionAt = fromAge(spec.age, Math.min(spec.age - 0.6, 1 + decisionDays));
      const method: SubmissionMethod =
        lender.integration === "api_connected" ? "api_demo" : si % 2 === 0 ? "email" : "portal";
      const history: SubmissionEvent[] = [
        { id: `${subId}-e1`, at: sAt, status: "submitted", note: `Manual submission recorded via ${method === "api_demo" ? "simulated API" : method}.`, actorId: financeManagerFor(customer.country) },
      ];
      if (["under_review", "info_requested", "conditionally_approved", "approved", "declined"].includes(ss.s)) {
        history.push({ id: `${subId}-e2`, at: fromAge(spec.age, 1.6 + si * 0.1), status: "under_review", note: "Lender confirmed receipt; underwriting in progress.", actorId: financeManagerFor(customer.country) });
      }
      const terminal = ["conditionally_approved", "approved", "declined", "withdrawn"].includes(ss.s);
      if (terminal) {
        history.push({
          id: `${subId}-e3`,
          at: decisionAt,
          status: ss.s,
          note:
            ss.note ??
            (ss.s === "approved"
              ? "Approved. Offer terms received from lender."
              : ss.s === "conditionally_approved"
                ? "Conditional approval received."
                : ss.s),
          actorId: financeManagerFor(customer.country),
        });
      }

      let offeredTerms: LenderSubmission["offeredTerms"];
      if ((ss.s === "approved" || ss.s === "conditionally_approved") && program) {
        const apr = Math.round((program.aprMin + (program.aprMax - program.aprMin) * (0.1 + rnd() * 0.5)) * 20) / 20;
        const termPick = program.terms.reduce((best, t) => (Math.abs(t - spec.term) < Math.abs(best - spec.term) ? t : best), program.terms[0]!);
        const fees = [295, 395, 495, 595, 795][Math.floor(rnd() * 5)]!;
        const residualPct = program.residualMinPercent
          ? Math.round(program.residualMinPercent + ((program.residualMaxPercent ?? program.residualMinPercent) - program.residualMinPercent) * rnd())
          : 0;
        const isLease = spec.type === "lease";
        const residualValue = isLease ? round2((total * residualPct) / 100) : undefined;
        const moneyFactor = isLease ? Math.round((apr / 2400) * 100000) / 100000 : undefined;
        const econ = computeOfferEconomics({
          product: spec.type,
          approvedAmount: requested,
          downPayment,
          apr: isLease ? undefined : apr,
          moneyFactor,
          termMonths: termPick,
          fees,
          residualValue,
        });
        const offerId = `off-${++offerCounter}`;
        const isAccepted = !!ss.accepted;
        const beyondAcceptance = ["offer_accepted", "contracting", "funded"].includes(spec.status);
        let expiresAt = fromAge(spec.age, Math.min(spec.age - 0.6, 1 + decisionDays) + 30);
        const status: FinancingOffer["status"] = isAccepted ? "accepted" : beyondAcceptance ? "superseded" : "active";
        if (status === "active") {
          if (ss.expiresInDays !== undefined) expiresAt = new Date(nowMs + ss.expiresInDays * DAY).toISOString();
          else if (new Date(expiresAt).getTime() < nowMs + 2 * DAY) expiresAt = new Date(nowMs + (3 + Math.floor(rnd() * 12)) * DAY).toISOString();
        }
        const offer: FinancingOffer = {
          id: offerId,
          applicationId: appId,
          lenderId: lender.id,
          submissionId: subId,
          product: spec.type,
          status,
          approvedAmount: requested,
          downPayment,
          apr: isLease ? undefined : apr,
          moneyFactor,
          termMonths: termPick,
          monthlyPayment: econ.monthlyPayment,
          fees,
          residualValue,
          totalCost: econ.totalCost,
          expiresAt,
          conditions: ss.conds ?? (ss.s === "approved" ? ["Proof of insurance prior to funding"] : []),
          createdAt: decisionAt,
        };
        offers.push(offer);
        appOffers.push(offer);
        offeredTerms = { amount: requested, apr: isLease ? undefined : apr, termMonths: termPick, monthlyPayment: econ.monthlyPayment };
        if (isAccepted) {
          acceptedOfferId = offerId;
          acceptedAt = fromAge(spec.age, Math.min(spec.age - 0.5, 1 + decisionDays + 2));
        }
        addActivity({ applicationId: appId, type: "offer_recorded", message: `Offer recorded from ${lender.name}`, at: decisionAt, actorId: financeManagerFor(customer.country) });
      }

      const sub: LenderSubmission = {
        id: subId,
        applicationId: appId,
        lenderId: lender.id,
        programId: program?.id,
        status: ss.s,
        method,
        referenceNumber: `${lender.initials}-${24000 + subCounter * 37}`,
        contactPerson: lender.contacts[0]?.name ?? "",
        submittedAt: CONDITIONS_SENT.includes(ss.s) ? sAt : undefined,
        followUpDate:
          ss.s === "submitted" || ss.s === "under_review"
            ? new Date(nowMs + (si - 1) * DAY).toISOString()
            : undefined,
        decisionAt: terminal ? decisionAt : undefined,
        notes: ss.note ?? "",
        conditions: (ss.conds ?? []).map((text, ci) => ({
          id: `${subId}-c${ci}`,
          text,
          resolved: !!ss.resolved,
          resolvedAt: ss.resolved ? decisionAt : undefined,
        })),
        offeredTerms,
        history,
        simulated: true,
      };
      submissions.push(sub);
      addActivity({ applicationId: appId, type: "submission", message: `Submission recorded for ${lender.name} (manual, simulated)`, at: sAt, actorId: financeManagerFor(customer.country), simulated: true });
      if (terminal && ss.s !== "withdrawn") {
        addActivity({ applicationId: appId, type: "decision", message: `${lender.name}: ${ss.s.replace("_", " ")}`, at: decisionAt, actorId: financeManagerFor(customer.country) });
      }
    });

    /* ---------------- accepted offer lifecycle ---------------- */
    if (acceptedOfferId && acceptedAt) {
      app.acceptedOfferId = acceptedOfferId;
      const lenderName = lenderById.get(appOffers.find((o) => o.id === acceptedOfferId)!.lenderId)!.name;
      addActivity({ applicationId: appId, type: "offer_accepted", message: `Customer accepted offer from ${lenderName}`, at: acceptedAt, actorId: customer.assignedEmployeeId });
      if (spec.status === "contracting" || spec.status === "funded") {
        const contractingAt = new Date(Math.min(nowMs - DAY * 0.4, new Date(acceptedAt).getTime() + 5 * DAY)).toISOString();
        addActivity({ applicationId: appId, type: "status", message: "Status changed to Contracting", at: contractingAt, actorId: financeManagerFor(customer.country) });
      }
    }
    if (spec.status === "funded" && acceptedOfferId && acceptedAt) {
      const accepted = appOffers.find((o) => o.id === acceptedOfferId)!;
      app.fundedAt = new Date(Math.min(nowMs - DAY, new Date(acceptedAt).getTime() + 21 * DAY)).toISOString();
      app.fundedAmount = accepted.approvedAmount;
      addActivity({ applicationId: appId, type: "funded", message: `Deal funded — ${accepted.approvedAmount.toLocaleString("en-US")} ${currency}`, at: app.fundedAt, actorId: financeManagerFor(customer.country) });
    }
    const missing = spec.status === "needs_documents";
    if (missing) {
      addActivity({ applicationId: appId, type: "documents", message: "Status set to Needs Documents — required items outstanding", at: fromAge(spec.age, 1), actorId: customer.assignedEmployeeId });
    }
    if (spec.status === "closed") {
      addActivity({ applicationId: appId, type: "status", message: "Application closed — customer postponed purchase", at: fromAge(spec.age, spec.age - 40), actorId: customer.assignedEmployeeId });
    }

    /* ---------------- documents ---------------- */
    const required: DocumentType[] =
      customer.type === "business"
        ? ["business_registration", "financial_statements", "identification", "equipment_quotation", "purchase_agreement", "insurance"]
        : ["proof_of_income", "identification", "equipment_quotation", "purchase_agreement", "insurance"];
    const extraDocs: DocumentType[] =
      spec.k === "pioneer-digit" || spec.k === "laurentian-crx" ? ["lender_additional"] : [];
    [...required, ...extraDocs].forEach((type, di) => {
      let status: DocumentStatus;
      const n = required.length;
      switch (spec.docs) {
        case "complete": status = "verified"; break;
        case "uploaded": status = di % 3 === 2 ? "under_review" : "uploaded"; break;
        case "partial": status = di < Math.ceil(n * 0.5) ? (di % 2 === 0 ? "verified" : "under_review") : di === n - 1 ? "missing" : di % 3 === 0 ? "rejected" : "missing"; break;
        case "minimal": status = di < 2 ? "uploaded" : "missing"; break;
        default: status = "missing";
      }
      if (type === "lender_additional") status = spec.k === "laurentian-crx" ? "uploaded" : "missing";
      if (spec.k === "ironwood-kr10" && type === "insurance") status = "rejected";
      const hasFile = status !== "missing";
      const uploadedAt = hasFile ? fromAge(spec.age, 1 + di * 0.2) : undefined;
      const fileBase = `${DOCUMENT_TYPE_LABEL[type].replace(/\s+/g, "-").toLowerCase()}-${spec.cust.replace("cus-", "")}`;
      documents.push({
        id: `doc-${++docCounter}`,
        applicationId: appId,
        type,
        label: DOCUMENT_TYPE_LABEL[type],
        required: true,
        status,
        fileName: hasFile ? `${fileBase}.pdf` : undefined,
        fileSize: hasFile ? 120_000 + Math.floor(rnd() * 900_000) : undefined,
        mimeType: hasFile ? "application/pdf" : undefined,
        uploadedAt,
        verifiedById: status === "verified" ? financeManagerFor(customer.country) : undefined,
        verifiedAt: status === "verified" ? fromAge(spec.age, 1.8 + di * 0.1) : undefined,
        note: status === "rejected" ? "Document expired or illegible — please resubmit." : undefined,
        checklist: DOCUMENT_CHECKLISTS[type].map((label, ci) => ({
          id: `doc-${docCounter}-k${ci}`,
          label,
          done: status === "verified" || (status === "under_review" && ci === 0),
        })),
      });
    });

    applications.push(app);
  });

  /* ---------------- commissions ---------------- */
  applications.forEach((app) => {
    if (!app.acceptedOfferId) return;
    const offer = offers.find((o) => o.id === app.acceptedOfferId)!;
    const lender = lenderById.get(offer.lenderId)!;
    const lines = buildCommissionLines({
      application: app,
      offer,
      lender,
      settings: defaultSettings,
      now: app.fundedAt ?? offer.createdAt,
    });
    lines.forEach((line, li) => {
      if (app.status === "funded") {
        const daysSinceFunded = (nowMs - new Date(app.fundedAt!).getTime()) / DAY;
        const paid = daysSinceFunded > 75;
        // Realised amounts occasionally differ slightly from estimates.
        const variance = li === 0 && paid && app.id === keyToAppId.get("apex-locus") ? -0.03 : 0;
        commissions.push({
          ...line,
          status: paid ? "paid" : "pending",
          actual: round2(line.estimated * (1 + variance)),
          paidAt: paid ? new Date(new Date(app.fundedAt!).getTime() + 20 * DAY).toISOString() : undefined,
        });
      } else {
        commissions.push(line);
      }
    });
  });

  /* ---------------- derived activity-based fields ---------------- */
  activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  applications.forEach((app) => {
    const last = activity.find((a) => a.applicationId === app.id);
    if (last) app.lastActivityAt = last.at;
  });

  const idOf = (k: string) => keyToAppId.get(k)!;

  /* ---------------- notes ---------------- */
  const addNote = (appKey: string, authorId: string, body: string, daysAgo: number) => {
    const app = applications.find((a) => a.id === idOf(appKey))!;
    app.notes.push({ id: `note-${app.id}-${app.notes.length}`, authorId, body, createdAt: ago(daysAgo) });
  };
  addNote("pioneer-digit", "emp-priya", "Atlas wants a personal guarantee from the founders. Customer is open to it; waiting on cap table.", 12);
  addNote("laurentian-crx", "emp-amelie", "Customer's insurer is preparing a loss-payee endorsement. Expected this week.", 14);
  addNote("brightline-ur10e", "emp-tomas", "Customer prefers the shorter term if the monthly payment stays under $1,000.", 20);
  addNote("kestrel-spot", "emp-marcus", "Contracts out for signature. Insurance binder already verified.", 30);
  addNote("meridian-servi", "emp-priya", "Customer will send the signed purchase agreement after their board meeting.", 6);
  const cust = (id: string) => customerById.get(id)!;
  cust("cus-apex").notes.push({ id: "cn-1", authorId: "emp-priya", body: "Expanding to a second fulfilment centre next year; likely repeat financing.", createdAt: ago(40) });
  cust("cus-ironwood").notes.push({ id: "cn-2", authorId: "emp-jordan", body: "Prefers longest term with lowest rate. Decision maker: Gary; CFO copied on all quotes.", createdAt: ago(80) });
  cust("cus-pacific").notes.push({ id: "cn-3", authorId: "emp-amelie", body: "Seasonal cash flow — time payments with peak season where possible.", createdAt: ago(120) });

  /* ---------------- tasks ---------------- */
  const tasks: FollowUpTask[] = [];
  const addTask = (appKey: string | undefined, kind: TaskKind, title: string, dueInDays: number, assignee: string, done = false, lenderId?: string) => {
    tasks.push({
      id: `task-${tasks.length + 1}`,
      applicationId: appKey ? idOf(appKey) : undefined,
      customerId: appKey ? applications.find((a) => a.id === idOf(appKey))!.customerId : undefined,
      lenderId,
      kind,
      title,
      dueDate: new Date(nowMs + dueInDays * DAY).toISOString(),
      assigneeId: assignee,
      done,
      createdAt: ago(3),
    });
  };
  addTask("apex-neo", "lender", "Follow up with Northbridge — no response in 5 days", -1, "emp-marcus", false, "lnd-northbridge");
  addTask("apex-neo", "lender", "Check Cascade status — decision expected in 48h", 0, "emp-marcus", false, "lnd-cascade");
  addTask("aisha-bella", "lender", "Call Prairie underwriting for decision", 1, "emp-claire", false, "lnd-prairie");
  addTask("meridian-servi", "document", "Chase signed purchase agreement from Lucia", -2, "emp-priya");
  addTask("ironwood-kr10", "document", "Request replacement insurance binder (rejected)", 0, "emp-jordan");
  addTask("laurentian-crx", "document", "Collect insurance endorsement for Maple condition", 2, "emp-amelie");
  addTask("pioneer-digit", "customer", "Obtain guarantor details for Atlas condition", 1, "emp-priya");
  addTask("brightline-ur10e", "customer", "Walk customer through offers before expiry", 3, "emp-tomas");
  addTask("redline-kr10", "customer", "Review lease options with Victor", 2, "emp-jordan");
  addTask("kestrel-spot", "internal", "Confirm contract signing date with customer", 1, "emp-marcus");
  addTask("frontier-spot", "internal", "Schedule delivery after funding", 6, "emp-jordan");
  addTask("daniel-g1", "internal", "Submit to Keystone once final ID is verified", 0, "emp-marcus");
  addTask("kestrel-h1", "internal", "Review lender matches and submit", 1, "emp-marcus");
  addTask("james-g1", "customer", "Send contracting package to James", 0, "emp-amelie");
  addTask("solstice-b2", "lender", "Ask Northbridge for expected decision date", 2, "emp-marcus", false, "lnd-northbridge");
  addTask("ironwood-irb", "internal", "Quarterly check-in with Ironwood", 14, "emp-jordan", true);

  /* ---------------- notifications ---------------- */
  const notifications: AppNotification[] = [];
  const addNotif = (type: NotificationType, title: string, body: string, hoursAgo: number, appKey?: string, read = false) => {
    notifications.push({
      id: `ntf-${notifications.length + 1}`,
      type,
      title,
      body,
      createdAt: new Date(nowMs - hoursAgo * 3_600_000).toISOString(),
      read,
      applicationId: appKey ? idOf(appKey) : undefined,
      link: appKey ? `/applications/${idOf(appKey)}` : undefined,
    });
  };
  addNotif("offer_expiring", "Offer expiring in 4 days", "Northbridge offer on the Brightline UR10e application expires soon.", 2, "brightline-ur10e");
  addNotif("follow_up_due", "Follow-up overdue", "Northbridge follow-up on Apex Fulfillment (Neo 2) is overdue.", 4, "apex-neo");
  addNotif("conditional_approval", "Conditional approval recorded", "Atlas Robotics Credit conditionally approved Pioneer Labs, subject to a personal guarantee.", 26, "pioneer-digit");
  addNotif("missing_documents", "Document rejected", "Insurance documentation for Ironwood Fabrication was rejected and needs resubmission.", 30, "ironwood-kr10");
  addNotif("lender_response", "Lender response recorded", "Summit Lease Corp approved the Redline Auto lease request.", 52, "redline-kr10");
  addNotif("application_approved", "Application approved", "Brightline Dental Group has approved offers from two lenders.", 70, "brightline-ur10e", true);
  addNotif("new_application", "New application created", "Kestrel Security Services — Unitree H1 lease is ready to submit.", 72, "kestrel-h1");
  addNotif("conditional_approval", "Conditional approval recorded", "Maple Leaf Capital Partners conditionally approved Laurentian Pharma Packaging.", 96, "laurentian-crx", true);
  addNotif("follow_up_due", "Follow-up due today", "Call Prairie underwriting about the Aisha Rahman application.", 5, "aisha-bella");
  addNotif("offer_accepted", "Offer accepted", "James O'Connor accepted the Maple Leaf Capital offer.", 120, "james-g1", true);
  addNotif("application_declined", "Application declined", "Maple Leaf Capital declined the Wei Zhang H1 application.", 1800, "wei-h1", true);
  addNotif("deal_funded", "Deal funded", "Elena Marchetti's G1 EDU financing was funded.", 1000, "elena-g1", true);
  addNotif("missing_documents", "Missing documentation", "Meridian Hospitality Group is missing a signed purchase agreement.", 140, "meridian-servi");
  addNotif("lender_response", "Lender response recorded", "Keystone CU moved Sofia Alvarez's application to underwriting.", 160, "sofia-servi", true);

  /* ---------------- emails ---------------- */
  const emails: EmailRecord[] = [
    {
      id: "eml-1",
      applicationId: idOf("meridian-servi"),
      audience: "customer",
      to: cust("cus-meridian").email,
      toName: cust("cus-meridian").name,
      subject: "Documents needed for your Servi Plus financing",
      body: "Hi Lucia,\n\nWe still need the signed purchase agreement and insurance documentation to move your application forward.\n\nBest regards,\nPriya Natarajan",
      templateId: "tpl-cust-docs",
      status: "simulated_sent",
      sentAt: ago(6),
      createdAt: ago(6),
      authorId: "emp-priya",
    },
    {
      id: "eml-2",
      applicationId: idOf("apex-neo"),
      audience: "lender",
      to: "r.donovan@northbridge-ef.example",
      toName: "Rachel Donovan",
      subject: "Follow-up: " + idOf("apex-neo") + " — Apex Fulfillment Co.",
      body: "Hi Rachel,\n\nFollowing up on the financing request for Apex Fulfillment Co. Could you share a status update?\n\nThank you,\nMarcus Lee",
      templateId: "tpl-lender-followup",
      status: "simulated_sent",
      sentAt: ago(2),
      createdAt: ago(2),
      authorId: "emp-marcus",
    },
    {
      id: "eml-3",
      applicationId: idOf("laurentian-crx"),
      audience: "customer",
      to: cust("cus-laurentian").email,
      toName: cust("cus-laurentian").name,
      subject: "Update on your financing application " + idOf("laurentian-crx"),
      body: "Hi Sophie,\n\nMaple Leaf Capital has conditionally approved your request. We need the insurance endorsement and two years of financial statements to clear the conditions.\n\nBest regards,\nAmélie Roy",
      templateId: "tpl-cust-update",
      status: "simulated_sent",
      sentAt: ago(15),
      createdAt: ago(15),
      authorId: "emp-amelie",
    },
  ];

  return {
    version: DATA_VERSION,
    employees,
    customers,
    robots,
    applications,
    lenders,
    programs,
    submissions,
    offers,
    documents,
    commissions,
    notifications: notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    activity,
    tasks,
    emails,
    settings: structuredClone(defaultSettings),
  };
}

export type { CustomerType };
