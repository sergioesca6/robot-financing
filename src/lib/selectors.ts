import type {
  AppData,
  Customer,
  DocumentRecord,
  FinancingApplication,
  FinancingOffer,
  Lender,
  LenderSubmission,
} from "@/domain/types";

export interface DocCompleteness {
  required: number;
  received: number; // uploaded, under_review or verified
  verified: number;
  missing: DocumentRecord[]; // missing or rejected
  percentReceived: number;
  percentVerified: number;
}

export function documentCompleteness(docs: Pick<DocumentRecord, "required" | "status" | "label" | "type" | "id" | "applicationId" | "checklist">[]): DocCompleteness {
  const req = docs.filter((d) => d.required);
  const received = req.filter((d) => ["uploaded", "under_review", "verified"].includes(d.status));
  const verified = req.filter((d) => d.status === "verified");
  const missing = req.filter((d) => d.status === "missing" || d.status === "rejected") as DocumentRecord[];
  return {
    required: req.length,
    received: received.length,
    verified: verified.length,
    missing,
    percentReceived: req.length ? Math.round((received.length / req.length) * 100) : 100,
    percentVerified: req.length ? Math.round((verified.length / req.length) * 100) : 100,
  };
}

export const customerDisplayName = (c: Customer | undefined): string =>
  c ? (c.type === "business" ? (c.companyName ?? c.name) : c.name) : "Unknown customer";

export const robotLabel = (a: FinancingApplication): string =>
  `${a.robot.manufacturer} ${a.robot.model}${a.robot.quantity > 1 ? ` × ${a.robot.quantity}` : ""}`;

export function indexById<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}

export function submissionsFor(data: AppData, applicationId: string): LenderSubmission[] {
  return data.submissions.filter((s) => s.applicationId === applicationId);
}

export function offersFor(data: AppData, applicationId: string): FinancingOffer[] {
  return data.offers.filter((o) => o.applicationId === applicationId);
}

export function documentsFor(data: AppData, applicationId: string): DocumentRecord[] {
  return data.documents.filter((d) => d.applicationId === applicationId);
}

export function acceptedOffer(data: AppData, app: FinancingApplication): FinancingOffer | undefined {
  return app.acceptedOfferId ? data.offers.find((o) => o.id === app.acceptedOfferId) : undefined;
}

export function lenderOf(data: AppData, id: string): Lender | undefined {
  return data.lenders.find((l) => l.id === id);
}

export function isOfferExpired(o: FinancingOffer, now: Date = new Date()): boolean {
  return o.status === "active" && new Date(o.expiresAt).getTime() < now.getTime();
}

/** Whole days until an offer expires (negative once expired). */
export function offerDaysLeft(o: FinancingOffer, now: Date = new Date()): number {
  return Math.ceil((new Date(o.expiresAt).getTime() - now.getTime()) / 86400000);
}
