"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { Bell, BellOff, CalendarCheck, CheckCheck, Mail, Plus, Trash2 } from "lucide-react";
import { EmailDialog, EmailListItem } from "@/components/emails/email-dialog";
import { EmptyState, FilterSelect, PageHeader, SectionCard } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NOTIFICATION_TYPE_LABEL } from "@/domain/labels";
import type { FollowUpTask, NotificationType, TaskKind } from "@/domain/types";
import { addDays, formatDate, formatRelative, fromDateInput, toDateInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/store";

export default function NotificationsPage() {
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
}

const TABS = ["notifications", "followups", "emails"];

function Page() {
  const { data, actions } = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const t = params.get("tab");
  const tab = TABS.includes(t ?? "") ? (t as string) : "notifications";
  const unread = data.notifications.filter((n) => !n.read).length;
  const openTasks = data.tasks.filter((x) => !x.done).length;

  return (
    <>
      <PageHeader
        title="Notifications & follow-ups"
        description="Everything that needs attention, plus a record of communications. Emails in this demo are simulated."
        actions={
          tab === "notifications" ? (
            <Button variant="outline" onClick={() => actions.markAllNotificationsRead()} disabled={unread === 0}>
              <CheckCheck /> Mark all read
            </Button>
          ) : undefined
        }
      />
      <Tabs value={tab} onValueChange={(v) => router.replace(`/notifications?tab=${v}`, { scroll: false })}>
        <TabsList className="mb-4">
          <TabsTrigger value="notifications">Notifications{unread ? ` · ${unread} new` : ""}</TabsTrigger>
          <TabsTrigger value="followups">Follow-ups · {openTasks}</TabsTrigger>
          <TabsTrigger value="emails">Emails · {data.emails.length}</TabsTrigger>
        </TabsList>
        <TabsContent value="notifications">
          <NotificationList />
        </TabsContent>
        <TabsContent value="followups">
          <Followups />
        </TabsContent>
        <TabsContent value="emails">
          <Emails />
        </TabsContent>
      </Tabs>
    </>
  );
}

function NotificationList() {
  const { data, actions } = useStore();
  const [filter, setFilter] = useState("all");
  const [type, setType] = useState("all");
  const list = [...data.notifications]
    .filter((n) => (filter === "all" || (filter === "unread" ? !n.read : n.read)) && (type === "all" || n.type === type))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <SectionCard flush>
      <div className="flex flex-wrap gap-2 border-b p-3">
        <FilterSelect label="Show" value={filter} onChange={setFilter} allLabel="All" options={[{ value: "unread", label: "Unread" }, { value: "read", label: "Read" }]} />
        <FilterSelect label="Type" value={type} onChange={setType} options={(Object.keys(NOTIFICATION_TYPE_LABEL) as NotificationType[]).map((k) => ({ value: k, label: NOTIFICATION_TYPE_LABEL[k] }))} />
      </div>
      {list.length === 0 ? (
        <EmptyState icon={BellOff} title="You're all caught up" description="New activity will show up here." />
      ) : (
        <ul className="divide-y">
          {list.map((n) => (
            <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3", !n.read && "bg-primary/[0.03]")}>
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} aria-label={n.read ? "Read" : "Unread"} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-sm text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {NOTIFICATION_TYPE_LABEL[n.type]} · {formatRelative(n.createdAt)}
                  {n.applicationId && (
                    <>
                      {" · "}
                      <Link className="text-primary hover:underline" href={n.link ?? `/applications/${n.applicationId}`} onClick={() => actions.markNotification(n.id, true)}>
                        Open {n.applicationId}
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <Button variant="ghost" size="xs" onClick={() => actions.markNotification(n.id, !n.read)}>
                Mark {n.read ? "unread" : "read"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function Followups() {
  const { data, actions, currentUser } = useStore();
  const [scope, setScope] = useState("open");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(toDateInput(addDays(new Date(), data.settings.financingDefaults.followUpDays)));
  const [appId, setAppId] = useState("none");
  const [kind, setKind] = useState<TaskKind>("internal");
  const today = toDateInput(new Date().toISOString());

  const tasks = [...data.tasks]
    .filter((x) => (scope === "all" ? true : scope === "done" ? x.done : !x.done))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.dueDate.localeCompare(b.dueDate));
  const bucket = (x: FollowUpTask) => (x.done ? "Completed" : toDateInput(x.dueDate) < today ? "Overdue" : toDateInput(x.dueDate) === today ? "Due today" : "Upcoming");
  const groups = ["Overdue", "Due today", "Upcoming", "Completed"].map((g) => ({ g, items: tasks.filter((x) => bucket(x) === g) })).filter((x) => x.items.length);

  return (
    <div className="space-y-4">
      <SectionCard title="Add follow-up">
        <form
          className="grid gap-2 md:grid-cols-[1fr_170px_150px_160px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            const app = data.applications.find((a) => a.id === appId);
            const r = actions.addTask({ title, dueDate: fromDateInput(due), kind, applicationId: app?.id, customerId: app?.customerId, assigneeId: currentUser.id });
            if (r.ok) setTitle("");
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call customer about missing statements" aria-label="Follow-up title" />
          <Select value={appId} onValueChange={setAppId}>
            <SelectTrigger className="w-full" aria-label="Application"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No application</SelectItem>
              {data.applications.filter((a) => !a.archived).map((a) => <SelectItem key={a.id} value={a.id}>{a.id}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={kind} onValueChange={(v) => setKind(v as TaskKind)}>
            <SelectTrigger className="w-full" aria-label="Kind"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="customer">Customer</SelectItem>
              <SelectItem value="lender">Lender</SelectItem>
              <SelectItem value="document">Document</SelectItem>
              <SelectItem value="internal">Internal</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
          <Button type="submit" disabled={!title.trim()}><Plus /> Add</Button>
        </form>
      </SectionCard>

      <div className="flex gap-2">
        <FilterSelect label="Show" value={scope} onChange={setScope} allLabel="All" options={[{ value: "open", label: "Open" }, { value: "done", label: "Completed" }]} />
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border bg-card"><EmptyState icon={CalendarCheck} title="Nothing to follow up" description="Add a follow-up above or record a lender submission with a follow-up date." /></div>
      ) : (
        groups.map(({ g, items }) => (
          <SectionCard key={g} title={`${g} · ${items.length}`} flush>
            <ul className="divide-y">
              {items.map((x) => (
                <li key={x.id} className="group flex items-start gap-3 px-4 py-3">
                  <Checkbox checked={x.done} onCheckedChange={() => actions.toggleTask(x.id)} id={`task-${x.id}`} className="mt-0.5" />
                  <label htmlFor={`task-${x.id}`} className="min-w-0 flex-1">
                    <span className={cn("block text-sm", x.done && "text-muted-foreground line-through")}>{x.title}</span>
                    <span className={cn("text-xs", g === "Overdue" ? "font-medium text-red-600" : "text-muted-foreground")}>
                      Due {formatDate(x.dueDate)} · {x.kind} · {data.employees.find((e) => e.id === x.assigneeId)?.name}
                    </span>
                  </label>
                  {x.applicationId && (
                    <Link href={`/applications/${x.applicationId}`} className="font-mono text-xs text-primary hover:underline">
                      {x.applicationId}
                    </Link>
                  )}
                  <button type="button" onClick={() => actions.deleteTask(x.id)} aria-label={`Delete follow-up: ${x.title}`} className="rounded p-1 text-muted-foreground opacity-0 hover:text-red-600 focus:opacity-100 group-hover:opacity-100">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>
        ))
      )}
    </div>
  );
}

function Emails() {
  const { data } = useStore();
  const [open, setOpen] = useState<{ templateId?: string } | null>(null);
  const [aud, setAud] = useState("all");
  const emails = data.emails.filter((e) => aud === "all" || e.audience === aud).sort((a, b) => (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt));
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <SectionCard
        title="Communication history"
        description="Drafts and simulated sends. Nothing leaves this prototype."
        action={
          <Button size="sm" onClick={() => setOpen({})}>
            <Mail /> Compose
          </Button>
        }
      >
        <div className="mb-3">
          <FilterSelect label="Audience" value={aud} onChange={setAud} options={[{ value: "customer", label: "Customers" }, { value: "lender", label: "Lenders" }]} />
        </div>
        {emails.length === 0 ? <EmptyState icon={Mail} title="No emails yet" /> : <ul className="space-y-2">{emails.map((e) => <EmailListItem key={e.id} email={e} />)}</ul>}
      </SectionCard>
      <SectionCard title="Templates" description="Edit templates in Settings.">
        <ul className="space-y-2">
          {data.settings.templates.map((tpl) => (
            <li key={tpl.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{tpl.name}</p>
                <p className="text-xs capitalize text-muted-foreground">{tpl.audience}</p>
              </div>
              <Button variant="outline" size="xs" onClick={() => setOpen({ templateId: tpl.id })}>
                Use
              </Button>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Bell className="size-3" /> Pick an application inside the composer to merge its details.</p>
      </SectionCard>
      {open && <EmailDialog open onOpenChange={(o) => !o && setOpen(null)} templateId={open.templateId} />}
    </div>
  );
}
