import { INTEGRATION_LABEL } from "@/domain/labels";
import {
  APPLICATION_STATUS_META,
  COMMISSION_STATUS_META,
  DOCUMENT_STATUS_META,
  OFFER_STATUS_META,
  SUBMISSION_STATUS_META,
  TONE_CLASSES,
  TONE_DOT,
  type Tone,
} from "@/domain/status";
import type {
  ApplicationStatus,
  CommissionStatus,
  DocumentStatus,
  IntegrationMethod,
  OfferStatus,
  SubmissionStatus,
} from "@/domain/types";
import { VERDICT_LABEL, type Verdict } from "@/lib/matching";
import { cn } from "@/lib/utils";

export function Pill({
  tone = "neutral",
  children,
  dot = true,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[11px] font-medium ring-1 ring-inset",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", TONE_DOT[tone])} aria-hidden />}
      {children}
    </span>
  );
}

export const AppStatusBadge = ({ status }: { status: ApplicationStatus }) => (
  <Pill tone={APPLICATION_STATUS_META[status].tone}>{APPLICATION_STATUS_META[status].label}</Pill>
);
export const SubmissionBadge = ({ status }: { status: SubmissionStatus }) => (
  <Pill tone={SUBMISSION_STATUS_META[status].tone}>{SUBMISSION_STATUS_META[status].label}</Pill>
);
export const OfferBadge = ({ status }: { status: OfferStatus }) => (
  <Pill tone={OFFER_STATUS_META[status].tone}>{OFFER_STATUS_META[status].label}</Pill>
);
export const DocBadge = ({ status }: { status: DocumentStatus }) => (
  <Pill tone={DOCUMENT_STATUS_META[status].tone}>{DOCUMENT_STATUS_META[status].label}</Pill>
);
export const CommissionBadge = ({ status }: { status: CommissionStatus }) => (
  <Pill tone={COMMISSION_STATUS_META[status].tone}>{COMMISSION_STATUS_META[status].label}</Pill>
);

const VERDICT_TONE: Record<Verdict, Tone> = { potential: "success", review: "warning", ineligible: "danger" };
export const VerdictBadge = ({ verdict }: { verdict: Verdict }) => <Pill tone={VERDICT_TONE[verdict]}>{VERDICT_LABEL[verdict]}</Pill>;

const INTEGRATION_TONE: Record<IntegrationMethod, Tone> = { manual: "neutral", api_ready: "info", api_connected: "teal" };
export const IntegrationBadge = ({ method }: { method: IntegrationMethod }) => (
  <Pill tone={INTEGRATION_TONE[method]} dot={false}>
    {INTEGRATION_LABEL[method]}
  </Pill>
);

export const SimulatedTag = ({ className }: { className?: string }) => (
  <span className={cn("inline-flex h-4 items-center rounded border border-dashed border-amber-400 bg-amber-50 px-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800", className)}>
    Simulated
  </span>
);
