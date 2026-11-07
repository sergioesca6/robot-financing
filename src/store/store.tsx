"use client";

/**
 * Lightweight frontend data layer.
 *
 * - Holds the whole AppData graph in React state.
 * - Every mutation goes through a pure function in `lib/workflow` and is
 *   persisted to localStorage (non-sensitive demo data only — document files
 *   are never stored, only metadata).
 * - The `actions` object is the service boundary: swap its implementation for
 *   Supabase calls later without touching the UI.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { createSeedData, DATA_VERSION } from "@/data/seed";
import { hasPermission, type Permission } from "@/domain/permissions";
import type {
  AppData,
  AppSettings,
  ApplicationStatus,
  Customer,
  DocumentRecord,
  DocumentStatus,
  DocumentType,
  Employee,
  EmailRecord,
  FinancingApplication,
  FinancingOffer,
  Lender,
  LenderProgram,
  LenderSubmission,
} from "@/domain/types";
import * as wf from "@/lib/workflow";
import type { Ctx, WfResult } from "@/lib/workflow";
import { releaseAllDocumentFiles } from "@/services/documents";

export const STORAGE_KEY = "robot-finance-demo";

export interface Actions {
  saveApplication: (input: wf.ApplicationInput) => WfResult<FinancingApplication>;
  duplicateApplication: (id: string) => WfResult<FinancingApplication>;
  archiveApplication: (id: string, archived: boolean) => WfResult;
  assignApplications: (ids: string[], employeeId: string) => WfResult<number>;
  changeStatus: (id: string, to: ApplicationStatus, note?: string) => WfResult;
  fundDeal: (id: string, opts?: { fundedAmount?: number }) => WfResult;
  submitToLenders: (applicationId: string, entries: wf.SubmissionEntry[]) => WfResult<LenderSubmission[]>;
  updateSubmission: (id: string, u: wf.SubmissionUpdate) => WfResult<LenderSubmission>;
  setConditionResolved: (submissionId: string, conditionId: string, resolved: boolean) => WfResult;
  saveOffer: (input: wf.OfferInput) => WfResult<FinancingOffer>;
  deleteOffer: (id: string) => WfResult;
  acceptOffer: (id: string) => WfResult;
  rejectOffer: (id: string) => WfResult;
  setDocumentStatus: (id: string, status: DocumentStatus, note?: string) => WfResult;
  attachDocument: (id: string, file: { fileName: string; fileSize: number; mimeType: string }) => WfResult;
  toggleChecklistItem: (docId: string, itemId: string) => WfResult;
  addDocumentRequirement: (applicationId: string, type: DocumentType, label?: string) => WfResult<DocumentRecord>;
  addTask: (t: Parameters<typeof wf.addTask>[1]) => WfResult;
  toggleTask: (id: string) => WfResult;
  deleteTask: (id: string) => WfResult;
  addApplicationNote: (applicationId: string, body: string) => WfResult;
  addCustomerNote: (customerId: string, body: string) => WfResult;
  saveCustomer: (c: Customer) => WfResult<Customer>;
  recordEmail: (e: Parameters<typeof wf.recordEmail>[1]) => WfResult<EmailRecord>;
  markNotification: (id: string, read: boolean) => WfResult;
  markAllNotificationsRead: () => WfResult;
  saveLender: (l: Lender) => WfResult<Lender>;
  setLenderActive: (id: string, active: boolean) => WfResult;
  saveProgram: (p: LenderProgram) => WfResult<LenderProgram>;
  deleteProgram: (id: string) => WfResult;
  updateCommission: (id: string, patch: Parameters<typeof wf.updateCommission>[2]) => WfResult;
  updateSettings: (fn: (s: AppSettings) => AppSettings) => void;
  saveEmployee: (e: Employee) => void;
  setCurrentUser: (employeeId: string) => void;
  resetDemo: () => void;
}

interface StoreValue {
  data: AppData;
  actions: Actions;
  currentUser: Employee;
  can: (p: Permission) => boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

function load(): AppData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      if (parsed.version === DATA_VERSION && Array.isArray(parsed.applications)) return parsed;
    }
  } catch {
    /* fall through to seed */
  }
  return createSeedData();
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const ref = useRef<AppData | null>(null);

  useEffect(() => {
    const initial = load();
    ref.current = initial;
    // Hydrating from localStorage must happen after mount to avoid an SSR/client mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(initial);
  }, []);

  useEffect(() => {
    if (!data) return;
    const t = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        /* storage full or unavailable — demo continues in memory */
      }
    }, 150);
    return () => window.clearTimeout(t);
  }, [data]);

  const commit = useCallback((next: AppData) => {
    ref.current = next;
    setData(next);
  }, []);

  const ctx = useCallback((): Ctx => {
    const d = ref.current!;
    return { now: new Date().toISOString(), actorId: d.settings.currentUserId };
  }, []);

  const actions = useMemo<Actions>(() => {
    const run = <T,>(fn: (d: AppData, c: Ctx) => WfResult<T>): WfResult<T> => {
      const res = fn(ref.current!, ctx());
      if (res.ok) commit(res.data);
      else toast.error(res.error);
      return res;
    };
    const mutate = (fn: (d: AppData) => AppData) => commit(fn(ref.current!));
    return {
      saveApplication: (input) => run((d, c) => wf.saveApplication(d, input, c)),
      duplicateApplication: (id) => run((d, c) => wf.duplicateApplication(d, id, c)),
      archiveApplication: (id, archived) => run((d, c) => wf.archiveApplication(d, id, archived, c)),
      assignApplications: (ids, emp) => run((d, c) => wf.assignApplications(d, ids, emp, c)),
      changeStatus: (id, to, note) => run((d, c) => wf.changeApplicationStatus(d, id, to, c, note)),
      fundDeal: (id, opts) => run((d, c) => wf.fundDeal(d, id, c, opts)),
      submitToLenders: (appId, entries) => run((d, c) => wf.submitToLenders(d, appId, entries, c)),
      updateSubmission: (id, u) => run((d, c) => wf.updateSubmission(d, id, u, c)),
      setConditionResolved: (sid, cid, resolved) => run((d, c) => wf.setConditionResolved(d, sid, cid, resolved, c)),
      saveOffer: (input) => run((d, c) => wf.saveOffer(d, input, c)),
      deleteOffer: (id) => run((d, c) => wf.deleteOffer(d, id, c)),
      acceptOffer: (id) => run((d, c) => wf.acceptOffer(d, id, c)),
      rejectOffer: (id) => run((d, c) => wf.rejectOffer(d, id, c)),
      setDocumentStatus: (id, status, note) => run((d, c) => wf.setDocumentStatus(d, id, status, c, note)),
      attachDocument: (id, file) => run((d, c) => wf.attachDocument(d, id, file, c)),
      toggleChecklistItem: (docId, itemId) => run((d) => wf.toggleChecklistItem(d, docId, itemId)),
      addDocumentRequirement: (appId, type, label) => run((d, c) => wf.addDocumentRequirement(d, appId, type, c, label)),
      addTask: (t) => run((d, c) => wf.addTask(d, t, c)),
      toggleTask: (id) => run((d, c) => wf.toggleTask(d, id, c)),
      deleteTask: (id) => run((d) => wf.deleteTask(d, id)),
      addApplicationNote: (appId, body) => run((d, c) => wf.addApplicationNote(d, appId, body, c)),
      addCustomerNote: (cid, body) => run((d, c) => wf.addCustomerNote(d, cid, body, c)),
      saveCustomer: (cu) => run((d) => wf.saveCustomer(d, cu)),
      recordEmail: (e) => run((d, c) => wf.recordEmail(d, e, c)),
      markNotification: (id, read) => run((d) => wf.markNotification(d, id, read)),
      markAllNotificationsRead: () => run((d) => wf.markAllNotificationsRead(d)),
      saveLender: (l) => run((d) => wf.saveLender(d, l)),
      setLenderActive: (id, active) => run((d) => wf.setLenderActive(d, id, active)),
      saveProgram: (p) => run((d) => wf.saveProgram(d, p)),
      deleteProgram: (id) => run((d) => wf.deleteProgram(d, id)),
      updateCommission: (id, patch) => run((d, c) => wf.updateCommission(d, id, patch, c)),
      updateSettings: (fn) => mutate((d) => ({ ...d, settings: fn(d.settings) })),
      saveEmployee: (e) =>
        mutate((d) => ({
          ...d,
          employees: d.employees.some((x) => x.id === e.id) ? d.employees.map((x) => (x.id === e.id ? e : x)) : [...d.employees, e],
        })),
      setCurrentUser: (employeeId) => mutate((d) => ({ ...d, settings: { ...d.settings, currentUserId: employeeId } })),
      resetDemo: () => {
        releaseAllDocumentFiles();
        const fresh = createSeedData();
        commit(fresh);
      },
    };
  }, [commit, ctx]);

  const value = useMemo<StoreValue | null>(() => {
    if (!data) return null;
    const currentUser = data.employees.find((e) => e.id === data.settings.currentUserId) ?? data.employees[0]!;
    return { data, actions, currentUser, can: (p) => hasPermission(currentUser.role, p) };
  }, [data, actions]);

  // `value` is derived from state only; the ref is read inside event-time actions, not during render.
  // eslint-disable-next-line react-hooks/refs
  if (!value) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground" role="status" aria-live="polite">
          <div className="size-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          Loading demo workspace…
        </div>
      </div>
    );
  }
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error("useStore must be used within StoreProvider");
  return v;
}
export const useData = () => useStore().data;
export const useActions = () => useStore().actions;
