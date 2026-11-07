"use client";

import { useState } from "react";
import { Loader2, Mail, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Callout, Field } from "@/components/shared/page";
import { SimulatedTag } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { EmailRecord } from "@/domain/types";
import { customerDisplayName } from "@/lib/selectors";
import { draftFromTemplate } from "@/services/email";
import { MockEmailProvider } from "@/services/email";
import { useStore } from "@/store/store";

export function EmailDialog({
  open,
  onOpenChange,
  applicationId,
  templateId,
  lenderId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  applicationId?: string;
  templateId?: string;
  lenderId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <EmailForm applicationId={applicationId} templateId={templateId} lenderId={lenderId} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EmailForm({ applicationId, templateId, lenderId, onDone }: { applicationId?: string; templateId?: string; lenderId?: string; onDone: () => void }) {
  const { data, actions } = useStore();
  const [appId, setAppId] = useState(applicationId ?? "");
  const [tplId, setTplId] = useState(templateId ?? data.settings.templates[0]?.id ?? "");
  const [lenderSel, setLenderSel] = useState(lenderId ?? "");
  const [init] = useState(() => {
    const a = data.applications.find((x) => x.id === applicationId);
    const t = data.settings.templates.find((x) => x.id === (templateId ?? data.settings.templates[0]?.id));
    if (!a || !t) return { subject: "", body: "", to: "", toName: "" };
    const l = data.lenders.find((x) => x.id === (lenderId ?? (t.audience === "lender" ? data.submissions.find((s) => s.applicationId === a.id)?.lenderId : undefined)));
    return draftFromTemplate(t, data, a, l);
  });
  const [to, setTo] = useState(init.to);
  const [toName, setToName] = useState(init.toName);
  const [subject, setSubject] = useState(init.subject);
  const [body, setBody] = useState(init.body);
  const [sending, setSending] = useState(false);

  const app = data.applications.find((a) => a.id === appId);
  const tpl = data.settings.templates.find((t) => t.id === tplId);
  const lenders = data.lenders.filter((l) => data.submissions.some((s) => s.applicationId === appId && s.lenderId === l.id));

  const apply = (nextApp = appId, nextTpl = tplId, nextLender = lenderSel) => {
    const a = data.applications.find((x) => x.id === nextApp);
    const t = data.settings.templates.find((x) => x.id === nextTpl);
    if (!a || !t) return;
    const lender = data.lenders.find((l) => l.id === (nextLender || (t.audience === "lender" ? lenders[0]?.id : "")));
    const d = draftFromTemplate(t, data, a, lender);
    setSubject(d.subject);
    setBody(d.body);
    setTo(d.to);
    setToName(d.toName);
  };

  const save = async (send: boolean) => {
    if (!to.trim()) return void toast.error("Add a recipient email address.");
    if (!/^\S+@\S+\.\S+$/.test(to.trim())) return void toast.error("Enter a valid recipient email.");
    const record: Omit<EmailRecord, "id" | "createdAt" | "authorId" | "sentAt"> = {
      applicationId: app?.id,
      audience: tpl?.audience ?? "customer",
      to: to.trim(),
      toName,
      subject,
      body,
      templateId: tpl?.id,
      status: send ? "simulated_sent" : "draft",
    };
    setSending(true);
    if (send) await MockEmailProvider.send({ to: record.to, toName, subject, body });
    const res = actions.recordEmail(record);
    setSending(false);
    if (res.ok) {
      toast.success(send ? "Email simulated as sent" : "Draft saved", { description: send ? "No real email was sent — this is a demo." : undefined });
      onDone();
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          Compose email <SimulatedTag />
        </DialogTitle>
        <DialogDescription>Start from a template, edit freely, and preview. Sending is simulated and logged on the application.</DialogDescription>
      </DialogHeader>
      <Callout tone="warning">This prototype never sends real email. “Send” records a simulated message in the communication history.</Callout>

      <div className="grid gap-3 sm:grid-cols-2">
        {!applicationId && (
          <Field label="Application" className="sm:col-span-2">
            {(id) => (
              <Select
                value={appId}
                onValueChange={(v) => {
                  setAppId(v);
                  apply(v, tplId, "");
                }}
              >
                <SelectTrigger id={id} className="w-full">
                  <SelectValue placeholder="Select application (optional for blank emails)" />
                </SelectTrigger>
                <SelectContent>
                  {data.applications.filter((a) => !a.archived).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.id} · {customerDisplayName(data.customers.find((c) => c.id === a.customerId))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        )}
        <Field label="Template">
          {(id) => (
            <Select
              value={tplId}
              onValueChange={(v) => {
                setTplId(v);
                apply(appId, v, lenderSel);
              }}
            >
              <SelectTrigger id={id} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.settings.templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.audience})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        {tpl?.audience === "lender" && (
          <Field label="Lender">
            {(id) => (
              <Select
                value={lenderSel}
                onValueChange={(v) => {
                  setLenderSel(v);
                  apply(appId, tplId, v);
                }}
              >
                <SelectTrigger id={id} className="w-full">
                  <SelectValue placeholder="Select lender" />
                </SelectTrigger>
                <SelectContent>
                  {lenders.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        )}
        <Field label="To">{(id) => <Input id={id} type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@example.com" />}</Field>
        <Field label="Recipient name">{(id) => <Input id={id} value={toName} onChange={(e) => setToName(e.target.value)} />}</Field>
      </div>

      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="edit" className="space-y-3">
          <Field label="Subject">{(id) => <Input id={id} value={subject} onChange={(e) => setSubject(e.target.value)} />}</Field>
          <Field label="Message">{(id) => <Textarea id={id} rows={10} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-[13px]" />}</Field>
        </TabsContent>
        <TabsContent value="preview">
          <div className="rounded-lg border bg-card">
            <div className="space-y-0.5 border-b px-4 py-3 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">To:</span> {toName ? `${toName} <${to}>` : to || "—"}
              </p>
              <p>
                <span className="font-medium text-foreground">Subject:</span> {subject || "—"}
              </p>
            </div>
            <pre className="whitespace-pre-wrap px-4 py-4 font-sans text-sm leading-relaxed">{body || "Nothing to preview yet."}</pre>
            <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">Simulated preview — not delivered.</p>
          </div>
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="outline" onClick={() => save(false)} disabled={sending || !subject.trim() || !body.trim()}>
          <Save /> Save draft
        </Button>
        <Button onClick={() => save(true)} disabled={sending || !subject.trim() || !body.trim()}>
          {sending ? <Loader2 className="animate-spin" /> : <Send />} Send (simulated)
        </Button>
      </DialogFooter>
    </>
  );
}

export function EmailListItem({ email }: { email: EmailRecord }) {
  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{email.subject}</p>
            <span className={email.status === "draft" ? "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600" : "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"}>
              {email.status === "draft" ? "Draft" : "Simulated send"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            To {email.toName || email.to} · {email.audience} · {new Date(email.sentAt ?? email.createdAt).toLocaleString()}
          </p>
          <details className="mt-1.5">
            <summary className="cursor-pointer text-xs font-medium text-primary">View message</summary>
            <pre className="mt-1.5 whitespace-pre-wrap rounded-md bg-muted/50 p-3 font-sans text-xs leading-relaxed">{email.body}</pre>
          </details>
        </div>
      </div>
    </li>
  );
}
