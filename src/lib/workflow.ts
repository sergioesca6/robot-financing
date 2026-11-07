/**
 * Pure workflow logic. Every function takes the full AppData and returns a new
 * AppData (never mutating the input), together with a value or an error.
 * The UI store wraps these; unit tests exercise them directly. In production
 * these rules move server-side (e.g. Supabase RPC / edge functions).
 */
import { DOCUMENT_CHECKLISTS, DOCUMENT_TYPE_LABEL } from "@/domain/labels";
import { APPLICATION_STATUS_META, canTransition } from "@/domain/status";
import type {
  ActivityEvent,
  AppData,
  AppNotification,
  ApplicationStatus,
  Commission,
  Customer,
  DocumentRecord,
  DocumentStatus,
  DocumentType,
  EmailRecord,
  FinancialProfile,
  FinancingApplication,
  FinancingOffer,
  FinancingType,
  FollowUpTask,
  Lender,
  LenderProgram,
  LenderSubmission,
  NotificationType,
  OfferStatus,
  RobotLine,
  SubmissionMethod,
  SubmissionStatus,
  Currency,
  Country,
  TaskKind,
} from "@/domain/types";
import { buildCommissionLines, recalcEstimated } from "./commissions";
import { computeOfferEconomics, purchaseTotal, requestedAmount } from "./finance";
import { formatMoney } from "./format";
import { uid } from "./id";
import { customerDisplayName, documentCompleteness } from "./selectors";

export interface Ctx {
  now: string;
  actorId: string;
}

export type WfResult<T = undefined> = { ok: true; data: AppData; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const ok = <T>(data: AppData, value: T): WfResult<T> => ({ ok: true, data, value });

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function log(data: AppData, ctx: Ctx, e: Omit<ActivityEvent, "id" | "at" | "actorId">): AppData {
  const event: ActivityEvent = { id: uid("act"), at: ctx.now, actorId: ctx.actorId, ...e };
  return { ...data, activity: [event, ...data.activity] };
}

function notify(
  data: AppData,
  ctx: Ctx,
  n: { type: NotificationType; title: string; body: string; applicationId?: string },
): AppData {
  const notification: AppNotification = {
    id: uid("ntf"),
    createdAt: ctx.now,
    read: false,
    link: n.applicationId ? `/applications/${n.applicationId}` : undefined,
    ...n,
  };
  return { ...data, notifications: [notification, ...data.notifications] };
}

function patchApp(data: AppData, id: string, patch: Partial<FinancingApplication>, ctx: Ctx): AppData {
  return {
    ...data,
    applications: data.applications.map((a) => (a.id === id ? { ...a, ...patch, lastActivityAt: ctx.now } : a)),
  };
}

const getApp = (data: AppData, id: string) => data.applications.find((a) => a.id === id);
const getCustomer = (data: AppData, id: string) => data.customers.find((c) => c.id === id);
const getLender = (data: AppData, id: string) => data.lenders.find((l) => l.id === id);

function appLabel(data: AppData, app: FinancingApplication): string {
  return `${app.id} · ${customerDisplayName(getCustomer(data, app.customerId))}`;
}

export function nextApplicationId(data: AppData): string {
  const max = data.applications.reduce((m, a) => Math.max(m, Number(a.id.replace(/\D/g, "")) || 0), 1000);
  return `APP-${max + 1}`;
}

/* ------------------------------------------------------------------ */
/* applications                                                        */
/* ------------------------------------------------------------------ */

export interface DocumentDraft {
  id?: string;
  type: DocumentType;
  label?: string;
  required: boolean;
  status: DocumentStatus;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  note?: string;
}

export type NewCustomerInput = Omit<Customer, "id" | "notes" | "createdAt" | "assignedEmployeeId"> & {
  assignedEmployeeId?: string;
};

export interface ApplicationInput {
  id?: string;
  customerId?: string;
  newCustomer?: NewCustomerInput;
  financingType: FinancingType;
  currency: Currency;
  country: Country;
  robot: RobotLine;
  downPayment: number;
  tradeInCredit: number;
  preferredTermMonths: number;
  desiredMonthlyPayment?: number;
  profile: FinancialProfile;
  assignedEmployeeId?: string;
  /** Target status when creating or saving a draft. Ignored for non-draft edits. */
  status?: Extract<ApplicationStatus, "draft" | "needs_documents" | "ready_to_submit">;
  wizardStep?: number;
  documents: DocumentDraft[];
  robotTrader?: FinancingApplication["robotTrader"];
}

export function requiredDocumentTypes(customerType: Customer["type"]): DocumentType[] {
  return customerType === "business"
    ? ["business_registration", "financial_statements", "identification", "equipment_quotation", "purchase_agreement", "insurance"]
    : ["proof_of_income", "identification", "equipment_quotation", "purchase_agreement", "insurance"];
}

export function defaultDocumentDrafts(customerType: Customer["type"]): DocumentDraft[] {
  return requiredDocumentTypes(customerType).map((type) => ({
    type,
    label: DOCUMENT_TYPE_LABEL[type],
    required: true,
    status: "missing" as DocumentStatus,
  }));
}

function docRecordFromDraft(d: DocumentDraft, applicationId: string, ctx: Ctx): DocumentRecord {
  const id = d.id ?? uid("doc");
  const hasFile = d.status !== "missing";
  return {
    id,
    applicationId,
    type: d.type,
    label: d.label ?? DOCUMENT_TYPE_LABEL[d.type],
    required: d.required,
    status: d.status,
    fileName: hasFile ? d.fileName ?? `${d.type}-demo.pdf` : undefined,
    fileSize: hasFile ? d.fileSize ?? 240_000 : undefined,
    mimeType: hasFile ? d.mimeType ?? "application/pdf" : undefined,
    uploadedAt: hasFile ? ctx.now : undefined,
    verifiedById: d.status === "verified" ? ctx.actorId : undefined,
    verifiedAt: d.status === "verified" ? ctx.now : undefined,
    note: d.note,
    checklist: DOCUMENT_CHECKLISTS[d.type].map((label, i) => ({ id: `${id}-k${i}`, label, done: d.status === "verified" })),
  };
}

/** Create or update an application (including drafts). */
export function saveApplication(data: AppData, input: ApplicationInput, ctx: Ctx): WfResult<FinancingApplication> {
  let next = data;
  let customer: Customer | undefined;
  if (input.customerId) {
    customer = getCustomer(next, input.customerId);
    if (!customer) return fail("Selected customer was not found.");
  } else if (input.newCustomer) {
    const email = input.newCustomer.email.trim().toLowerCase();
    const dup = next.customers.find((c) => c.email.toLowerCase() === email);
    if (dup) return fail(`A customer with ${email} already exists (${customerDisplayName(dup)}). Select the existing customer instead.`);
    customer = {
      ...input.newCustomer,
      id: uid("cus"),
      notes: [],
      createdAt: ctx.now,
      assignedEmployeeId: input.newCustomer.assignedEmployeeId ?? input.assignedEmployeeId ?? ctx.actorId,
    };
    next = { ...next, customers: [customer, ...next.customers] };
    next = log(next, ctx, { customerId: customer.id, type: "customer_created", message: `Customer ${customerDisplayName(customer)} added` });
  } else {
    return fail("A customer is required.");
  }

  const total = purchaseTotal(input.robot);
  if (input.downPayment + input.tradeInCredit > total) return fail("Down payment plus credits cannot exceed the purchase total.");
  const requested = requestedAmount(total, input.downPayment, input.tradeInCredit);

  const existing = input.id ? getApp(next, input.id) : undefined;
  const status: ApplicationStatus = existing
    ? existing.status === "draft"
      ? input.status ?? "draft"
      : existing.status
    : input.status ?? "draft";

  const docDrafts = input.documents;
  if (status === "ready_to_submit") {
    const check = documentCompleteness(docDrafts.map((d) => ({ ...d, id: d.id ?? "x", applicationId: "x", label: d.label ?? "", checklist: [] })));
    if (check.missing.length) return fail(`Required documents are missing or rejected: ${check.missing.map((m) => m.label).join(", ")}.`);
  }

  const id = existing?.id ?? nextApplicationId(next);
  const base: FinancingApplication = {
    id,
    customerId: customer.id,
    status,
    financingType: input.financingType,
    currency: input.currency,
    country: input.country,
    robot: input.robot,
    purchaseTotal: total,
    downPayment: input.downPayment,
    tradeInCredit: input.tradeInCredit,
    requestedAmount: requested,
    preferredTermMonths: input.preferredTermMonths,
    desiredMonthlyPayment: input.desiredMonthlyPayment,
    profile: input.profile,
    assignedEmployeeId: input.assignedEmployeeId ?? existing?.assignedEmployeeId ?? customer.assignedEmployeeId,
    createdAt: existing?.createdAt ?? ctx.now,
    submittedAt: existing?.submittedAt,
    fundedAt: existing?.fundedAt,
    fundedAmount: existing?.fundedAmount,
    acceptedOfferId: existing?.acceptedOfferId,
    lastActivityAt: ctx.now,
    archived: existing?.archived ?? false,
    wizardStep: status === "draft" ? input.wizardStep ?? 0 : undefined,
    notes: existing?.notes ?? [],
    robotTrader: input.robotTrader ?? existing?.robotTrader,
  };

  const docs = docDrafts.map((d) => docRecordFromDraft(d, id, ctx));
  next = {
    ...next,
    applications: existing ? next.applications.map((a) => (a.id === id ? base : a)) : [base, ...next.applications],
    documents: [...next.documents.filter((d) => d.applicationId !== id), ...docs],
  };

  if (!existing) {
    next = log(next, ctx, { applicationId: id, customerId: customer.id, type: "created", message: `Application created for ${customerDisplayName(customer)}${status === "draft" ? " (draft)" : ""}` });
    next = notify(next, ctx, {
      type: "new_application",
      title: "New application created",
      body: `${customerDisplayName(customer)} — ${input.robot.manufacturer} ${input.robot.model}, ${formatMoney(requested, input.currency)} requested.`,
      applicationId: id,
    });
    if (status === "needs_documents") {
      next = notify(next, ctx, { type: "missing_documents", title: "Missing documentation", body: `${appLabel(next, base)} is waiting on required documents.`, applicationId: id });
    }
  } else {
    next = log(next, ctx, { applicationId: id, customerId: customer.id, type: "edited", message: status === "draft" ? "Draft saved" : "Application details updated" });
  }
  return ok(next, base);
}

export function duplicateApplication(data: AppData, id: string, ctx: Ctx): WfResult<FinancingApplication> {
  const src = getApp(data, id);
  if (!src) return fail("Application not found.");
  const newId = nextApplicationId(data);
  const copy: FinancingApplication = {
    ...src,
    id: newId,
    status: "draft",
    createdAt: ctx.now,
    submittedAt: undefined,
    fundedAt: undefined,
    fundedAmount: undefined,
    acceptedOfferId: undefined,
    lastActivityAt: ctx.now,
    archived: false,
    wizardStep: 0,
    notes: [],
    robotTrader: undefined,
  };
  const docs = data.documents
    .filter((d) => d.applicationId === id)
    .map((d) => docRecordFromDraft({ type: d.type, label: d.label, required: d.required, status: "missing" }, newId, ctx));
  let next: AppData = { ...data, applications: [copy, ...data.applications], documents: [...data.documents, ...docs] };
  next = log(next, ctx, { applicationId: newId, customerId: src.customerId, type: "created", message: `Application duplicated from ${src.id}` });
  return ok(next, copy);
}

export function archiveApplication(data: AppData, id: string, archived: boolean, ctx: Ctx): WfResult {
  const app = getApp(data, id);
  if (!app) return fail("Application not found.");
  if (archived && ["contracting", "offer_accepted"].includes(app.status)) {
    return fail("Applications in progress with an accepted offer cannot be archived. Close or fund the deal first.");
  }
  let next = patchApp(data, id, { archived }, ctx);
  next = log(next, ctx, { applicationId: id, customerId: app.customerId, type: "archive", message: archived ? "Application archived" : "Application restored from archive" });
  return ok(next, undefined);
}

export function assignApplications(data: AppData, ids: string[], employeeId: string, ctx: Ctx): WfResult<number> {
  const emp = data.employees.find((e) => e.id === employeeId);
  if (!emp) return fail("Employee not found.");
  let next = data;
  let n = 0;
  for (const id of ids) {
    const app = getApp(next, id);
    if (!app || app.assignedEmployeeId === employeeId) continue;
    next = patchApp(next, id, { assignedEmployeeId: employeeId }, ctx);
    next = log(next, ctx, { applicationId: id, customerId: app.customerId, type: "assigned", message: `Assigned to ${emp.name}` });
    n += 1;
  }
  return ok(next, n);
}

/* ------------------------------------------------------------------ */
/* status transitions                                                  */
/* ------------------------------------------------------------------ */

export function validateStatusChange(data: AppData, app: FinancingApplication, to: ApplicationStatus): string | null {
  if (app.status === to) return "Application is already in that status.";
  if (!canTransition(app.status, to)) {
    return `Cannot move from ${APPLICATION_STATUS_META[app.status].label} to ${APPLICATION_STATUS_META[to].label}.`;
  }
  const subs = data.submissions.filter((s) => s.applicationId === app.id);
  const docs = data.documents.filter((d) => d.applicationId === app.id);
  const completeness = documentCompleteness(docs);
  switch (to) {
    case "ready_to_submit":
      if (completeness.missing.length)
        return `Required documents are missing or rejected: ${completeness.missing.map((d) => d.label).join(", ")}.`;
      return null;
    case "submitted":
      return subs.some((s) => s.submittedAt) ? null : "Use “Submit to Lenders” to record at least one lender submission first.";
    case "under_review":
      return subs.length ? null : "Record a lender submission before moving to review.";
    case "conditionally_approved":
      return subs.some((s) => s.status === "conditionally_approved" || s.status === "approved")
        ? null
        : "At least one lender submission must be conditionally approved.";
    case "approved":
      return subs.some((s) => s.status === "approved") ? null : "At least one lender submission must be approved.";
    case "declined":
      if (!subs.length) return "Record lender submissions before declining.";
      if (subs.some((s) => s.status === "approved")) return "A lender has approved this request; record the offer outcome instead.";
      return null;
    case "offer_accepted":
      return app.acceptedOfferId ? null : "Accept a financing offer first.";
    case "contracting":
      if (!app.acceptedOfferId) return "Accept a financing offer first.";
      if (completeness.verified < completeness.required) return "All required documents must be verified before contracting.";
      return null;
    case "funded":
      return app.acceptedOfferId ? null : "An accepted offer is required to fund a deal.";
    default:
      return null;
  }
}

function applyStatus(data: AppData, app: FinancingApplication, to: ApplicationStatus, ctx: Ctx, note?: string, auto = false): AppData {
  const from = app.status;
  const patch: Partial<FinancingApplication> = { status: to };
  if (to === "submitted" && !app.submittedAt) patch.submittedAt = ctx.now;
  if (to !== "draft") patch.wizardStep = undefined;
  let next = patchApp(data, app.id, patch, ctx);
  const label = APPLICATION_STATUS_META[to].label;
  next = log(next, ctx, {
    applicationId: app.id,
    customerId: app.customerId,
    type: "status",
    message: `${auto ? "Status updated from lender decisions" : "Status changed"}: ${APPLICATION_STATUS_META[from].label} → ${label}${note ? ` — ${note}` : ""}`,
  });
  const who = appLabel(next, app);
  const map: Partial<Record<ApplicationStatus, { type: NotificationType; title: string; body: string }>> = {
    needs_documents: { type: "missing_documents", title: "Documents needed", body: `${who} is waiting on required documents.` },
    conditionally_approved: { type: "conditional_approval", title: "Conditional approval", body: `${who} received a conditional approval.` },
    approved: { type: "application_approved", title: "Application approved", body: `${who} was approved by at least one lender.` },
    declined: { type: "application_declined", title: "Application declined", body: `${who} was declined by all lenders.` },
    funded: { type: "deal_funded", title: "Deal funded", body: `${who} has been funded.` },
  };
  const n = map[to] ?? { type: "status_change" as const, title: `Status: ${label}`, body: `${who} moved to ${label}.` };
  next = notify(next, ctx, { ...n, applicationId: app.id });
  return next;
}

export function changeApplicationStatus(data: AppData, id: string, to: ApplicationStatus, ctx: Ctx, note?: string): WfResult {
  const app = getApp(data, id);
  if (!app) return fail("Application not found.");
  const err = validateStatusChange(data, app, to);
  if (err) return fail(err);
  let next = data;
  if (to === "closed") {
    // Closing withdraws any open lender submissions and unselects open offers.
    next = {
      ...next,
      submissions: next.submissions.map((s) =>
        s.applicationId === id && ["queued", "submitted", "under_review", "info_requested"].includes(s.status)
          ? { ...s, status: "withdrawn" as const, history: [...s.history, { id: uid("evt"), at: ctx.now, status: "withdrawn" as const, note: "Application closed — request withdrawn.", actorId: ctx.actorId }] }
          : s,
      ),
      offers: next.offers.map((o) => (o.applicationId === id && ["active", "draft"].includes(o.status) ? { ...o, status: "superseded" as const } : o)),
      commissions: next.commissions.map((c) => (c.applicationId === id && c.status === "estimated" ? { ...c, status: "void" as const } : c)),
    };
  }
  if (to === "funded") return fundDeal(next, id, ctx);
  next = applyStatus(next, app, to, ctx, note);
  return ok(next, undefined);
}

export function fundDeal(data: AppData, id: string, ctx: Ctx, opts: { fundedAmount?: number } = {}): WfResult {
  const app = getApp(data, id);
  if (!app) return fail("Application not found.");
  if (app.status !== "contracting") return fail("Only deals in Contracting can be marked funded.");
  const offer = app.acceptedOfferId ? data.offers.find((o) => o.id === app.acceptedOfferId) : undefined;
  if (!offer) return fail("An accepted offer is required to fund a deal.");
  const docs = data.documents.filter((d) => d.applicationId === id);
  const c = documentCompleteness(docs);
  if (c.verified < c.required) return fail("All required documents must be verified before funding.");
  const fundedAmount = opts.fundedAmount ?? offer.approvedAmount;
  let next = patchApp(data, id, { fundedAt: ctx.now, fundedAmount }, ctx);
  // Commissions become payable at funding. Realised amounts start at the estimate.
  const existing = next.commissions.filter((x) => x.applicationId === id && x.status !== "void");
  let commissions: Commission[];
  if (existing.length) {
    commissions = next.commissions.map((x) =>
      x.applicationId === id && x.status === "estimated"
        ? { ...x, fundingAmount: fundedAmount, estimated: recalcEstimated({ ...x, fundingAmount: fundedAmount }), status: "pending" as const, actual: recalcEstimated({ ...x, fundingAmount: fundedAmount }), createdAt: ctx.now }
        : x,
    );
  } else {
    const lender = getLender(next, offer.lenderId)!;
    const lines = buildCommissionLines({ application: { ...app, fundedAmount }, offer: { ...offer, approvedAmount: fundedAmount }, lender, settings: next.settings, now: ctx.now });
    commissions = [...next.commissions, ...lines.map((l) => ({ ...l, status: "pending" as const, actual: l.estimated }))];
  }
  next = { ...next, commissions };
  const fresh = getApp(next, id)!;
  next = applyStatus(next, { ...fresh, status: "contracting" }, "funded", ctx, `${formatMoney(fundedAmount, app.currency)} funded`);
  return ok(next, undefined);
}

/** Auto-advance the application from lender decisions (never past offer acceptance). */
function deriveFromSubmissions(data: AppData, id: string, ctx: Ctx): AppData {
  const app = getApp(data, id);
  if (!app) return data;
  if (!["submitted", "under_review", "conditionally_approved", "approved", "declined"].includes(app.status)) return data;
  const live = data.submissions.filter((s) => s.applicationId === id && s.status !== "withdrawn");
  if (!live.length) return data;
  let target: ApplicationStatus | undefined;
  if (live.some((s) => s.status === "approved")) target = "approved";
  else if (live.some((s) => s.status === "conditionally_approved")) target = "conditionally_approved";
  else if (live.some((s) => s.status === "under_review" || s.status === "info_requested")) target = "under_review";
  else if (live.every((s) => s.status === "declined")) target = "declined";
  else if (live.some((s) => s.status === "submitted")) target = "submitted";
  if (!target || target === app.status) return data;
  return applyStatus(data, app, target, ctx, undefined, true);
}

/* ------------------------------------------------------------------ */
/* lender submissions                                                  */
/* ------------------------------------------------------------------ */

export interface SubmissionEntry {
  lenderId: string;
  programId?: string;
  method: SubmissionMethod;
  referenceNumber: string;
  contactPerson: string;
  submittedAt: string;
  followUpDate?: string;
  notes?: string;
}

const OPEN_SUB: SubmissionStatus[] = ["queued", "submitted", "under_review", "info_requested", "conditionally_approved", "approved"];

export function submitToLenders(data: AppData, applicationId: string, entries: SubmissionEntry[], ctx: Ctx): WfResult<LenderSubmission[]> {
  const app = getApp(data, applicationId);
  if (!app) return fail("Application not found.");
  if (!["ready_to_submit", "submitted", "under_review", "conditionally_approved", "approved", "declined"].includes(app.status)) {
    return fail(`Applications in “${APPLICATION_STATUS_META[app.status].label}” cannot be submitted to lenders.`);
  }
  if (!entries.length) return fail("Select at least one lender.");
  const created: LenderSubmission[] = [];
  let next = data;
  for (const e of entries) {
    const lender = getLender(next, e.lenderId);
    if (!lender) return fail("Lender not found.");
    if (!lender.active) return fail(`${lender.name} is inactive.`);
    const dup = next.submissions.find((s) => s.applicationId === applicationId && s.lenderId === e.lenderId && OPEN_SUB.includes(s.status));
    if (dup) return fail(`${lender.name} already has an open submission for this application.`);
    if (!e.referenceNumber.trim() && lender.integration === "manual") {
      // Reference may be recorded later, but we flag it clearly rather than inventing one.
    }
    const sub: LenderSubmission = {
      id: uid("sub"),
      applicationId,
      lenderId: e.lenderId,
      programId: e.programId,
      status: "submitted",
      method: e.method,
      referenceNumber: e.referenceNumber.trim(),
      contactPerson: e.contactPerson,
      submittedAt: e.submittedAt,
      followUpDate: e.followUpDate,
      notes: e.notes ?? "",
      conditions: [],
      history: [
        {
          id: uid("evt"),
          at: e.submittedAt,
          status: "submitted",
          note: `${e.method === "api_demo" ? "Simulated API submission" : "Manual submission recorded"}. Nothing was transmitted by this prototype.`,
          actorId: ctx.actorId,
        },
      ],
      simulated: true,
    };
    created.push(sub);
    next = { ...next, submissions: [...next.submissions, sub] };
    next = log(next, ctx, {
      applicationId,
      customerId: app.customerId,
      type: "submission",
      message: `Submission recorded for ${lender.name}${e.referenceNumber ? ` (ref ${e.referenceNumber})` : ""} — simulated`,
      simulated: true,
    });
    if (e.followUpDate) {
      next = addTaskInternal(next, ctx, {
        applicationId,
        customerId: app.customerId,
        lenderId: lender.id,
        kind: "lender",
        title: `Follow up with ${lender.name} on ${app.id}`,
        dueDate: e.followUpDate,
        assigneeId: ctx.actorId,
      });
    }
  }
  const fresh = getApp(next, applicationId)!;
  if (fresh.status === "ready_to_submit" || fresh.status === "declined") {
    next = applyStatus(next, fresh, "submitted", ctx, `${created.length} lender${created.length > 1 ? "s" : ""} (simulated)`);
  } else {
    next = patchApp(next, applicationId, {}, ctx);
  }
  return ok(next, created);
}

export interface SubmissionUpdate {
  status?: SubmissionStatus;
  note?: string;
  referenceNumber?: string;
  contactPerson?: string;
  method?: SubmissionMethod;
  submittedAt?: string;
  followUpDate?: string | null;
  notes?: string;
  addConditions?: string[];
  offeredTerms?: LenderSubmission["offeredTerms"];
}

export function updateSubmission(data: AppData, submissionId: string, u: SubmissionUpdate, ctx: Ctx): WfResult<LenderSubmission> {
  const sub = data.submissions.find((s) => s.id === submissionId);
  if (!sub) return fail("Submission not found.");
  const app = getApp(data, sub.applicationId);
  const lender = getLender(data, sub.lenderId);
  if (!app || !lender) return fail("Related records not found.");
  if (u.status === "conditionally_approved" && !(u.addConditions?.length || sub.conditions.length)) {
    return fail("Add at least one condition for a conditional approval.");
  }
  if (u.status === "approved" && sub.conditions.some((c) => !c.resolved)) {
    return fail("Resolve all conditions before marking this submission approved.");
  }
  if (u.status && u.status !== sub.status && ["offer_accepted", "contracting", "funded", "closed"].includes(app.status)) {
    return fail("This application has moved past lender decisions; lender statuses are locked.");
  }
  const terminal: SubmissionStatus[] = ["conditionally_approved", "approved", "declined", "withdrawn"];
  const statusChanged = u.status !== undefined && u.status !== sub.status;
  const newConditions = (u.addConditions ?? []).filter((t) => t.trim()).map((text) => ({ id: uid("cond"), text: text.trim(), resolved: false }));
  const updated: LenderSubmission = {
    ...sub,
    status: u.status ?? sub.status,
    referenceNumber: u.referenceNumber ?? sub.referenceNumber,
    contactPerson: u.contactPerson ?? sub.contactPerson,
    method: u.method ?? sub.method,
    submittedAt: u.submittedAt ?? sub.submittedAt,
    followUpDate: u.followUpDate === null ? undefined : (u.followUpDate ?? sub.followUpDate),
    notes: u.notes ?? sub.notes,
    conditions: [...sub.conditions, ...newConditions],
    offeredTerms: u.offeredTerms ?? sub.offeredTerms,
    decisionAt: statusChanged && u.status && terminal.includes(u.status) ? ctx.now : sub.decisionAt,
    history:
      statusChanged || u.note
        ? [...sub.history, { id: uid("evt"), at: ctx.now, status: u.status ?? sub.status, note: u.note ?? `Status recorded: ${u.status}`, actorId: ctx.actorId }]
        : sub.history,
  };
  let next: AppData = { ...data, submissions: data.submissions.map((s) => (s.id === sub.id ? updated : s)) };
  if (statusChanged) {
    next = log(next, ctx, {
      applicationId: app.id,
      customerId: app.customerId,
      type: "decision",
      message: `${lender.name}: ${sub.status.replace(/_/g, " ")} → ${updated.status.replace(/_/g, " ")}${u.note ? ` — ${u.note}` : ""}`,
    });
    const who = appLabel(next, app);
    if (updated.status === "conditionally_approved") {
      next = notify(next, ctx, { type: "conditional_approval", title: "Conditional approval recorded", body: `${lender.name} conditionally approved ${who}.`, applicationId: app.id });
    } else if (updated.status === "declined") {
      next = notify(next, ctx, { type: "lender_response", title: "Lender declined", body: `${lender.name} declined ${who}.`, applicationId: app.id });
    } else if (terminal.includes(updated.status) || updated.status === "info_requested") {
      next = notify(next, ctx, { type: "lender_response", title: "Lender response recorded", body: `${lender.name}: ${updated.status.replace(/_/g, " ")} on ${who}.`, applicationId: app.id });
    }
    next = deriveFromSubmissions(next, app.id, ctx);
  } else {
    next = log(next, ctx, { applicationId: app.id, customerId: app.customerId, type: "submission", message: `${lender.name}: submission details updated` });
  }
  next = patchApp(next, app.id, {}, ctx);
  return ok(next, updated);
}

export function setConditionResolved(data: AppData, submissionId: string, conditionId: string, resolved: boolean, ctx: Ctx): WfResult {
  const sub = data.submissions.find((s) => s.id === submissionId);
  if (!sub) return fail("Submission not found.");
  const app = getApp(data, sub.applicationId);
  const lender = getLender(data, sub.lenderId);
  if (!app || !lender) return fail("Related records not found.");
  if (["offer_accepted", "contracting", "funded", "closed"].includes(app.status)) return fail("Conditions are locked once an offer is accepted.");
  const cond = sub.conditions.find((c) => c.id === conditionId);
  if (!cond) return fail("Condition not found.");
  const conditions = sub.conditions.map((c) => (c.id === conditionId ? { ...c, resolved, resolvedAt: resolved ? ctx.now : undefined } : c));
  const allResolved = conditions.every((c) => c.resolved);
  let status = sub.status;
  const history = [...sub.history];
  history.push({ id: uid("evt"), at: ctx.now, status: sub.status, note: `Condition ${resolved ? "resolved" : "re-opened"}: ${cond.text}`, actorId: ctx.actorId });
  if (allResolved && sub.status === "conditionally_approved") {
    status = "approved";
    history.push({ id: uid("evt"), at: ctx.now, status: "approved", note: "All conditions resolved — approval confirmed.", actorId: ctx.actorId });
  } else if (!allResolved && sub.status === "approved") {
    status = "conditionally_approved";
    history.push({ id: uid("evt"), at: ctx.now, status: "conditionally_approved", note: "Condition re-opened — approval is conditional again.", actorId: ctx.actorId });
  }
  let next: AppData = { ...data, submissions: data.submissions.map((s) => (s.id === sub.id ? { ...sub, conditions, status, history, decisionAt: status !== sub.status ? ctx.now : sub.decisionAt } : s)) };
  next = log(next, ctx, { applicationId: app.id, customerId: app.customerId, type: "condition", message: `${lender.name}: condition ${resolved ? "resolved" : "re-opened"} — ${cond.text}` });
  if (status !== sub.status) {
    next = notify(next, ctx, {
      type: status === "approved" ? "application_approved" : "conditional_approval",
      title: status === "approved" ? "Conditions resolved" : "Condition re-opened",
      body: `${lender.name} ${status === "approved" ? "approval is unconditional" : "approval is conditional again"} for ${appLabel(next, app)}.`,
      applicationId: app.id,
    });
    next = deriveFromSubmissions(next, app.id, ctx);
  }
  next = patchApp(next, app.id, {}, ctx);
  return ok(next, undefined);
}

/* ------------------------------------------------------------------ */
/* offers                                                              */
/* ------------------------------------------------------------------ */

export interface OfferInput {
  id?: string;
  applicationId: string;
  lenderId: string;
  product: FinancingType;
  approvedAmount: number;
  downPayment: number;
  apr?: number;
  moneyFactor?: number;
  termMonths: number;
  fees: number;
  residualValue?: number;
  expiresAt: string;
  conditions: string[];
  status?: OfferStatus;
  notes?: string;
}

export function saveOffer(data: AppData, input: OfferInput, ctx: Ctx): WfResult<FinancingOffer> {
  const app = getApp(data, input.applicationId);
  const lender = getLender(data, input.lenderId);
  if (!app) return fail("Application not found.");
  if (!lender) return fail("Lender not found.");
  const sub = data.submissions.find((s) => s.applicationId === app.id && s.lenderId === lender.id && s.status !== "withdrawn");
  if (!sub) return fail(`Record a submission to ${lender.name} before adding its offer.`);
  if (!(input.approvedAmount > 0)) return fail("Approved amount must be greater than 0.");
  if (!(input.termMonths > 0)) return fail("Term must be greater than 0.");
  if (input.product === "loan" && (input.apr === undefined || input.apr < 0)) return fail("Enter an APR for a loan offer.");
  if (input.product === "lease" && (input.moneyFactor === undefined || input.moneyFactor < 0 || !input.residualValue)) {
    return fail("Lease offers need a money factor and residual value.");
  }
  if (input.product === "lease" && input.residualValue! >= input.approvedAmount) return fail("Residual value must be lower than the capitalized amount.");
  const existing = input.id ? data.offers.find((o) => o.id === input.id) : undefined;
  if (existing && existing.status === "accepted") return fail("Accepted offers can't be edited. Close or restart the deal first.");
  const econ = computeOfferEconomics({
    product: input.product,
    approvedAmount: input.approvedAmount,
    downPayment: input.downPayment,
    apr: input.apr,
    moneyFactor: input.moneyFactor,
    termMonths: input.termMonths,
    fees: input.fees,
    residualValue: input.residualValue,
  });
  const offer: FinancingOffer = {
    id: existing?.id ?? uid("off"),
    applicationId: app.id,
    lenderId: lender.id,
    submissionId: sub.id,
    product: input.product,
    status: input.status ?? existing?.status ?? "active",
    approvedAmount: input.approvedAmount,
    downPayment: input.downPayment,
    apr: input.product === "loan" ? input.apr : undefined,
    moneyFactor: input.product === "lease" ? input.moneyFactor : undefined,
    termMonths: input.termMonths,
    monthlyPayment: econ.monthlyPayment,
    fees: input.fees,
    residualValue: input.product === "lease" ? input.residualValue : undefined,
    totalCost: econ.totalCost,
    expiresAt: input.expiresAt,
    conditions: input.conditions,
    createdAt: existing?.createdAt ?? ctx.now,
    notes: input.notes,
  };
  let next: AppData = {
    ...data,
    offers: existing ? data.offers.map((o) => (o.id === offer.id ? offer : o)) : [...data.offers, offer],
  };
  next = log(next, ctx, {
    applicationId: app.id,
    customerId: app.customerId,
    type: "offer_recorded",
    message: `${existing ? "Offer updated" : "Offer recorded"}: ${lender.name} — ${formatMoney(offer.monthlyPayment, app.currency, { decimals: true })}/mo × ${offer.termMonths}`,
  });
  next = patchApp(next, app.id, {}, ctx);
  return ok(next, offer);
}

export function deleteOffer(data: AppData, offerId: string, ctx: Ctx): WfResult {
  const o = data.offers.find((x) => x.id === offerId);
  if (!o) return fail("Offer not found.");
  if (o.status !== "draft") return fail("Only draft offers can be deleted.");
  return ok(log({ ...data, offers: data.offers.filter((x) => x.id !== offerId) }, ctx, { applicationId: o.applicationId, type: "offer_recorded", message: "Draft offer deleted" }), undefined);
}

export function acceptOffer(data: AppData, offerId: string, ctx: Ctx): WfResult {
  const offer = data.offers.find((o) => o.id === offerId);
  if (!offer) return fail("Offer not found.");
  const app = getApp(data, offer.applicationId);
  if (!app) return fail("Application not found.");
  const lender = getLender(data, offer.lenderId)!;
  if (offer.status !== "active") return fail(`Only active offers can be accepted (this one is ${offer.status}).`);
  if (new Date(offer.expiresAt).getTime() < new Date(ctx.now).getTime()) return fail("This offer has expired. Ask the lender to refresh it.");
  if (app.acceptedOfferId) return fail("An offer has already been accepted for this application.");
  if (!["approved", "conditionally_approved"].includes(app.status)) {
    return fail("Offers can only be accepted while the application is Approved or Conditionally Approved.");
  }
  const sub = offer.submissionId ? data.submissions.find((s) => s.id === offer.submissionId) : undefined;
  if (sub && sub.status !== "approved") {
    return fail(sub.status === "conditionally_approved" ? "Resolve all lender conditions before accepting this offer." : `The lender submission is ${sub.status.replace(/_/g, " ")}; it must be approved first.`);
  }
  let next: AppData = {
    ...data,
    offers: data.offers.map((o) =>
      o.id === offerId
        ? { ...o, status: "accepted" as const }
        : o.applicationId === offer.applicationId && ["active", "draft"].includes(o.status)
          ? { ...o, status: "superseded" as const }
          : o,
    ),
    // Replace any prior estimates with lines for the accepted offer.
    commissions: [
      ...data.commissions.filter((c) => !(c.applicationId === app.id && c.status === "estimated")),
      ...buildCommissionLines({ application: app, offer, lender, settings: data.settings, now: ctx.now }),
    ],
  };
  next = patchApp(next, app.id, { acceptedOfferId: offerId }, ctx);
  next = log(next, ctx, { applicationId: app.id, customerId: app.customerId, type: "offer_accepted", message: `Offer accepted: ${lender.name} — ${formatMoney(offer.monthlyPayment, app.currency, { decimals: true })}/mo × ${offer.termMonths}` });
  next = notify(next, ctx, { type: "offer_accepted", title: "Offer accepted", body: `${appLabel(next, app)} accepted the ${lender.name} offer.`, applicationId: app.id });
  const fresh = getApp(next, app.id)!;
  next = applyStatus(next, fresh, "offer_accepted", ctx, lender.name);
  return ok(next, undefined);
}

export function rejectOffer(data: AppData, offerId: string, ctx: Ctx): WfResult {
  const offer = data.offers.find((o) => o.id === offerId);
  if (!offer) return fail("Offer not found.");
  if (offer.status === "accepted") return fail("An accepted offer can't be rejected. Close the application if the deal is cancelled.");
  if (!["active", "draft"].includes(offer.status)) return fail(`Offer is already ${offer.status}.`);
  const app = getApp(data, offer.applicationId)!;
  const lender = getLender(data, offer.lenderId)!;
  let next: AppData = { ...data, offers: data.offers.map((o) => (o.id === offerId ? { ...o, status: "rejected" as const } : o)) };
  next = log(next, ctx, { applicationId: app.id, customerId: app.customerId, type: "offer_rejected", message: `Offer rejected: ${lender.name}` });
  next = patchApp(next, app.id, {}, ctx);
  return ok(next, undefined);
}

/* ------------------------------------------------------------------ */
/* documents                                                           */
/* ------------------------------------------------------------------ */

export function setDocumentStatus(data: AppData, docId: string, status: DocumentStatus, ctx: Ctx, note?: string): WfResult {
  const doc = data.documents.find((d) => d.id === docId);
  if (!doc) return fail("Document not found.");
  const app = getApp(data, doc.applicationId);
  if (!app) return fail("Application not found.");
  if (status !== "missing" && !doc.fileName) return fail("Attach a file before changing the status.");
  const updated: DocumentRecord = {
    ...doc,
    status,
    note: note ?? (status === "rejected" ? doc.note : undefined),
    verifiedById: status === "verified" ? ctx.actorId : undefined,
    verifiedAt: status === "verified" ? ctx.now : undefined,
    checklist: status === "verified" ? doc.checklist.map((c) => ({ ...c, done: true })) : doc.checklist,
    ...(status === "missing" ? { fileName: undefined, fileSize: undefined, mimeType: undefined, uploadedAt: undefined } : {}),
  };
  let next: AppData = { ...data, documents: data.documents.map((d) => (d.id === docId ? updated : d)) };
  next = log(next, ctx, { applicationId: app.id, customerId: app.customerId, type: "document", message: `${doc.label}: marked ${status.replace(/_/g, " ")}` });
  if (status === "rejected") {
    next = notify(next, ctx, { type: "missing_documents", title: "Document rejected", body: `${doc.label} for ${appLabel(next, app)} was rejected${note ? `: ${note}` : ""}.`, applicationId: app.id });
  }
  next = patchApp(next, app.id, {}, ctx);
  return ok(next, undefined);
}

export function attachDocument(
  data: AppData,
  docId: string,
  file: { fileName: string; fileSize: number; mimeType: string },
  ctx: Ctx,
): WfResult {
  const doc = data.documents.find((d) => d.id === docId);
  if (!doc) return fail("Document not found.");
  const app = getApp(data, doc.applicationId);
  if (!app) return fail("Application not found.");
  const updated: DocumentRecord = {
    ...doc,
    ...file,
    status: "uploaded",
    uploadedAt: ctx.now,
    verifiedAt: undefined,
    verifiedById: undefined,
    note: undefined,
    checklist: doc.checklist.map((c) => ({ ...c, done: false })),
  };
  let next: AppData = { ...data, documents: data.documents.map((d) => (d.id === docId ? updated : d)) };
  next = log(next, ctx, { applicationId: app.id, customerId: app.customerId, type: "document", message: `${doc.label}: ${file.fileName} attached (demo — file not stored)` , simulated: true });
  next = patchApp(next, app.id, {}, ctx);
  return ok(next, undefined);
}

export function toggleChecklistItem(data: AppData, docId: string, itemId: string): WfResult {
  const doc = data.documents.find((d) => d.id === docId);
  if (!doc) return fail("Document not found.");
  return ok({ ...data, documents: data.documents.map((d) => (d.id === docId ? { ...d, checklist: d.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)) } : d)) }, undefined);
}

export function addDocumentRequirement(data: AppData, applicationId: string, type: DocumentType, ctx: Ctx, label?: string): WfResult<DocumentRecord> {
  const app = getApp(data, applicationId);
  if (!app) return fail("Application not found.");
  const rec = docRecordFromDraft({ type, label: label || DOCUMENT_TYPE_LABEL[type], required: true, status: "missing" }, applicationId, ctx);
  let next: AppData = { ...data, documents: [...data.documents, rec] };
  next = log(next, ctx, { applicationId, customerId: app.customerId, type: "document", message: `Requirement added: ${rec.label}` });
  return ok(next, rec);
}

/* ------------------------------------------------------------------ */
/* tasks, notes, emails, notifications                                 */
/* ------------------------------------------------------------------ */

function addTaskInternal(
  data: AppData,
  ctx: Ctx,
  t: { applicationId?: string; customerId?: string; lenderId?: string; kind: TaskKind; title: string; dueDate: string; assigneeId: string },
): AppData {
  const task: FollowUpTask = { id: uid("task"), done: false, createdAt: ctx.now, ...t };
  return { ...data, tasks: [task, ...data.tasks] };
}

export function addTask(data: AppData, t: Parameters<typeof addTaskInternal>[2], ctx: Ctx): WfResult {
  if (!t.title.trim()) return fail("Enter a task title.");
  let next = addTaskInternal(data, ctx, t);
  if (t.applicationId) next = log(next, ctx, { applicationId: t.applicationId, type: "task", message: `Follow-up added: ${t.title}` });
  return ok(next, undefined);
}

export function toggleTask(data: AppData, taskId: string, ctx: Ctx): WfResult {
  const t = data.tasks.find((x) => x.id === taskId);
  if (!t) return fail("Task not found.");
  let next: AppData = { ...data, tasks: data.tasks.map((x) => (x.id === taskId ? { ...x, done: !x.done } : x)) };
  if (t.applicationId && !t.done) next = log(next, ctx, { applicationId: t.applicationId, type: "task", message: `Follow-up completed: ${t.title}` });
  return ok(next, undefined);
}

export function deleteTask(data: AppData, taskId: string): WfResult {
  return ok({ ...data, tasks: data.tasks.filter((t) => t.id !== taskId) }, undefined);
}

export function addApplicationNote(data: AppData, applicationId: string, body: string, ctx: Ctx): WfResult {
  if (!body.trim()) return fail("Note is empty.");
  const app = getApp(data, applicationId);
  if (!app) return fail("Application not found.");
  const note = { id: uid("note"), authorId: ctx.actorId, body: body.trim(), createdAt: ctx.now };
  let next = patchApp(data, applicationId, { notes: [note, ...app.notes] }, ctx);
  next = log(next, ctx, { applicationId, customerId: app.customerId, type: "note", message: "Internal note added" });
  return ok(next, undefined);
}

export function addCustomerNote(data: AppData, customerId: string, body: string, ctx: Ctx): WfResult {
  if (!body.trim()) return fail("Note is empty.");
  const note = { id: uid("note"), authorId: ctx.actorId, body: body.trim(), createdAt: ctx.now };
  return ok({ ...data, customers: data.customers.map((c) => (c.id === customerId ? { ...c, notes: [note, ...c.notes] } : c)) }, undefined);
}

export function saveCustomer(data: AppData, customer: Customer): WfResult<Customer> {
  const dup = data.customers.find((c) => c.id !== customer.id && c.email.toLowerCase() === customer.email.toLowerCase());
  if (dup) return fail(`Another customer already uses ${customer.email}.`);
  const exists = data.customers.some((c) => c.id === customer.id);
  return ok({ ...data, customers: exists ? data.customers.map((c) => (c.id === customer.id ? customer : c)) : [customer, ...data.customers] }, customer);
}

export function recordEmail(
  data: AppData,
  email: Omit<EmailRecord, "id" | "createdAt" | "authorId" | "sentAt">,
  ctx: Ctx,
): WfResult<EmailRecord> {
  if (!email.subject.trim() || !email.body.trim()) return fail("Subject and body are required.");
  const record: EmailRecord = { ...email, id: uid("eml"), createdAt: ctx.now, authorId: ctx.actorId, sentAt: email.status === "simulated_sent" ? ctx.now : undefined };
  let next: AppData = { ...data, emails: [record, ...data.emails] };
  if (email.applicationId) {
    next = log(next, ctx, {
      applicationId: email.applicationId,
      type: "email",
      message: email.status === "simulated_sent" ? `Simulated email sent to ${email.toName}: “${email.subject}”` : `Email draft saved for ${email.toName}`,
      simulated: email.status === "simulated_sent",
    });
    next = patchApp(next, email.applicationId, {}, ctx);
  }
  return ok(next, record);
}

export function markNotification(data: AppData, id: string, read: boolean): WfResult {
  return ok({ ...data, notifications: data.notifications.map((n) => (n.id === id ? { ...n, read } : n)) }, undefined);
}

export function markAllNotificationsRead(data: AppData): WfResult {
  return ok({ ...data, notifications: data.notifications.map((n) => ({ ...n, read: true })) }, undefined);
}

/* ------------------------------------------------------------------ */
/* lenders, programs, commissions, settings                            */
/* ------------------------------------------------------------------ */

export function saveLender(data: AppData, lender: Lender): WfResult<Lender> {
  if (!lender.name.trim()) return fail("Lender name is required.");
  if (lender.minAmount > lender.maxAmount) return fail("Minimum amount cannot exceed the maximum.");
  if (lender.aprMin > lender.aprMax) return fail("Minimum rate cannot exceed the maximum.");
  const exists = data.lenders.some((l) => l.id === lender.id);
  return ok({ ...data, lenders: exists ? data.lenders.map((l) => (l.id === lender.id ? lender : l)) : [...data.lenders, lender] }, lender);
}

export function setLenderActive(data: AppData, lenderId: string, active: boolean): WfResult {
  return ok({ ...data, lenders: data.lenders.map((l) => (l.id === lenderId ? { ...l, active } : l)) }, undefined);
}

export function saveProgram(data: AppData, program: LenderProgram): WfResult<LenderProgram> {
  if (!program.name.trim()) return fail("Program name is required.");
  if (program.minAmount > program.maxAmount) return fail("Minimum amount cannot exceed the maximum.");
  if (!program.terms.length) return fail("Add at least one term.");
  const exists = data.programs.some((p) => p.id === program.id);
  return ok({ ...data, programs: exists ? data.programs.map((p) => (p.id === program.id ? program : p)) : [...data.programs, program] }, program);
}

export function deleteProgram(data: AppData, programId: string): WfResult {
  return ok({ ...data, programs: data.programs.filter((p) => p.id !== programId) }, undefined);
}

export function updateCommission(data: AppData, id: string, patch: Partial<Pick<Commission, "actual" | "status" | "rate">>, ctx: Ctx): WfResult {
  const c = data.commissions.find((x) => x.id === id);
  if (!c) return fail("Commission not found.");
  if (patch.status === "paid" && !["pending", "paid"].includes(c.status)) return fail("Only funded deals can have commissions marked paid.");
  const merged: Commission = { ...c, ...patch };
  if (patch.rate !== undefined) merged.estimated = recalcEstimated(merged);
  if (patch.status === "paid") {
    merged.actual = merged.actual ?? merged.estimated;
    merged.paidAt = ctx.now;
  }
  if (patch.status && patch.status !== "paid") merged.paidAt = undefined;
  let next: AppData = { ...data, commissions: data.commissions.map((x) => (x.id === id ? merged : x)) };
  next = log(next, ctx, { applicationId: c.applicationId, type: "commission", message: `Commission updated (${c.kind.replace(/_/g, " ")}): ${merged.status}` });
  return ok(next, undefined);
}
