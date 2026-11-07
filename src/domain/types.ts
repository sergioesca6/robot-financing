/**
 * Domain model for Robot Finance.
 *
 * All entities link through stable string IDs so the same shapes can later be
 * backed by Supabase tables. Money is stored as plain numbers in the
 * application's currency. Dates are ISO-8601 strings.
 */

export type Country = "US" | "CA";
export type Currency = "USD" | "CAD";
export type CustomerType = "business" | "individual";
export type FinancingType = "loan" | "lease";
export type RobotCategory =
  | "humanoid"
  | "industrial"
  | "collaborative"
  | "service"
  | "quadruped"
  | "logistics";
export type RobotCondition = "new" | "used";
export type CreditProfile = "excellent" | "good" | "fair" | "limited" | "unknown";
export type Role = "administrator" | "finance_manager" | "sales_rep";

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  country: Country;
  active: boolean;
}

export interface Note {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  type: CustomerType;
  /** Primary contact (business) or full name (individual). */
  name: string;
  companyName?: string;
  email: string;
  phone: string;
  country: Country;
  region: string;
  address: string;
  industry?: string;
  yearsInBusiness?: number;
  assignedEmployeeId: string;
  notes: Note[];
  createdAt: string;
  /** Future Robot Trader sync reference. */
  robotTraderCustomerId?: string;
}

export interface RobotModel {
  id: string;
  manufacturer: string;
  model: string;
  category: RobotCategory;
  /** Illustrative demo list price in USD. Not a vendor quotation. */
  listPriceUsd: number;
}

export interface RobotLine {
  catalogId?: string;
  manufacturer: string;
  model: string;
  category: RobotCategory;
  condition: RobotCondition;
  quantity: number;
  unitPrice: number;
  installationCost: number;
  shippingCost: number;
  /** Future Robot Trader references. */
  robotTraderListingId?: string;
}

export type BusinessOwnership = "sole_proprietor" | "partnership" | "llc" | "corporation";
export type EmploymentStatus = "employed" | "self_employed" | "retired" | "other";

export interface FinancialProfile {
  credit: CreditProfile;
  // Business
  annualRevenue?: number;
  yearsOperating?: number;
  ownership?: BusinessOwnership;
  // Individual
  employment?: EmploymentStatus;
  annualIncome?: number;
}

export type ApplicationStatus =
  | "draft"
  | "needs_documents"
  | "ready_to_submit"
  | "submitted"
  | "under_review"
  | "conditionally_approved"
  | "approved"
  | "declined"
  | "offer_accepted"
  | "contracting"
  | "funded"
  | "closed";

export interface FinancingApplication {
  id: string;
  customerId: string;
  status: ApplicationStatus;
  financingType: FinancingType;
  currency: Currency;
  country: Country;
  robot: RobotLine;
  purchaseTotal: number;
  downPayment: number;
  tradeInCredit: number;
  requestedAmount: number;
  preferredTermMonths: number;
  desiredMonthlyPayment?: number;
  profile: FinancialProfile;
  assignedEmployeeId: string;
  createdAt: string;
  submittedAt?: string;
  fundedAt?: string;
  lastActivityAt: string;
  archived: boolean;
  acceptedOfferId?: string;
  fundedAmount?: number;
  /** Wizard step to resume a draft at (0-based). */
  wizardStep?: number;
  notes: Note[];
  /** Future Robot Trader references. */
  robotTrader?: { customerId?: string; listingId?: string; dealId?: string };
}

export interface LenderContact {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  primary: boolean;
}

export type IntegrationMethod = "manual" | "api_ready" | "api_connected";

export interface LenderCommissionPlan {
  /** Referral / dealer fee paid by the lender, percent of funded amount. */
  dealerFeePercent: number;
  /** Flat financing fee paid per funded deal. */
  financingFeeFlat: number;
  notes: string;
}

export interface Lender {
  id: string;
  name: string;
  initials: string;
  /** Hue (0-360) for the avatar. */
  hue: number;
  active: boolean;
  countries: Country[];
  currencies: Currency[];
  customerTypes: CustomerType[];
  products: FinancingType[];
  robotCategories: RobotCategory[];
  minAmount: number;
  maxAmount: number;
  terms: number[];
  aprMin: number;
  aprMax: number;
  minCredit: CreditProfile;
  minYearsInBusiness: number;
  minAnnualRevenue: number;
  creditRequirements: string;
  turnaroundDays: number;
  contacts: LenderContact[];
  submissionInstructions: string;
  integration: IntegrationMethod;
  commission: LenderCommissionPlan;
  requiredDocuments: DocumentType[];
  notes: string;
}

export interface LenderProgram {
  id: string;
  lenderId: string;
  name: string;
  product: FinancingType;
  customerTypes: CustomerType[];
  minAmount: number;
  maxAmount: number;
  terms: number[];
  aprMin: number;
  aprMax: number;
  /** Lease residual range (percent of price) when product is a lease. */
  residualMinPercent?: number;
  residualMaxPercent?: number;
  minCredit: CreditProfile;
  active: boolean;
  description: string;
}

/** Lender-side decision on a single submission. Distinct from application status. */
export type SubmissionStatus =
  | "queued"
  | "submitted"
  | "under_review"
  | "info_requested"
  | "conditionally_approved"
  | "approved"
  | "declined"
  | "withdrawn";

export type SubmissionMethod = "email" | "portal" | "phone" | "api_demo";

export interface SubmissionCondition {
  id: string;
  text: string;
  resolved: boolean;
  resolvedAt?: string;
}

export interface SubmissionEvent {
  id: string;
  at: string;
  status: SubmissionStatus;
  note: string;
  actorId: string;
}

export interface OfferedTerms {
  amount?: number;
  apr?: number;
  termMonths?: number;
  monthlyPayment?: number;
}

export interface LenderSubmission {
  id: string;
  applicationId: string;
  lenderId: string;
  programId?: string;
  status: SubmissionStatus;
  method: SubmissionMethod;
  referenceNumber: string;
  contactPerson: string;
  submittedAt?: string;
  followUpDate?: string;
  decisionAt?: string;
  notes: string;
  conditions: SubmissionCondition[];
  offeredTerms?: OfferedTerms;
  history: SubmissionEvent[];
  /** Always true in this prototype: nothing is transmitted to a lender. */
  simulated: true;
}

export type OfferStatus =
  | "draft"
  | "active"
  | "accepted"
  | "rejected"
  | "expired"
  | "superseded";

export interface FinancingOffer {
  id: string;
  applicationId: string;
  lenderId: string;
  submissionId?: string;
  product: FinancingType;
  status: OfferStatus;
  approvedAmount: number;
  downPayment: number;
  /** Loan APR in percent. */
  apr?: number;
  /** Lease money factor (e.g. 0.00250). */
  moneyFactor?: number;
  termMonths: number;
  monthlyPayment: number;
  /** Fees paid at signing (not financed). */
  fees: number;
  residualValue?: number;
  totalCost: number;
  expiresAt: string;
  conditions: string[];
  createdAt: string;
  notes?: string;
}

export type DocumentType =
  | "business_registration"
  | "proof_of_income"
  | "financial_statements"
  | "identification"
  | "purchase_agreement"
  | "equipment_quotation"
  | "insurance"
  | "lender_additional";

export type DocumentStatus = "missing" | "uploaded" | "under_review" | "verified" | "rejected";

export interface DocumentRecord {
  id: string;
  applicationId: string;
  type: DocumentType;
  label: string;
  required: boolean;
  status: DocumentStatus;
  /** Metadata only. File bytes are never persisted. */
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  uploadedAt?: string;
  verifiedById?: string;
  verifiedAt?: string;
  note?: string;
  checklist: { id: string; label: string; done: boolean }[];
}

export type CommissionKind = "dealer_fee" | "financing_fee" | "salesperson";
export type CommissionStatus = "estimated" | "pending" | "paid" | "void";

export interface Commission {
  id: string;
  applicationId: string;
  lenderId: string;
  employeeId?: string;
  kind: CommissionKind;
  basis: "percent" | "flat";
  /** Percent (e.g. 1.5) or flat dollar amount, depending on basis. */
  rate: number;
  fundingAmount: number;
  currency: Currency;
  estimated: number;
  actual?: number;
  status: CommissionStatus;
  createdAt: string;
  paidAt?: string;
}

export type NotificationType =
  | "new_application"
  | "missing_documents"
  | "lender_response"
  | "conditional_approval"
  | "application_approved"
  | "application_declined"
  | "offer_expiring"
  | "follow_up_due"
  | "deal_funded"
  | "status_change"
  | "offer_accepted";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  applicationId?: string;
  link?: string;
}

export interface ActivityEvent {
  id: string;
  applicationId?: string;
  customerId?: string;
  type: string;
  message: string;
  at: string;
  actorId: string;
  simulated?: boolean;
}

export type TaskKind = "customer" | "lender" | "document" | "internal";

export interface FollowUpTask {
  id: string;
  applicationId?: string;
  customerId?: string;
  lenderId?: string;
  kind: TaskKind;
  title: string;
  dueDate: string;
  assigneeId: string;
  done: boolean;
  createdAt: string;
}

export interface EmailRecord {
  id: string;
  applicationId?: string;
  audience: "customer" | "lender";
  to: string;
  toName: string;
  subject: string;
  body: string;
  templateId?: string;
  status: "draft" | "simulated_sent";
  sentAt?: string;
  createdAt: string;
  authorId: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  audience: "customer" | "lender";
  subject: string;
  body: string;
}

export interface SalespersonCommissionRule {
  /** Default percent of funded amount. */
  defaultPercent: number;
  /** Optional per-employee overrides (employeeId -> percent). */
  overrides: Record<string, number>;
}

export interface AppSettings {
  currentUserId: string;
  dealership: {
    name: string;
    legalName: string;
    email: string;
    phone: string;
    address: string;
    countries: Country[];
    defaultCountry: Country;
  };
  financingDefaults: {
    loanApr: number;
    loanTermMonths: number;
    leaseMoneyFactor: number;
    leaseResidualPercent: number;
    leaseTermMonths: number;
    docFee: number;
    taxRatePercent: number;
    offerValidityDays: number;
    followUpDays: number;
  };
  commissionRules: SalespersonCommissionRule;
  templates: EmailTemplate[];
  integrations: {
    supabase: boolean;
    robotTrader: boolean;
    email: boolean;
    lenderApis: boolean;
  };
}

export interface AppData {
  version: number;
  employees: Employee[];
  customers: Customer[];
  robots: RobotModel[];
  applications: FinancingApplication[];
  lenders: Lender[];
  programs: LenderProgram[];
  submissions: LenderSubmission[];
  offers: FinancingOffer[];
  documents: DocumentRecord[];
  commissions: Commission[];
  notifications: AppNotification[];
  activity: ActivityEvent[];
  tasks: FollowUpTask[];
  emails: EmailRecord[];
  settings: AppSettings;
}
