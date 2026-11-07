"use client";

import { useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Eye, FileText, FileUp, MoreHorizontal, ShieldCheck, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { DocBadge } from "@/components/shared/badges";
import { Callout } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import type { DocumentStatus } from "@/domain/types";
import { ACCEPT_ATTR, documentService, formatFileSize, sampleFile, validateDocumentFile, type StoredFileRef } from "@/services/documents";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface DocLike {
  id?: string;
  label: string;
  required: boolean;
  status: DocumentStatus;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  uploadedAt?: string;
  note?: string;
  checklist?: { id: string; label: string; done: boolean }[];
  verifiedAt?: string;
}

export function DocumentCard({
  doc,
  canManage,
  canVerify,
  onAttach,
  onSetStatus,
  onToggleChecklist,
  compact,
}: {
  doc: DocLike;
  canManage: boolean;
  canVerify: boolean;
  onAttach: (meta: StoredFileRef, file?: File) => void | Promise<void>;
  onSetStatus: (status: DocumentStatus, note?: string) => void;
  onToggleChecklist?: (itemId: string) => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [preview, setPreview] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const hasFile = doc.status !== "missing" && !!doc.fileName;
  const previewUrl = doc.id ? documentService.getPreviewUrl(doc.id) : undefined;

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const err = validateDocumentFile({ name: file.name, size: file.size, type: file.type });
    if (err) return void toast.error(err);
    await onAttach({ fileName: file.name, fileSize: file.size, mimeType: file.type }, file);
    toast.success(`${file.name} attached`, { description: "Demo only — file contents are not stored." });
  };

  const doneCount = doc.checklist?.filter((c) => c.done).length ?? 0;

  return (
    <div className={cn("rounded-lg border bg-card", doc.status === "missing" && doc.required && "border-dashed")}>
      <div className="flex items-start gap-3 p-3">
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", hasFile ? "bg-primary/8 text-primary" : "bg-muted text-muted-foreground")}>
          <FileText className="size-4.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{doc.label}</p>
            {doc.required ? <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Required</span> : <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Optional</span>}
            <DocBadge status={doc.status} />
          </div>
          {hasFile ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {doc.fileName} · {formatFileSize(doc.fileSize)}
              {doc.uploadedAt && <> · uploaded {formatDate(doc.uploadedAt)}</>}
              {doc.status === "verified" && doc.verifiedAt && <> · verified {formatDate(doc.verifiedAt)}</>}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">No file attached.</p>
          )}
          {doc.status === "rejected" && doc.note && <p className="mt-1 text-xs text-red-600">Rejected: {doc.note}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {hasFile && (
            <Button variant="ghost" size="icon-sm" aria-label={`Preview ${doc.label}`} onClick={() => setPreview(true)}>
              <Eye />
            </Button>
          )}
          {hasFile && canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${doc.label}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem disabled={!canVerify || doc.status === "under_review"} onSelect={() => onSetStatus("under_review")}>
                  <ShieldCheck /> Start review
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canVerify || doc.status === "verified"} onSelect={() => onSetStatus("verified")}>
                  <CheckCircle2 /> Mark verified
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canVerify || doc.status === "rejected"} onSelect={() => setRejecting(true)}>
                  <XCircle /> Reject…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => inputRef.current?.click()}>
                  <Upload /> Replace file
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onSetStatus("missing")}>Remove file</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {!hasFile && canManage && (
        <div className="px-3 pb-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void handleFiles(e.dataTransfer.files);
            }}
            className={cn("flex flex-col items-center gap-1.5 rounded-lg border border-dashed px-3 py-3.5 text-center transition-colors", dragging ? "border-primary bg-primary/5" : "bg-muted/30")}
          >
            <FileUp className="size-4 text-muted-foreground" aria-hidden />
            <p className="text-xs text-muted-foreground">
              Drag a file here or{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => inputRef.current?.click()}>
                browse
              </button>
              {" · PDF, PNG, JPG, DOCX, XLSX · up to 10 MB"}
            </p>
            {!compact && (
              <Button variant="ghost" size="xs" onClick={async () => {
                  await onAttach(sampleFile(doc.label));
                  toast.success("Sample document attached (demo)");
                }}>
                Attach sample document
              </Button>
            )}
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept={ACCEPT_ATTR} className="sr-only" aria-label={`Upload ${doc.label}`} onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }} />

      {hasFile && doc.checklist && onToggleChecklist && (
        <div className="border-t">
          <button type="button" onClick={() => setShowChecklist((s) => !s)} aria-expanded={showChecklist} className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40">
            <span>
              Verification checklist · {doneCount}/{doc.checklist.length}
            </span>
            <ChevronDown className={cn("size-3.5 transition-transform", showChecklist && "rotate-180")} />
          </button>
          {showChecklist && (
            <ul className="space-y-1.5 px-3 pb-3">
              {doc.checklist.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-xs">
                  <Checkbox checked={c.done} disabled={!canVerify} onCheckedChange={() => onToggleChecklist(c.id)} id={`chk-${c.id}`} />
                  <label htmlFor={`chk-${c.id}`} className={cn(c.done && "text-muted-foreground line-through")}>
                    {c.label}
                  </label>
                </li>
              ))}
              {canVerify && doc.status !== "verified" && doc.checklist.every((c) => c.done) && (
                <li>
                  <Button size="xs" onClick={() => onSetStatus("verified")}>
                    <CheckCircle2 /> All checks passed — mark verified
                  </Button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{doc.label}</DialogTitle>
            <DialogDescription>{doc.fileName}</DialogDescription>
          </DialogHeader>
          {previewUrl && doc.mimeType === "application/pdf" ? (
            <iframe src={previewUrl} title={`Preview of ${doc.fileName}`} className="h-[60vh] w-full rounded-md border" />
          ) : previewUrl && doc.mimeType?.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={`Preview of ${doc.fileName}`} className="max-h-[60vh] w-full rounded-md border object-contain" />
          ) : (
            <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/40 text-center">
              <FileText className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium">Preview unavailable</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {previewUrl ? "This file type can't be previewed in the browser." : "Demo files keep metadata only. Uploaded file contents are held in memory for this session and are never stored."}
              </p>
            </div>
          )}
          <Callout tone="info">Demo-only upload behaviour. Production will use private storage with signed URLs and server-side access control.</Callout>
        </DialogContent>
      </Dialog>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject {doc.label}</DialogTitle>
            <DialogDescription>Tell the team what needs to be fixed. This is logged on the application.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Document expired — please resubmit a current version." aria-label="Rejection reason" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onSetStatus("rejected", reason.trim() || "Document rejected");
                setReason("");
                setRejecting(false);
              }}
            >
              Reject document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
