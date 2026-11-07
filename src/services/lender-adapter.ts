/**
 * Lender integration boundary.
 *
 * The UI only talks to `LenderAdapter`. Today every adapter is simulated:
 *  - ManualAdapter  — staff submit by email / portal / phone and RECORD the details.
 *  - DemoApiAdapter — labelled "API Connected (demo)"; returns a fake reference.
 * No bank or lender is contacted by this prototype. A real integration implements
 * `LenderAdapter.submit` / `fetchStatus` against the lender's API (via a server
 * route or edge function so credentials never reach the browser).
 */
import { DOCUMENT_TYPE_LABEL } from "@/domain/labels";
import type {
  Customer,
  DocumentRecord,
  FinancingApplication,
  IntegrationMethod,
  Lender,
  SubmissionMethod,
  SubmissionStatus,
} from "@/domain/types";
import { customerDisplayName } from "@/lib/selectors";

export interface RequirementCheck {
  label: string;
  met: boolean;
  detail: string;
}

export interface SubmissionPackage {
  lenderId: string;
  applicationId: string;
  requirements: RequirementCheck[];
  /** Non-sensitive illustrative payload shape for a future API integration. */
  payload: Record<string, unknown>;
}

export interface SubmissionReceipt {
  simulated: true;
  referenceNumber?: string;
  method: SubmissionMethod;
  message: string;
}

export interface LenderAdapter {
  readonly mode: IntegrationMethod;
  buildPackage(args: { application: FinancingApplication; customer: Customer; lender: Lender; documents: DocumentRecord[] }): SubmissionPackage;
  submit(pkg: SubmissionPackage): Promise<SubmissionReceipt>;
  fetchStatus(referenceNumber: string): Promise<{ status: SubmissionStatus | "unknown"; message: string }>;
}

function buildPackage(args: { application: FinancingApplication; customer: Customer; lender: Lender; documents: DocumentRecord[] }): SubmissionPackage {
  const { application: a, customer: c, lender, documents } = args;
  const requirements: RequirementCheck[] = lender.requiredDocuments.map((type) => {
    const doc = documents.find((d) => d.type === type);
    const met = !!doc && ["uploaded", "under_review", "verified"].includes(doc.status);
    return {
      label: DOCUMENT_TYPE_LABEL[type],
      met,
      detail: met ? `Received (${doc!.status.replace("_", " ")})` : "Not yet received",
    };
  });
  return {
    lenderId: lender.id,
    applicationId: a.id,
    requirements,
    payload: {
      dealerReference: "DEMO-DEALER-001",
      applicationId: a.id,
      applicant: {
        type: c.type,
        displayName: customerDisplayName(c),
        country: c.country,
        region: c.region,
        creditProfile: a.profile.credit,
      },
      equipment: {
        manufacturer: a.robot.manufacturer,
        model: a.robot.model,
        category: a.robot.category,
        condition: a.robot.condition,
        quantity: a.robot.quantity,
        purchaseTotal: a.purchaseTotal,
      },
      financing: {
        product: a.financingType,
        currency: a.currency,
        requestedAmount: a.requestedAmount,
        downPayment: a.downPayment,
        termMonths: a.preferredTermMonths,
      },
      note: "Illustrative payload only. No SSN/SIN, bank account numbers or credit reports are collected by this prototype.",
    },
  };
}

export const ManualAdapter: LenderAdapter = {
  mode: "manual",
  buildPackage,
  async submit() {
    return { simulated: true, method: "email", message: "Manual lender: staff send the package and record the details afterwards. Nothing was transmitted." };
  },
  async fetchStatus() {
    return { status: "unknown", message: "Manual lenders do not expose status. Record responses manually." };
  },
};

export const DemoApiAdapter: LenderAdapter = {
  mode: "api_connected",
  buildPackage,
  async submit(pkg) {
    return {
      simulated: true,
      method: "api_demo",
      referenceNumber: `SIM-${pkg.applicationId.replace("APP-", "")}-${pkg.lenderId.slice(4, 7).toUpperCase()}`,
      message: "Simulated API acknowledgement. No request left this browser.",
    };
  },
  async fetchStatus() {
    return { status: "under_review", message: "Simulated status poll." };
  },
};

export function adapterFor(lender: Lender): LenderAdapter {
  return lender.integration === "api_connected" ? DemoApiAdapter : ManualAdapter;
}
