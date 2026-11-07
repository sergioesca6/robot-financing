import { beforeEach, describe, expect, it } from "vitest";
import { createSeedData } from "@/data/seed";
import type { AppData, Customer, FinancingApplication } from "@/domain/types";
import { canTransition } from "@/domain/status";
import { computeKpis, filterApplications, DEFAULT_FILTERS } from "../metrics";
import { addDays } from "../format";
import { documentCompleteness } from "../selectors";
import * as wf from "../workflow";
import type { ApplicationInput, Ctx, DocumentDraft, WfResult } from "../workflow";

const ctx = (): Ctx => ({ now: new Date().toISOString(), actorId: "emp-dana" });

function must<T>(r: WfResult<T>): { data: AppData; value: T } {
  if (!r.ok) throw new Error(`Expected success but got: ${r.error}`);
  return r;
}

const verifiedDocs = (type: Customer["type"]): DocumentDraft[] =>
  wf.defaultDocumentDrafts(type).map((d) => ({ ...d, status: "verified" as const, fileName: `${d.type}.pdf`, fileSize: 100_000, mimeType: "application/pdf" }));

let data: AppData;
beforeEach(() => {
  data = createSeedData();
});

describe("seed data integrity", () => {
  it("meets the demo-volume requirements", () => {
    expect(data.applications.length).toBeGreaterThanOrEqual(20);
    expect(data.customers.length).toBeGreaterThanOrEqual(12);
    expect(data.lenders.length).toBeGreaterThanOrEqual(6);
    expect(data.robots.length).toBeGreaterThanOrEqual(10);
    expect(data.offers.length).toBeGreaterThanOrEqual(15);
    expect(data.applications.some((a) => a.financingType === "lease")).toBe(true);
    expect(new Set(data.applications.map((a) => a.country))).toEqual(new Set(["US", "CA"]));
  });

  it("links every record through valid IDs", () => {
    const cust = new Set(data.customers.map((c) => c.id));
    const apps = new Set(data.applications.map((a) => a.id));
    const lenders = new Set(data.lenders.map((l) => l.id));
    const emps = new Set(data.employees.map((e) => e.id));
    data.applications.forEach((a) => {
      expect(cust.has(a.customerId)).toBe(true);
      expect(emps.has(a.assignedEmployeeId)).toBe(true);
    });
    data.submissions.forEach((s) => {
      expect(apps.has(s.applicationId)).toBe(true);
      expect(lenders.has(s.lenderId)).toBe(true);
    });
    data.offers.forEach((o) => {
      expect(apps.has(o.applicationId)).toBe(true);
      expect(lenders.has(o.lenderId)).toBe(true);
    });
    data.commissions.forEach((c) => {
      expect(apps.has(c.applicationId)).toBe(true);
      expect(lenders.has(c.lenderId)).toBe(true);
    });
    data.documents.forEach((d) => expect(apps.has(d.applicationId)).toBe(true));
    // Accepted offers belong to their application.
    data.applications.filter((a) => a.acceptedOfferId).forEach((a) => {
      expect(data.offers.find((o) => o.id === a.acceptedOfferId)?.applicationId).toBe(a.id);
    });
  });

  it("only funded deals carry realised commissions", () => {
    const funded = new Set(data.applications.filter((a) => a.status === "funded").map((a) => a.id));
    data.commissions.filter((c) => c.status === "paid" || c.status === "pending").forEach((c) => expect(funded.has(c.applicationId)).toBe(true));
  });
});

describe("status model", () => {
  it("rejects nonsensical transitions", () => {
    expect(canTransition("draft", "funded")).toBe(false);
    expect(canTransition("declined", "funded")).toBe(false);
    expect(canTransition("contracting", "funded")).toBe(true);
  });

  it("blocks moving to contracting without an accepted offer", () => {
    const app = data.applications.find((a) => a.status === "approved")!;
    const r = wf.changeApplicationStatus(data, app.id, "contracting", ctx());
    expect(r.ok).toBe(false);
  });

  it("blocks marking approved without an approved lender decision", () => {
    const app = data.applications.find((a) => a.status === "under_review")!;
    const r = wf.changeApplicationStatus(data, app.id, "approved", ctx());
    expect(r.ok).toBe(false);
  });

  it("blocks ready-to-submit while required documents are missing", () => {
    const app = data.applications.find((a) => a.status === "needs_documents")!;
    const r = wf.changeApplicationStatus(data, app.id, "ready_to_submit", ctx());
    expect(r.ok).toBe(false);
  });

  it("every status change records activity and a notification", () => {
    const app = data.applications.find((a) => a.status === "draft")!;
    const before = { act: data.activity.length, ntf: data.notifications.length };
    const r = must(wf.changeApplicationStatus(data, app.id, "closed", ctx()));
    expect(r.data.activity.length).toBeGreaterThan(before.act);
    expect(r.data.notifications.length).toBeGreaterThan(before.ntf);
    expect(r.data.applications.find((a) => a.id === app.id)!.status).toBe("closed");
  });
});

describe("lender submissions are independent of application status", () => {
  it("tracks per-lender decisions and derives the overall status", () => {
    const app = data.applications.find((a) => a.status === "under_review" && data.submissions.filter((s) => s.applicationId === a.id).length === 2)!;
    const subs = data.submissions.filter((s) => s.applicationId === app.id);
    // First lender declines: application stays under review because another lender is pending.
    let r = must(wf.updateSubmission(data, subs[0]!.id, { status: "declined", note: "Credit" }, ctx()));
    expect(r.data.applications.find((a) => a.id === app.id)!.status).toBe("under_review");
    expect(r.data.submissions.find((s) => s.id === subs[0]!.id)!.status).toBe("declined");
    // Second lender declines: application is declined.
    r = must(wf.updateSubmission(r.data, subs[1]!.id, { status: "declined" }, ctx()));
    expect(r.data.applications.find((a) => a.id === app.id)!.status).toBe("declined");
  });

  it("requires conditions for a conditional approval and resolves them before approval", () => {
    const app = data.applications.find((a) => a.status === "under_review")!;
    const sub = data.submissions.find((s) => s.applicationId === app.id && s.status === "under_review")!;
    expect(wf.updateSubmission(data, sub.id, { status: "conditionally_approved" }, ctx()).ok).toBe(false);
    let r: { data: AppData; value: unknown } = must(wf.updateSubmission(data, sub.id, { status: "conditionally_approved", addConditions: ["Proof of insurance"] }, ctx()));
    expect(r.data.applications.find((a) => a.id === app.id)!.status).toBe("conditionally_approved");
    expect(wf.updateSubmission(r.data, sub.id, { status: "approved" }, ctx()).ok).toBe(false);
    const cond = r.data.submissions.find((s) => s.id === sub.id)!.conditions[0]!;
    r = must(wf.setConditionResolved(r.data, sub.id, cond.id, true, ctx()));
    expect(r.data.submissions.find((s) => s.id === sub.id)!.status).toBe("approved");
    expect(r.data.applications.find((a) => a.id === app.id)!.status).toBe("approved");
  });

  it("prevents duplicate open submissions to the same lender", () => {
    const app = data.applications.find((a) => a.status === "submitted")!;
    const sub = data.submissions.find((s) => s.applicationId === app.id)!;
    const r = wf.submitToLenders(data, app.id, [{ lenderId: sub.lenderId, method: "email", referenceNumber: "X", contactPerson: "", submittedAt: ctx().now }], ctx());
    expect(r.ok).toBe(false);
  });
});

describe("FLOW A — US business industrial robot, two offers, compare, accept, fund", () => {
  it("runs end-to-end and updates dashboard KPIs and commissions", () => {
    const filters = { ...DEFAULT_FILTERS, range: "all" as const };
    const kpiBefore = computeKpis(filterApplications(data, filters));
    const commissionsBefore = data.commissions.length;

    // 1. Create application (ready to submit, documents verified)
    const input: ApplicationInput = {
      newCustomer: {
        type: "business",
        name: "Taylor Reed",
        companyName: "Reed Precision Stamping",
        email: "t.reed@reedstamping.example",
        phone: "+1 (555) 010-7788",
        country: "US",
        region: "OH",
        address: "1 Test Way, Dayton, OH",
        industry: "Manufacturing",
        yearsInBusiness: 12,
      },
      financingType: "loan",
      currency: "USD",
      country: "US",
      robot: { manufacturer: "FANUC", model: "M-20iD", category: "industrial", condition: "new", quantity: 2, unitPrice: 62000, installationCost: 4000, shippingCost: 2000 },
      downPayment: 13000,
      tradeInCredit: 0,
      preferredTermMonths: 60,
      profile: { credit: "good", annualRevenue: 8_000_000, yearsOperating: 12, ownership: "corporation" },
      assignedEmployeeId: "emp-priya",
      status: "ready_to_submit",
      documents: verifiedDocs("business"),
    };
    const r = must(wf.saveApplication(data, input, ctx()));
    let d = r.data;
    const app = r.value;
    expect(app.requestedAmount).toBe(117000);
    expect(app.status).toBe("ready_to_submit");

    // 2. Submit to two lenders (manual)
    const entries = ["lnd-northbridge", "lnd-atlas"].map((lenderId) => ({
      lenderId,
      method: "email" as const,
      referenceNumber: `REF-${lenderId}`,
      contactPerson: "Credit desk",
      submittedAt: ctx().now,
      followUpDate: addDays(new Date(), 3),
    }));
    const sr = must(wf.submitToLenders(d, app.id, entries, ctx()));
    d = sr.data;
    expect(d.applications.find((a) => a.id === app.id)!.status).toBe("submitted");
    const subs = sr.value;
    expect(subs).toHaveLength(2);
    expect(d.tasks.filter((t) => t.applicationId === app.id)).toHaveLength(2);

    // 3. Record decisions; overall status derives from lender decisions
    d = must(wf.updateSubmission(d, subs[0]!.id, { status: "approved", note: "Approved at 7.4%" }, ctx())).data;
    expect(d.applications.find((a) => a.id === app.id)!.status).toBe("approved");
    d = must(wf.updateSubmission(d, subs[1]!.id, { status: "approved", note: "Approved at 6.9%" }, ctx())).data;

    // 4. Record two offers
    const base = { applicationId: app.id, product: "loan" as const, approvedAmount: 117000, downPayment: 13000, termMonths: 60, fees: 495, expiresAt: addDays(new Date(), 30), conditions: [] };
    const o1 = must(wf.saveOffer(d, { ...base, lenderId: "lnd-northbridge", apr: 7.4 }, ctx()));
    d = o1.data;
    const o2 = must(wf.saveOffer(d, { ...base, lenderId: "lnd-atlas", apr: 6.9, termMonths: 72, fees: 995 }, ctx()));
    d = o2.data;
    const offers = d.offers.filter((o) => o.applicationId === app.id);
    expect(offers).toHaveLength(2);
    // 5. Compare: shorter-term offer has a higher payment; the longer one has a lower payment but is not auto-"best".
    expect(o2.value.monthlyPayment).toBeLessThan(o1.value.monthlyPayment);
    expect(o2.value.totalCost).not.toBe(o1.value.totalCost);

    // 6. Accept offer 2
    d = must(wf.acceptOffer(d, o2.value.id, ctx())).data;
    let current = d.applications.find((a) => a.id === app.id)!;
    expect(current.status).toBe("offer_accepted");
    expect(d.offers.find((o) => o.id === o1.value.id)!.status).toBe("superseded");
    const estimated = d.commissions.filter((c) => c.applicationId === app.id);
    expect(estimated.length).toBeGreaterThanOrEqual(2);
    expect(estimated.every((c) => c.status === "estimated")).toBe(true);
    // Dealer fee is explicit % of funding, not interest-derived: 1.75% x 117,000 = 2,047.50
    expect(estimated.find((c) => c.kind === "dealer_fee")!.estimated).toBe(2047.5);
    expect(estimated.find((c) => c.kind === "salesperson")!.estimated).toBeCloseTo(117000 * 0.005, 2);

    // 7. Contracting then funded
    expect(wf.fundDeal(d, app.id, ctx()).ok).toBe(false); // not yet contracting
    d = must(wf.changeApplicationStatus(d, app.id, "contracting", ctx())).data;
    d = must(wf.fundDeal(d, app.id, ctx())).data;
    current = d.applications.find((a) => a.id === app.id)!;
    expect(current.status).toBe("funded");
    expect(current.fundedAmount).toBe(117000);
    const lines = d.commissions.filter((c) => c.applicationId === app.id);
    expect(lines.every((c) => c.status === "pending" && c.actual === c.estimated)).toBe(true);

    // 8. Dashboard & commissions reflect the new deal
    const kpiAfter = computeKpis(filterApplications(d, filters));
    expect(kpiAfter.total).toBe(kpiBefore.total + 1);
    expect(kpiAfter.funded).toBe(kpiBefore.funded + 1);
    expect(kpiAfter.approved).toBe(kpiBefore.approved + 1);
    expect(kpiAfter.fundedVolumeUsd).toBeCloseTo(kpiBefore.fundedVolumeUsd + 117000, 0);
    expect(d.commissions.length).toBe(commissionsBefore + lines.length);

    // Notifications and activity were generated along the way
    const types = new Set(d.notifications.filter((n) => n.applicationId === app.id).map((n) => n.type));
    expect(types.has("new_application")).toBe(true);
    expect(types.has("lender_response")).toBe(true);
    expect(types.has("offer_accepted")).toBe(true);
    expect(types.has("deal_funded")).toBe(true);

    // Marking a commission paid works
    const first = lines[0]!;
    d = must(wf.updateCommission(d, first.id, { status: "paid" }, ctx())).data;
    expect(d.commissions.find((c) => c.id === first.id)!.status).toBe("paid");
  });
});

describe("FLOW B — Canadian consumer lease: document, conditional approval, conditions, accept, finalize", () => {
  it("runs end-to-end", () => {
    // 1. Create a Canadian consumer lease; one required document is missing -> Needs Documents
    const docs = wf.defaultDocumentDrafts("individual").map((d) => ({
      ...d,
      status: d.type === "proof_of_income" ? ("missing" as const) : ("uploaded" as const),
    }));
    const input: ApplicationInput = {
      newCustomer: {
        type: "individual",
        name: "Marie-Ève Laflamme",
        email: "me.laflamme@example.com",
        phone: "+1 (418) 555-0101",
        country: "CA",
        region: "QC",
        address: "10 Rue Test, Québec, QC",
      },
      financingType: "lease",
      currency: "CAD",
      country: "CA",
      robot: { manufacturer: "Unitree", model: "G1 EDU", category: "humanoid", condition: "new", quantity: 1, unitPrice: 51700, installationCost: 0, shippingCost: 900 },
      downPayment: 5000,
      tradeInCredit: 0,
      preferredTermMonths: 36,
      profile: { credit: "good", employment: "employed", annualIncome: 130000 },
      assignedEmployeeId: "emp-amelie",
      status: "needs_documents",
      documents: docs,
    };
    expect(wf.saveApplication(data, { ...input, status: "ready_to_submit" }, ctx()).ok).toBe(false);
    let d = must(wf.saveApplication(data, input, ctx())).data;
    const app = d.applications.find((a) => a.customerId === d.customers[0]!.id)!;
    expect(app.status).toBe("needs_documents");

    // 2. Upload a mock document and mark verified
    const poi = d.documents.find((x) => x.applicationId === app.id && x.type === "proof_of_income")!;
    expect(poi.status).toBe("missing");
    expect(wf.setDocumentStatus(d, poi.id, "verified", ctx()).ok).toBe(false); // needs a file first
    d = must(wf.attachDocument(d, poi.id, { fileName: "pay-stub-demo.pdf", fileSize: 120_000, mimeType: "application/pdf" }, ctx())).data;
    expect(d.documents.find((x) => x.id === poi.id)!.status).toBe("uploaded");
    for (const doc of d.documents.filter((x) => x.applicationId === app.id)) {
      d = must(wf.setDocumentStatus(d, doc.id, "verified", ctx())).data;
    }
    expect(documentCompleteness(d.documents.filter((x) => x.applicationId === app.id)).percentVerified).toBe(100);

    // 3. Ready to submit -> submit to Maple Leaf
    d = must(wf.changeApplicationStatus(d, app.id, "ready_to_submit", ctx())).data;
    const sub = must(wf.submitToLenders(d, app.id, [{ lenderId: "lnd-maple", method: "portal", referenceNumber: "ML-77001", contactPerson: "Isabelle Fortin", submittedAt: ctx().now }], ctx()));
    d = sub.data;

    // 4. Conditional decision
    d = must(wf.updateSubmission(d, sub.value[0]!.id, { status: "conditionally_approved", addConditions: ["Proof of address", "Void cheque / pre-authorized debit form"], note: "Conditional on two items" }, ctx())).data;
    expect(d.applications.find((a) => a.id === app.id)!.status).toBe("conditionally_approved");

    // Lease offer recorded while conditional
    const offer = must(wf.saveOffer(d, { applicationId: app.id, lenderId: "lnd-maple", product: "lease", approvedAmount: 47600, downPayment: 5000, moneyFactor: 0.0031, termMonths: 36, fees: 395, residualValue: 14000, expiresAt: addDays(new Date(), 21), conditions: ["Proof of address"] }, ctx()));
    d = offer.data;
    expect(offer.value.monthlyPayment).toBeGreaterThan(0);
    expect(offer.value.apr).toBeUndefined();

    // Cannot accept until conditions are resolved
    expect(wf.acceptOffer(d, offer.value.id, ctx()).ok).toBe(false);

    // 5. Resolve conditions -> approval confirmed
    for (const c of d.submissions.find((s) => s.id === sub.value[0]!.id)!.conditions) {
      d = must(wf.setConditionResolved(d, sub.value[0]!.id, c.id, true, ctx())).data;
    }
    expect(d.applications.find((a) => a.id === app.id)!.status).toBe("approved");

    // 6. Accept lease offer, contract, finalize
    d = must(wf.acceptOffer(d, offer.value.id, ctx())).data;
    expect(d.applications.find((a) => a.id === app.id)!.status).toBe("offer_accepted");
    d = must(wf.changeApplicationStatus(d, app.id, "contracting", ctx())).data;
    d = must(wf.fundDeal(d, app.id, ctx())).data;
    const final: FinancingApplication = d.applications.find((a) => a.id === app.id)!;
    expect(final.status).toBe("funded");
    expect(final.financingType).toBe("lease");
    expect(d.commissions.filter((c) => c.applicationId === app.id).length).toBeGreaterThan(0);
  });
});

describe("application management", () => {
  it("duplicates into a fresh draft with reset documents", () => {
    const src = data.applications.find((a) => a.status === "funded")!;
    const r = must(wf.duplicateApplication(data, src.id, ctx()));
    expect(r.value.status).toBe("draft");
    expect(r.value.id).not.toBe(src.id);
    expect(r.data.documents.filter((x) => x.applicationId === r.value.id).every((x) => x.status === "missing")).toBe(true);
    expect(r.data.offers.some((o) => o.applicationId === r.value.id)).toBe(false);
  });

  it("archives and restores, but protects deals in flight", () => {
    const draft = data.applications.find((a) => a.status === "draft")!;
    const archived = must(wf.archiveApplication(data, draft.id, true, ctx()));
    expect(archived.data.applications.find((a) => a.id === draft.id)!.archived).toBe(true);
    expect(filterApplications(archived.data, { ...DEFAULT_FILTERS, range: "all" }).some((a) => a.id === draft.id)).toBe(false);
    const inFlight = data.applications.find((a) => a.status === "contracting")!;
    expect(wf.archiveApplication(data, inFlight.id, true, ctx()).ok).toBe(false);
  });

  it("does not create duplicate customers by email", () => {
    const existing = data.customers[0]!;
    const r = wf.saveApplication(
      data,
      {
        newCustomer: { type: "individual", name: "Dup", email: existing.email.toUpperCase(), phone: "1", country: "US", region: "TX", address: "x" },
        financingType: "loan",
        currency: "USD",
        country: "US",
        robot: { manufacturer: "A", model: "B", category: "service", condition: "new", quantity: 1, unitPrice: 20000, installationCost: 0, shippingCost: 0 },
        downPayment: 0,
        tradeInCredit: 0,
        preferredTermMonths: 36,
        profile: { credit: "good" },
        documents: [],
      },
      ctx(),
    );
    expect(r.ok).toBe(false);
  });

  it("rejects an expired offer from being accepted", () => {
    const app = data.applications.find((a) => a.status === "approved")!;
    const offer = data.offers.find((o) => o.applicationId === app.id && o.status === "active")!;
    const past = { ...data, offers: data.offers.map((o) => (o.id === offer.id ? { ...o, expiresAt: addDays(new Date(), -1) } : o)) };
    expect(wf.acceptOffer(past, offer.id, ctx()).ok).toBe(false);
  });
});
