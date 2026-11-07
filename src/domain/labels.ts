import type {
  BusinessOwnership,
  CreditProfile,
  CustomerType,
  DocumentType,
  EmploymentStatus,
  FinancingType,
  IntegrationMethod,
  NotificationType,
  Role,
  RobotCategory,
  SubmissionMethod,
  CommissionKind,
} from "./types";

export const ROBOT_CATEGORY_LABEL: Record<RobotCategory, string> = {
  humanoid: "Humanoid",
  industrial: "Industrial",
  collaborative: "Collaborative",
  service: "Service",
  quadruped: "Quadruped",
  logistics: "Logistics",
};
export const ROBOT_CATEGORIES = Object.keys(ROBOT_CATEGORY_LABEL) as RobotCategory[];

export const CUSTOMER_TYPE_LABEL: Record<CustomerType, string> = {
  business: "Business",
  individual: "Individual",
};

export const FINANCING_TYPE_LABEL: Record<FinancingType, string> = {
  loan: "Loan",
  lease: "Lease",
};

export const CREDIT_LABEL: Record<CreditProfile, string> = {
  excellent: "Excellent (740+)",
  good: "Good (680–739)",
  fair: "Fair (620–679)",
  limited: "Limited (<620)",
  unknown: "Not assessed",
};
export const CREDIT_RANK: Record<CreditProfile, number> = {
  unknown: -1,
  limited: 0,
  fair: 1,
  good: 2,
  excellent: 3,
};

export const OWNERSHIP_LABEL: Record<BusinessOwnership, string> = {
  sole_proprietor: "Sole proprietor",
  partnership: "Partnership",
  llc: "LLC / Ltd.",
  corporation: "Corporation",
};

export const EMPLOYMENT_LABEL: Record<EmploymentStatus, string> = {
  employed: "Employed",
  self_employed: "Self-employed",
  retired: "Retired",
  other: "Other",
};

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  business_registration: "Business registration",
  proof_of_income: "Proof of income",
  financial_statements: "Financial statements",
  identification: "Identification",
  purchase_agreement: "Purchase agreement",
  equipment_quotation: "Equipment quotation",
  insurance: "Insurance documentation",
  lender_additional: "Additional lender requirement",
};

export const DOCUMENT_CHECKLISTS: Record<DocumentType, string[]> = {
  business_registration: ["Legal entity name matches application", "Registration is active / in good standing", "Signing authority identified"],
  proof_of_income: ["Income documents are recent (last 90 days)", "Employer / source is identifiable", "Income is consistent with application"],
  financial_statements: ["Most recent fiscal year included", "Statements are complete (all pages)", "Revenue consistent with application"],
  identification: ["Document is unexpired", "Name matches applicant", "Image is legible"],
  purchase_agreement: ["Signed by both parties", "Price matches application", "Robot model and quantity match"],
  equipment_quotation: ["Quote is current", "Itemised pricing included", "Vendor details included"],
  insurance: ["Coverage includes the equipment", "Lender named as loss payee (if required)", "Policy is active"],
  lender_additional: ["Matches lender's request", "Complete and legible"],
};

export const INTEGRATION_LABEL: Record<IntegrationMethod, string> = {
  manual: "Manual",
  api_ready: "API Ready",
  api_connected: "API Connected (demo)",
};

export const SUBMISSION_METHOD_LABEL: Record<SubmissionMethod, string> = {
  email: "Email",
  portal: "Lender portal",
  phone: "Phone",
  api_demo: "API (simulated)",
};

export const ROLE_LABEL: Record<Role, string> = {
  administrator: "Administrator",
  finance_manager: "Finance Manager",
  sales_rep: "Sales Representative",
};

export const COMMISSION_KIND_LABEL: Record<CommissionKind, string> = {
  dealer_fee: "Lender referral / dealer fee",
  financing_fee: "Financing fee",
  salesperson: "Salesperson commission",
};

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  new_application: "New application",
  missing_documents: "Missing documentation",
  lender_response: "Lender response",
  conditional_approval: "Conditional approval",
  application_approved: "Application approved",
  application_declined: "Application declined",
  offer_expiring: "Offer expiring",
  follow_up_due: "Follow-up due",
  deal_funded: "Deal funded",
  status_change: "Status change",
  offer_accepted: "Offer accepted",
};

export const TERM_OPTIONS = [12, 24, 36, 48, 60, 72, 84, 96];

export const US_STATES: Record<string, string> = {
  AZ: "Arizona", CA: "California", CO: "Colorado", FL: "Florida", GA: "Georgia", IL: "Illinois", MA: "Massachusetts",
  MI: "Michigan", NC: "North Carolina", NY: "New York", OH: "Ohio", TX: "Texas", VA: "Virginia", WA: "Washington",
};
export const CA_PROVINCES: Record<string, string> = {
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NS: "Nova Scotia", ON: "Ontario", QC: "Québec", SK: "Saskatchewan",
};
export function regionsFor(country: "US" | "CA"): Record<string, string> {
  return country === "US" ? US_STATES : CA_PROVINCES;
}

export const INDUSTRIES = [
  "Manufacturing", "Logistics & Warehousing", "Hospitality & Food Service", "Healthcare", "Agriculture",
  "Security Services", "Research & Development", "Mining & Energy", "Retail", "Construction", "Education",
];
