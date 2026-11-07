# Robot Finance

Internal financing-management prototype for a robotics dealership selling in the **United States and Canada**. It covers the path from application intake to lender submissions, offer comparison, funding and commissions.

> **This is a frontend-only demo.** It has no backend, no bank connections and no authentication. It sends no real emails and stores no real documents. All people, companies, lenders and figures are fictional. It is **not production-ready** and gives no real credit, approval or compliance guidance.

## Run locally

Requires Node 20+.

```bash
npm install
npm run dev          # http://localhost:3000
```

Other scripts:

```bash
npm test             # unit tests for finance maths, matching, workflow and the two end-to-end flows (Vitest)
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run build        # production build (fetches Google Fonts at build time, so it needs network)
npm start            # serve the production build
```

Deploy on Vercel with the default Next.js settings. No environment variables are needed.

## What is in the demo

Eleven sections, all working against one seeded data set (28 applications, 18 customers, 9 lenders, 14 robots, 23 offers):

- **Dashboard**: KPIs, five charts and action lists. Filters: date range, country, financing type and employee. Every figure is derived from the data.
- **Applications**: table and Kanban views, search, sort, filters and status tabs. Create, edit, duplicate, archive and bulk actions. A 6-step wizard (customer, robot, financing, profile, documents, review) with draft save and resume. Each application has a detail workspace.
- **Pipeline**: 12 statuses with transition rules. Every change writes an activity entry and a notification, and updates the KPIs.
- **Lenders**: directory with 7-tab detail pages. Add and edit lenders, programs, contacts and commission arrangements. Integration labels: Manual, API Ready, API Connected (a demo label only).
- **Submissions**: mock rule-based screening, a Submit-to-Lenders dialog and "Record Manual Submission". Each lender has its own status, independent of the application status.
- **Financing Offers**: several offers per application. Compare up to 3 side by side with highlights on individual metrics. The app **never** declares a "best" offer. Accept, reject, move to contracting and mark funded.
- **Payment Calculator**: separate loan and lease calculators with charts and schedules, USD/CAD formatting, prefill from an application, and "copy to draft offer".
- **Documents**: drag-and-drop upload UI, validation, a status model and completeness indicators.
- **Customers**: a CRM with stable IDs and duplicate-email detection.
- **Commissions**: rule-based, estimated vs. actual, by employee and lender, with a monthly trend and CSV export.
- **Notifications**: bell, history, follow-ups and simulated email (draft, preview and send).
- **Reports**: nine reports with filters and CSV export.
- **Settings**: dealership, employees, financing defaults, commission rules, email templates and planned integrations. It also holds a demo role switcher and **Reset demo data**.

## Architecture

```
src/
  app/(app)/        Next.js App Router pages (one folder per section)
  components/       Feature components plus shadcn/ui primitives
  domain/           Typed domain model, status graph, labels, UI permissions
  lib/              Pure logic: finance, matching, commissions, metrics, selectors, workflow
  services/         Replaceable boundaries (see below)
  data/             Reference data and the seed generator
  store/            React context store (the single place that holds state)
```

- **State**: one typed `AppData` graph held in a React context. It is hydrated from `localStorage` (key `robot-finance-demo`, versioned) after mount and saved back on change.
- **Mutations**: every business operation is a pure function in `lib/workflow.ts` that takes the data and returns a `Result` with the new data or an error. The store's `actions` object calls them. Swapping this object for Supabase or API calls is the intended migration path, and the UI does not change.
- **Metrics** (`lib/metrics.ts`): one source for the dashboard, reports and commissions, so figures stay consistent. Mixed currencies are shown as USD-equivalent using a fixed demo rate of 1 USD = 1.36 CAD.
- **Status rules** (`domain/status.ts`, `lib/workflow.ts`):
  - Contracting needs an accepted offer and verified required documents.
  - "Submitted" is set only by submitting to lenders.
  - "Offer accepted" is set only by accepting an offer.
  - The overall status is derived from lender decisions and never moves backward after acceptance.
- **Finance maths** (`lib/finance.ts`): standard amortizing loans. Leases use `(cap − residual)/term + (cap + residual) × money factor`, kept separate from APR. Taxes and fees are explicit inputs.
- **Commissions** (`lib/commissions.ts`): calculated from explicit rules, not from interest. They run estimated → pending (at funding) → paid.
- **Role simulation**: `domain/permissions.ts` gates the UI by demo role. It is a UI convenience, not security.

### Service boundaries (future integrations)

| Boundary | File | Demo implementation | Planned |
| --- | --- | --- | --- |
| Persistence | `store/store.tsx` | `localStorage` | Supabase (Postgres, Row Level Security, Auth) |
| Documents | `services/documents.ts` | In-memory object URLs, never persisted | Supabase Storage with signed URLs and malware scanning |
| Lender submission | `services/lender-adapter.ts` | `ManualAdapter`, `DemoApiAdapter` (simulated receipts) | One adapter per partner bank API |
| Email | `services/email.ts` | `MockEmailProvider` (nothing leaves the browser) | Transactional email provider |
| Robot Trader | `services/robot-trader.ts` | Mock inbound and outbound payloads | Real Robot Trader API or webhooks |

Example mock payloads are shown in **Settings → Integrations** and defined as types in `services/robot-trader.ts`. The wizard's "Prefill from Robot Trader (mock)" uses the inbound one.

## Demo limitations

- Data lives only in this browser. Clearing site data or using **Reset demo data** restores the seed.
- Lender "matching" is a transparent rule screen and not a credit decision. "API Connected" is a label only.
- Uploaded files are validated by type and size, held in memory for preview and lost on reload. Only metadata is kept.
- Roles are simulated, with no login.
- Offers, rates and commissions are illustrative.
- Fictional identities only. **Do not enter real personal or financial data.** The app never asks for SSN/SIN, bank credentials, full account numbers or credit reports.

## Before production

These are **not** implemented here and must be designed and reviewed before any real use:

- Real authentication, authorization enforced server-side, audit logging and session management.
- Encryption in transit and at rest, secrets management, and a threat model.
- Compliant handling of personal and financial data (e.g. GLBA/FCRA/ECOA in the US, PIPEDA and provincial rules in Canada). This includes consent, retention and deletion, and adverse-action notices, with legal review. Credit pulls need permissible-purpose and consent controls.
- Partner-bank agreements, security reviews and data-sharing terms before any API connection.
- Secure document storage, virus scanning and access controls.
- Fair-lending review of any screening or matching logic.
- Backups, monitoring, rate limiting and an incident-response process.

## Tech

Next.js (App Router) · React · TypeScript (strict) · Tailwind CSS · shadcn/ui · Lucide · Recharts · React Hook Form + Zod · Vitest.
