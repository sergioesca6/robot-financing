import { z } from "zod";
import type { Customer, FinancingApplication } from "@/domain/types";

const money = (label: string) => z.number({ error: `${label} is required` }).min(0, `${label} can't be negative`);
const optMoney = z.number().min(0, "Can't be negative").optional();

export const wizardSchema = z
  .object({
    customerMode: z.enum(["new", "existing"]),
    customerId: z.string().optional(),
    customerType: z.enum(["business", "individual"]),
    name: z.string().trim().min(2, "Enter the contact's full name"),
    companyName: z.string().trim().optional(),
    email: z.string().trim().email("Enter a valid email address"),
    phone: z.string().trim().min(7, "Enter a phone number"),
    country: z.enum(["US", "CA"]),
    region: z.string().min(1, "Select a state or province"),
    address: z.string().trim().min(5, "Enter a street address"),
    industry: z.string().optional(),
    yearsInBusiness: z.number().min(0).max(200).optional(),

    catalogId: z.string().optional(),
    manufacturer: z.string().trim().min(1, "Enter the manufacturer"),
    model: z.string().trim().min(1, "Enter the model"),
    category: z.enum(["humanoid", "industrial", "collaborative", "service", "quadruped", "logistics"]),
    condition: z.enum(["new", "used"]),
    quantity: z.number({ error: "Quantity is required" }).int("Whole units only").min(1, "At least 1").max(500),
    unitPrice: z.number({ error: "Unit price is required" }).positive("Enter a price above 0"),
    installationCost: optMoney,
    shippingCost: optMoney,

    financingType: z.enum(["loan", "lease"]),
    currency: z.enum(["USD", "CAD"]),
    downPayment: money("Down payment"),
    tradeInCredit: optMoney,
    preferredTermMonths: z.number({ error: "Term is required" }).int("Whole months only").min(6, "At least 6 months").max(120, "At most 120 months"),
    desiredMonthlyPayment: z.number().positive("Enter an amount above 0").optional(),

    credit: z.enum(["excellent", "good", "fair", "limited", "unknown"]),
    annualRevenue: optMoney,
    yearsOperating: z.number().min(0).max(200).optional(),
    ownership: z.enum(["sole_proprietor", "partnership", "llc", "corporation"]).optional(),
    employment: z.enum(["employed", "self_employed", "retired", "other"]).optional(),
    annualIncome: optMoney,

    assignedEmployeeId: z.string().min(1, "Select an employee"),
  })
  .superRefine((v, ctx) => {
    if (v.customerType === "business") {
      if (!v.companyName) ctx.addIssue({ code: "custom", path: ["companyName"], message: "Enter the company name" });
      if (!v.industry) ctx.addIssue({ code: "custom", path: ["industry"], message: "Select an industry" });
      if (v.yearsInBusiness === undefined) ctx.addIssue({ code: "custom", path: ["yearsInBusiness"], message: "Enter years in business" });
      if (v.annualRevenue === undefined) ctx.addIssue({ code: "custom", path: ["annualRevenue"], message: "Enter annual revenue" });
      if (v.yearsOperating === undefined) ctx.addIssue({ code: "custom", path: ["yearsOperating"], message: "Enter years operating" });
      if (!v.ownership) ctx.addIssue({ code: "custom", path: ["ownership"], message: "Select an ownership type" });
    } else {
      if (!v.employment) ctx.addIssue({ code: "custom", path: ["employment"], message: "Select employment status" });
      if (v.annualIncome === undefined) ctx.addIssue({ code: "custom", path: ["annualIncome"], message: "Enter approximate annual income" });
    }
    const total = v.quantity * v.unitPrice + (v.installationCost ?? 0) + (v.shippingCost ?? 0);
    if (v.downPayment + (v.tradeInCredit ?? 0) > total) {
      ctx.addIssue({ code: "custom", path: ["downPayment"], message: "Down payment plus credits can't exceed the purchase total" });
    }
  });

export type WizardValues = z.infer<typeof wizardSchema>;

/** Fields validated when leaving each step. */
export const STEP_FIELDS: (keyof WizardValues)[][] = [
  ["customerType", "name", "companyName", "email", "phone", "country", "region", "address", "industry", "yearsInBusiness"],
  ["manufacturer", "model", "category", "condition", "quantity", "unitPrice", "installationCost", "shippingCost"],
  ["financingType", "currency", "downPayment", "tradeInCredit", "preferredTermMonths", "desiredMonthlyPayment"],
  ["credit", "annualRevenue", "yearsOperating", "ownership", "employment", "annualIncome", "assignedEmployeeId"],
  [],
  [],
];

export const STEP_LABELS = ["Customer", "Robot", "Financing", "Profile", "Documents", "Review"];

export const EMPTY_VALUES: WizardValues = {
  customerMode: "new",
  customerId: undefined,
  customerType: "business",
  name: "",
  companyName: "",
  email: "",
  phone: "",
  country: "US",
  region: "",
  address: "",
  industry: undefined,
  yearsInBusiness: undefined,
  catalogId: undefined,
  manufacturer: "",
  model: "",
  category: "industrial",
  condition: "new",
  quantity: 1,
  unitPrice: undefined as unknown as number,
  installationCost: undefined,
  shippingCost: undefined,
  financingType: "loan",
  currency: "USD",
  downPayment: 0,
  tradeInCredit: undefined,
  preferredTermMonths: 60,
  desiredMonthlyPayment: undefined,
  credit: "good",
  annualRevenue: undefined,
  yearsOperating: undefined,
  ownership: undefined,
  employment: undefined,
  annualIncome: undefined,
  assignedEmployeeId: "",
};

export function valuesFromApplication(app: FinancingApplication, customer: Customer): WizardValues {
  return {
    customerMode: "existing",
    customerId: customer.id,
    customerType: customer.type,
    name: customer.name,
    companyName: customer.companyName ?? "",
    email: customer.email,
    phone: customer.phone,
    country: customer.country,
    region: customer.region,
    address: customer.address,
    industry: customer.industry,
    yearsInBusiness: customer.yearsInBusiness,
    catalogId: app.robot.catalogId,
    manufacturer: app.robot.manufacturer,
    model: app.robot.model,
    category: app.robot.category,
    condition: app.robot.condition,
    quantity: app.robot.quantity,
    unitPrice: app.robot.unitPrice,
    installationCost: app.robot.installationCost || undefined,
    shippingCost: app.robot.shippingCost || undefined,
    financingType: app.financingType,
    currency: app.currency,
    downPayment: app.downPayment,
    tradeInCredit: app.tradeInCredit || undefined,
    preferredTermMonths: app.preferredTermMonths,
    desiredMonthlyPayment: app.desiredMonthlyPayment,
    credit: app.profile.credit,
    annualRevenue: app.profile.annualRevenue,
    yearsOperating: app.profile.yearsOperating,
    ownership: app.profile.ownership,
    employment: app.profile.employment,
    annualIncome: app.profile.annualIncome,
    assignedEmployeeId: app.assignedEmployeeId,
  };
}
