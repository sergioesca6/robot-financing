import type {
  ApplicationStatus,
  CommissionStatus,
  DocumentStatus,
  OfferStatus,
  SubmissionStatus,
} from "./types";

export type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "teal" | "violet";

export const APPLICATION_STATUS_ORDER: ApplicationStatus[] = [
  "draft",
  "needs_documents",
  "ready_to_submit",
  "submitted",
  "under_review",
  "conditionally_approved",
  "approved",
  "declined",
  "offer_accepted",
  "contracting",
  "funded",
  "closed",
];

export const APPLICATION_STATUS_META: Record<ApplicationStatus, { label: string; tone: Tone; description: string }> = {
  draft: { label: "Draft", tone: "neutral", description: "Being prepared; not yet ready for lenders." },
  needs_documents: { label: "Needs Documents", tone: "warning", description: "Required documents are outstanding." },
  ready_to_submit: { label: "Ready to Submit", tone: "info", description: "Complete and ready to send to lenders." },
  submitted: { label: "Submitted", tone: "info", description: "Submitted to one or more lenders." },
  under_review: { label: "Under Review", tone: "info", description: "At least one lender is reviewing." },
  conditionally_approved: { label: "Conditionally Approved", tone: "warning", description: "A lender approved subject to conditions." },
  approved: { label: "Approved", tone: "success", description: "At least one lender approved the request." },
  declined: { label: "Declined", tone: "danger", description: "All lenders declined." },
  offer_accepted: { label: "Offer Accepted", tone: "teal", description: "Customer accepted a financing offer." },
  contracting: { label: "Contracting", tone: "teal", description: "Contracts are being executed with the lender." },
  funded: { label: "Funded", tone: "success", description: "Funds released; deal complete." },
  closed: { label: "Closed / Cancelled", tone: "neutral", description: "Closed without funding." },
};

/** Allowed manual/system transitions. Guards are applied in the workflow layer. */
export const STATUS_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  draft: ["needs_documents", "ready_to_submit", "closed"],
  needs_documents: ["draft", "ready_to_submit", "closed"],
  ready_to_submit: ["needs_documents", "submitted", "closed"],
  submitted: ["under_review", "conditionally_approved", "approved", "declined", "closed"],
  under_review: ["conditionally_approved", "approved", "declined", "closed"],
  conditionally_approved: ["under_review", "approved", "declined", "offer_accepted", "closed"],
  approved: ["offer_accepted", "declined", "closed"],
  declined: ["ready_to_submit", "closed"],
  offer_accepted: ["contracting", "closed"],
  contracting: ["funded", "offer_accepted", "closed"],
  funded: ["closed"],
  closed: ["draft"],
};

/** Statuses at which the lender-submission workflow applies. */
export const SUBMITTABLE_STATUSES: ApplicationStatus[] = [
  "ready_to_submit",
  "submitted",
  "under_review",
  "conditionally_approved",
  "approved",
  "declined",
];

export const PENDING_STATUSES: ApplicationStatus[] = ["submitted", "under_review", "conditionally_approved"];
export const APPROVED_STATUSES: ApplicationStatus[] = ["approved", "offer_accepted", "contracting", "funded"];
export const ACTIVE_STATUSES: ApplicationStatus[] = APPLICATION_STATUS_ORDER.filter(
  (s) => s !== "funded" && s !== "closed" && s !== "declined",
);
export const PRE_SUBMISSION_STATUSES: ApplicationStatus[] = ["draft", "needs_documents", "ready_to_submit"];

export const SUBMISSION_STATUS_META: Record<SubmissionStatus, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "neutral" },
  submitted: { label: "Submitted", tone: "info" },
  under_review: { label: "Under Review", tone: "info" },
  info_requested: { label: "Info Requested", tone: "warning" },
  conditionally_approved: { label: "Conditional", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export const OFFER_STATUS_META: Record<OfferStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  active: { label: "Active", tone: "info" },
  accepted: { label: "Accepted", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  expired: { label: "Expired", tone: "danger" },
  superseded: { label: "Not selected", tone: "neutral" },
};

export const DOCUMENT_STATUS_META: Record<DocumentStatus, { label: string; tone: Tone }> = {
  missing: { label: "Missing", tone: "danger" },
  uploaded: { label: "Uploaded", tone: "info" },
  under_review: { label: "Under Review", tone: "warning" },
  verified: { label: "Verified", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

export const COMMISSION_STATUS_META: Record<CommissionStatus, { label: string; tone: Tone }> = {
  estimated: { label: "Estimated", tone: "neutral" },
  pending: { label: "Pending payment", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  void: { label: "Void", tone: "danger" },
};

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-500/15",
  info: "bg-blue-50 text-blue-700 ring-blue-600/15",
  warning: "bg-amber-50 text-amber-800 ring-amber-600/20",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  danger: "bg-red-50 text-red-700 ring-red-600/15",
  teal: "bg-teal-50 text-teal-700 ring-teal-600/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/15",
};

export const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-slate-400",
  info: "bg-blue-500",
  warning: "bg-amber-500",
  success: "bg-emerald-500",
  danger: "bg-red-500",
  teal: "bg-teal-500",
  violet: "bg-violet-500",
};
