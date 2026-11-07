/**
 * Email service boundary. The prototype never sends mail: `MockEmailProvider`
 * resolves immediately with a `simulated: true` receipt. Swap in a real
 * provider (Resend, Postmark, SES…) behind a server route later.
 */
import type { AppData, EmailTemplate, FinancingApplication, Lender } from "@/domain/types";
import { APPLICATION_STATUS_META } from "@/domain/status";
import { formatMoney } from "@/lib/format";
import { customerDisplayName, documentCompleteness } from "@/lib/selectors";

export interface EmailDraft {
  to: string;
  toName: string;
  subject: string;
  body: string;
}

export interface EmailReceipt {
  simulated: true;
  messageId: string;
  sentAt: string;
}

export interface EmailProvider {
  send(draft: EmailDraft): Promise<EmailReceipt>;
}

export const MockEmailProvider: EmailProvider = {
  async send() {
    return { simulated: true, messageId: `sim-${Date.now().toString(36)}`, sentAt: new Date().toISOString() };
  },
};

export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

export const TEMPLATE_VARIABLES = [
  "contactName", "customerName", "applicationId", "robotModel", "requestedAmount", "status",
  "missingDocuments", "lenderName", "referenceNumber", "senderName", "dealership",
];

export function buildTemplateVars(data: AppData, app: FinancingApplication, lender?: Lender): Record<string, string> {
  const customer = data.customers.find((c) => c.id === app.customerId);
  const sender = data.employees.find((e) => e.id === data.settings.currentUserId);
  const docs = data.documents.filter((d) => d.applicationId === app.id);
  const missing = documentCompleteness(docs).missing.map((d) => `• ${d.label}${d.status === "rejected" ? " (resubmission needed)" : ""}`);
  const sub = lender ? data.submissions.find((s) => s.applicationId === app.id && s.lenderId === lender.id) : undefined;
  return {
    contactName: customer?.name.split(" ")[0] ?? "there",
    customerName: customerDisplayName(customer),
    applicationId: app.id,
    robotModel: `${app.robot.manufacturer} ${app.robot.model}`,
    requestedAmount: formatMoney(app.requestedAmount, app.currency),
    status: APPLICATION_STATUS_META[app.status].label,
    missingDocuments: missing.length ? missing.join("\n") : "• (No outstanding documents)",
    lenderName: lender?.name ?? "",
    referenceNumber: sub?.referenceNumber || "n/a",
    senderName: sender?.name ?? "Finance Team",
    dealership: data.settings.dealership.name,
  };
}

export function draftFromTemplate(
  template: EmailTemplate,
  data: AppData,
  app: FinancingApplication,
  lender?: Lender,
): { subject: string; body: string; to: string; toName: string } {
  const vars = buildTemplateVars(data, app, lender);
  const customer = data.customers.find((c) => c.id === app.customerId);
  const lenderContact = lender?.contacts.find((c) => c.primary) ?? lender?.contacts[0];
  const vars2 = template.audience === "lender" && lenderContact ? { ...vars, contactName: lenderContact.name.split(" ")[0]! } : vars;
  return {
    subject: renderTemplate(template.subject, vars2),
    body: renderTemplate(template.body, vars2),
    to: template.audience === "lender" ? (lenderContact?.email ?? "") : (customer?.email ?? ""),
    toName: template.audience === "lender" ? (lenderContact?.name ?? lender?.name ?? "") : (customer?.name ?? ""),
  };
}
