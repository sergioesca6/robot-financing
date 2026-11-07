"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { FileUp, FolderOpen, Search } from "lucide-react";
import { toast } from "sonner";
import { DocumentCard } from "@/components/documents/document-card";
import { AppStatusBadge } from "@/components/shared/badges";
import { Callout, EmptyState, FilterSelect, KpiCard, PageHeader, SectionCard } from "@/components/shared/page";
import { Pagination } from "@/components/shared/pagination";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DOCUMENT_TYPE_LABEL } from "@/domain/labels";
import { DOCUMENT_STATUS_META } from "@/domain/status";
import type { DocumentStatus } from "@/domain/types";
import { documentCompleteness, customerDisplayName } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { ACCEPT_ATTR, documentService, validateDocumentFile } from "@/services/documents";
import { useStore } from "@/store/store";

const PAGE = 6;

export default function DocumentsPage() {
  const { data, actions, can } = useStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const canEdit = can("application.edit");
  const canVerify = can("submission.manage") || can("application.status");

  const activeApps = data.applications.filter((a) => !a.archived && a.status !== "closed");
  const counts = useMemo(() => {
    const c: Record<DocumentStatus, number> = { missing: 0, uploaded: 0, under_review: 0, verified: 0, rejected: 0 };
    data.documents.filter((d) => activeApps.some((a) => a.id === d.applicationId)).forEach((d) => c[d.status]++);
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.documents, data.applications]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return activeApps
      .map((a) => {
        const customer = data.customers.find((c) => c.id === a.customerId);
        const docs = data.documents.filter((d) => d.applicationId === a.id && (status === "all" || d.status === status));
        return { a, customer, docs, all: data.documents.filter((d) => d.applicationId === a.id) };
      })
      .filter((g) => g.docs.length > 0)
      .filter((g) => !needle || g.a.id.toLowerCase().includes(needle) || customerDisplayName(g.customer).toLowerCase().includes(needle))
      .sort((x, y) => documentCompleteness(x.all).percentReceived - documentCompleteness(y.all).percentReceived);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.documents, data.applications, data.customers, q, status]);
  const pageGroups = groups.slice((page - 1) * PAGE, page * PAGE);

  return (
    <>
      <PageHeader title="Documents" description="Track what's been received and verified across every active application." />
      <Callout tone="warning" className="mb-4" title="Demo-only document handling">
        Files are never uploaded or stored — only name, size and type are kept in this browser. Use fictional documents. Production requires private storage, access controls, retention rules and malware scanning.
      </Callout>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Missing" value={counts.missing} sub="required items still to collect" />
        <KpiCard label="Awaiting review" value={counts.uploaded + counts.under_review} sub="uploaded or in review" />
        <KpiCard label="Verified" value={counts.verified} sub="checked against the checklist" />
        <KpiCard label="Rejected" value={counts.rejected} sub="need resubmission" />
      </div>

      <QuickUpload />

      <div className="mb-3 mt-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search application or customer…" aria-label="Search documents" className="bg-card pl-8" />
        </div>
        <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={(Object.keys(DOCUMENT_STATUS_META) as DocumentStatus[]).map((s) => ({ value: s, label: DOCUMENT_STATUS_META[s].label }))} />
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState icon={FolderOpen} title="No documents match" description="Try a different status or search term." />
        </div>
      ) : (
        <div className="space-y-4">
          {pageGroups.map(({ a, customer, docs, all }) => {
            const c = documentCompleteness(all);
            return (
              <SectionCard
                key={a.id}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <Link href={`/applications/${a.id}?tab=documents`} className="hover:underline">
                      {a.id} · {customerDisplayName(customer)}
                    </Link>
                    <AppStatusBadge status={a.status} />
                  </span>
                }
                action={
                  <div className="hidden w-48 items-center gap-2 sm:flex">
                    <Progress value={c.percentReceived} className="h-1.5" aria-label={`${a.id} completeness`} />
                    <span className="tnum text-xs text-muted-foreground">
                      {c.received}/{c.required}
                    </span>
                  </div>
                }
              >
                <div className="space-y-2.5">
                  {docs.map((d) => (
                    <DocumentCard
                      key={d.id}
                      doc={d}
                      canManage={canEdit}
                      canVerify={canVerify}
                      onAttach={async (meta, file) => {
                        const r = actions.attachDocument(d.id, meta);
                        if (r.ok && file) await documentService.upload(d.id, file);
                      }}
                      onSetStatus={(s, note) => {
                        if (s === "missing") documentService.remove(d.id);
                        actions.setDocumentStatus(d.id, s, note);
                      }}
                      onToggleChecklist={(itemId) => actions.toggleChecklistItem(d.id, itemId)}
                    />
                  ))}
                </div>
              </SectionCard>
            );
          })}
          <div className="overflow-hidden rounded-xl border bg-card">
            <Pagination page={page} pageSize={PAGE} total={groups.length} onPage={setPage} />
          </div>
        </div>
      )}
    </>
  );
}

function QuickUpload() {
  const { data, actions, can } = useStore();
  const [appId, setAppId] = useState("");
  const [docId, setDocId] = useState("");
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const apps = data.applications.filter((a) => !a.archived && data.documents.some((d) => d.applicationId === a.id && d.status === "missing"));
  const docs = data.documents.filter((d) => d.applicationId === appId && (d.status === "missing" || d.status === "rejected"));
  const canEdit = can("application.edit");

  const handle = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!docId) return void toast.error("Choose an application and the document it satisfies first.");
    const err = validateDocumentFile({ name: f.name, size: f.size, type: f.type });
    if (err) return void toast.error(err);
    const r = actions.attachDocument(docId, { fileName: f.name, fileSize: f.size, mimeType: f.type });
    if (r.ok) {
      await documentService.upload(docId, f);
      toast.success(`${f.name} attached`, { description: "Demo only — file contents are not stored." });
      setDocId("");
    }
  };

  return (
    <SectionCard title="Quick upload" description="Attach a (fictional) file to an outstanding requirement.">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.4fr]">
        <Select value={appId} onValueChange={(v) => { setAppId(v); setDocId(""); }} disabled={!canEdit}>
          <SelectTrigger className="w-full" aria-label="Application">
            <SelectValue placeholder="Application with missing documents" />
          </SelectTrigger>
          <SelectContent>
            {apps.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.id} · {customerDisplayName(data.customers.find((c) => c.id === a.customerId))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={docId} onValueChange={setDocId} disabled={!appId}>
          <SelectTrigger className="w-full" aria-label="Document requirement">
            <SelectValue placeholder="Requirement" />
          </SelectTrigger>
          <SelectContent>
            {docs.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.label ?? DOCUMENT_TYPE_LABEL[d.type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files); }}
          className={cn("flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground transition-colors", drag ? "border-primary bg-primary/5" : "bg-muted/30", (!canEdit || !docId) && "opacity-60")}
        >
          <FileUp className="size-4" aria-hidden />
          <span>
            Drop file or{" "}
            <button type="button" disabled={!docId || !canEdit} onClick={() => ref.current?.click()} className="font-medium text-primary hover:underline disabled:no-underline">
              browse
            </button>{" "}
            · PDF, PNG, JPG, DOCX, XLSX · 10 MB
          </span>
          <input ref={ref} type="file" accept={ACCEPT_ATTR} className="sr-only" aria-label="Upload file" onChange={(e) => { void handle(e.target.files); e.target.value = ""; }} />
        </div>
      </div>
    </SectionCard>
  );
}
