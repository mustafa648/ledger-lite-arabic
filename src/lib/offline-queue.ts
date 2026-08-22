import { supabase } from "@/integrations/supabase/client";

const KEY = "sanad_offline_invoices";

export type QueueStatus = "pending" | "failed" | "conflict" | "manual";

/** Retry policy for background sync. */
export const MAX_ATTEMPTS = 6;
export const MAX_AGE_MS = 24 * 60 * 60 * 1000; // after 24h a stuck item needs a human
const BACKOFF_MS = [5_000, 15_000, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

export type SyncLogEntry = {
  id: string;
  queueId: string;
  clientRef: string;
  kind: "sales" | "purchases";
  at: string;
  attempt: number;
  result: "success" | "failed" | "conflict" | "manual" | "resolved";
  message?: string | null;
  trigger: "auto" | "manual";
};

const LOG_KEY = "sanad_sync_audit";
const LOG_LIMIT = 300;

export function readSyncLog(): SyncLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(LOG_KEY) ?? "[]") as SyncLogEntry[];
  } catch {
    return [];
  }
}

export function clearSyncLog() {
  window.localStorage.setItem(LOG_KEY, "[]");
  window.dispatchEvent(new CustomEvent("sanad:queue-changed"));
}

function log(e: Omit<SyncLogEntry, "id" | "at">) {
  if (typeof window === "undefined") return;
  const rows = readSyncLog();
  rows.unshift({ ...e, id: crypto.randomUUID(), at: new Date().toISOString() });
  window.localStorage.setItem(LOG_KEY, JSON.stringify(rows.slice(0, LOG_LIMIT)));
  window.dispatchEvent(new CustomEvent("sanad:queue-changed"));
}

export type QueuedInvoice = {
  id: string;
  /** Stable idempotency key persisted on the server row, prevents duplicates on retry. */
  clientRef: string;
  kind: "sales" | "purchases";
  invoice: Record<string, any>;
  lines: Record<string, any>[];
  post: boolean;
  payment?: Record<string, any> | null;
  createdAt: string;
  status: QueueStatus;
  attempts: number;
  lastError?: string | null;
  lastTriedAt?: string | null;
  /** Epoch ms; background sync skips the entry until this time (exponential backoff). */
  nextAttemptAt?: number | null;
};

export function readQueue(): QueuedInvoice[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as QueuedInvoice[];
    // migrate entries written by older versions
    return raw.map((e) => ({
      ...e,
      clientRef: e.clientRef ?? e.id,
      status: e.status ?? "pending",
      attempts: e.attempts ?? 0,
    }));
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedInvoice[]) {
  window.localStorage.setItem(KEY, JSON.stringify(q));
  window.dispatchEvent(new CustomEvent("sanad:queue-changed"));
}

function patch(id: string, changes: Partial<QueuedInvoice>) {
  writeQueue(readQueue().map((e) => (e.id === id ? { ...e, ...changes } : e)));
}

export function enqueueInvoice(
  entry: Omit<QueuedInvoice, "id" | "createdAt" | "clientRef" | "status" | "attempts">,
) {
  const q = readQueue();
  const id = crypto.randomUUID();
  q.push({
    ...entry,
    id,
    clientRef: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  });
  writeQueue(q);
}

export function removeQueued(id: string) {
  writeQueue(readQueue().filter((e) => e.id !== id));
}

export function pendingCount() {
  return readQueue().length;
}

export function needsAttentionCount() {
  return readQueue().filter((e) => e.status === "conflict" || e.status === "manual").length;
}

function isBlocked(e: QueuedInvoice) {
  return e.status === "conflict" || e.status === "manual";
}

function escalate(entry: QueuedInvoice, status: QueueStatus): QueueStatus {
  if (status !== "failed") return status;
  const tooOld = Date.now() - new Date(entry.createdAt).getTime() > MAX_AGE_MS;
  if (entry.attempts + 1 >= MAX_ATTEMPTS || tooOld) return "manual";
  return "failed";
}

const DUPLICATE = "23505";

/**
 * Pushes one queued document. Idempotent: the server row carries `client_ref`,
 * so a retry after a partial/unknown failure adopts the existing row instead of
 * creating a second invoice. Document numbers stay sequential because
 * `invoice_no` is issued server-side by next_doc_number() at posting time.
 */
async function pushOne(entry: QueuedInvoice) {
  const table = entry.kind === "sales" ? "sales_invoices" : "purchase_invoices";
  const linesTable = entry.kind === "sales" ? "sales_invoice_lines" : "purchase_invoice_lines";
  const rpc = entry.kind === "sales" ? "post_sales_invoice" : "post_purchase_invoice";

  // 1. Conflict check — did an earlier attempt already land this document?
  const existing = await (supabase.from(table as any) as any)
    .select("id, status, invoice_no, total")
    .eq("client_ref", entry.clientRef)
    .maybeSingle();
  if (existing.error) throw existing.error;

  let invId: string | undefined = existing.data?.id;
  let alreadyPosted = existing.data?.status === "posted";

  if (!invId) {
    const { data: inv, error } = await (supabase.from(table as any) as any)
      .insert({ ...entry.invoice, client_ref: entry.clientRef })
      .select()
      .single();
    if (error) {
      if (error.code === DUPLICATE) return; // another tab/device already synced it
      throw error;
    }
    invId = inv.id;

    const ins = await (supabase.from(linesTable as any) as any).insert(
      entry.lines.map((l) => ({ ...l, invoice_id: invId })),
    );
    if (ins.error) throw ins.error;
  }

  if (entry.post && !alreadyPosted) {
    const { error: pErr } = await supabase.rpc(rpc as any, { _invoice_id: invId });
    if (pErr && !/already posted|مرحلة/i.test(pErr.message)) throw pErr;
    alreadyPosted = true;
  }

  if (entry.payment) {
    const payRef = `${entry.clientRef}`;
    const existingPay = await supabase
      .from("payments")
      .select("id, status")
      .eq("client_ref", payRef)
      .maybeSingle();
    if (existingPay.error) throw existingPay.error;

    let payId = existingPay.data?.id;
    if (!payId) {
      const { data: pay, error: payErr } = await supabase
        .from("payments")
        .insert({ ...(entry.payment as any), client_ref: payRef })
        .select()
        .single();
      if (payErr) {
        if (payErr.code === DUPLICATE) return;
        throw payErr;
      }
      payId = pay.id;
    }
    if (entry.post && existingPay.data?.status !== "posted") {
      const { error } = await supabase.rpc("post_payment", { _payment_id: payId });
      if (error && !/already posted/i.test(error.message)) throw error;
    }
  }
}

function classify(err: any): { status: QueueStatus; message: string } {
  const code = err?.code as string | undefined;
  const message: string = err?.message ?? String(err);
  // Data conflicts that will never resolve by retrying — need a human decision.
  if (code === "23503" || code === "23514" || code === DUPLICATE || code === "42501") {
    return { status: "conflict", message };
  }
  if (/غير كاف|not balanced|صلاحية|permission/i.test(message)) {
    return { status: "conflict", message };
  }
  return { status: "failed", message };
}

let syncing = false;

export async function syncQueue(): Promise<number> {
  if (syncing || typeof navigator === "undefined" || !navigator.onLine) return 0;
  syncing = true;
  let done = 0;
  try {
    for (const entry of readQueue()) {
      if (isBlocked(entry)) continue; // wait for a human decision
      if (entry.nextAttemptAt && Date.now() < entry.nextAttemptAt) continue; // backoff
      try {
        await pushOne(entry);
        removeQueued(entry.id);
        log({ queueId: entry.id, clientRef: entry.clientRef, kind: entry.kind, attempt: entry.attempts + 1, result: "success", trigger: "auto" });
        done += 1;
      } catch (err: any) {
        const status = recordFailure(entry, err, "auto");
        if (status === "failed") break; // transient — preserve order, retry later
      }
    }
  } finally {
    syncing = false;
  }
  return done;
}

/** Retry a single queued document immediately (used by the pending-operations screen). */
export async function retryQueued(id: string): Promise<{ ok: boolean; error?: string }> {
  const entry = readQueue().find((e) => e.id === id);
  if (!entry) return { ok: false, error: "not found" };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false, error: "offline" };
  try {
    await pushOne(entry);
    removeQueued(id);
    return { ok: true };
  } catch (err: any) {
    recordFailure(entry, err, "manual");
    return { ok: false, error: err?.message ?? String(err) };
  }
}

function recordFailure(entry: QueuedInvoice, err: any, trigger: "auto" | "manual"): QueueStatus {
  const { status: raw, message } = classify(err);
  const status = escalate(entry, raw);
  const attempts = entry.attempts + 1;
  patch(entry.id, {
    status,
    attempts,
    lastError: message,
    lastTriedAt: new Date().toISOString(),
    nextAttemptAt:
      status === "failed" ? Date.now() + (BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)] ?? 60_000) : null,
  });
  log({ queueId: entry.id, clientRef: entry.clientRef, kind: entry.kind, attempt: attempts, result: status === "manual" ? "manual" : status === "conflict" ? "conflict" : "failed", message, trigger });
  return status;
}

export type RemoteSnapshot = {
  invoice: Record<string, any> | null;
  lines: Record<string, any>[];
};

/** Reads whatever the server already holds for this queued document. */
export async function fetchRemote(entry: QueuedInvoice): Promise<RemoteSnapshot> {
  const table = entry.kind === "sales" ? "sales_invoices" : "purchase_invoices";
  const linesTable = entry.kind === "sales" ? "sales_invoice_lines" : "purchase_invoice_lines";
  const { data } = await (supabase.from(table as any) as any)
    .select("*")
    .eq("client_ref", entry.clientRef)
    .maybeSingle();
  if (!data) return { invoice: null, lines: [] };
  const { data: lines } = await (supabase.from(linesTable as any) as any)
    .select("*")
    .eq("invoice_id", data.id)
    .order("line_no");
  return { invoice: data, lines: lines ?? [] };
}

export type ConflictAction = "local" | "remote" | "merge";

/**
 * Applies the user's decision for a conflicted document.
 * - local  : overwrite the server draft with the locally stored version, then post it.
 * - remote : keep the server version and drop the local copy.
 * - merge  : keep the server row, add any lines/payment it is missing, then post.
 */
export async function resolveConflict(
  id: string,
  action: ConflictAction,
): Promise<{ ok: boolean; error?: string }> {
  const entry = readQueue().find((e) => e.id === id);
  if (!entry) return { ok: false, error: "not found" };

  const table = entry.kind === "sales" ? "sales_invoices" : "purchase_invoices";
  const linesTable = entry.kind === "sales" ? "sales_invoice_lines" : "purchase_invoice_lines";

  try {
    if (action === "remote") {
      removeQueued(id);
      log({ queueId: id, clientRef: entry.clientRef, kind: entry.kind, attempt: entry.attempts, result: "resolved", message: "kept server version", trigger: "manual" });
      return { ok: true };
    }

    const remote = await fetchRemote(entry);

    if (action === "local" && remote.invoice) {
      if (remote.invoice.status === "posted") {
        return { ok: false, error: "المستند مُرحّل على الخادم ولا يمكن استبداله" };
      }
      const upd = await (supabase.from(table as any) as any)
        .update(entry.invoice)
        .eq("id", remote.invoice.id);
      if (upd.error) throw upd.error;
      const del = await (supabase.from(linesTable as any) as any).delete().eq("invoice_id", remote.invoice.id);
      if (del.error) throw del.error;
      const ins = await (supabase.from(linesTable as any) as any).insert(
        entry.lines.map((l) => ({ ...l, invoice_id: remote.invoice!.id })),
      );
      if (ins.error) throw ins.error;
    }

    if (action === "merge" && remote.invoice && remote.lines.length === 0 && entry.lines.length > 0) {
      const ins = await (supabase.from(linesTable as any) as any).insert(
        entry.lines.map((l) => ({ ...l, invoice_id: remote.invoice!.id })),
      );
      if (ins.error) throw ins.error;
    }

    // clear the block, then let the normal idempotent push finish the job
    patch(id, { status: "pending", lastError: null, nextAttemptAt: null });
    const r = await retryQueued(id);
    if (r.ok) {
      log({ queueId: id, clientRef: entry.clientRef, kind: entry.kind, attempt: entry.attempts + 1, result: "resolved", message: action === "local" ? "local version applied" : "merged with server", trigger: "manual" });
    }
    return r;
  } catch (err: any) {
    const message = err?.message ?? String(err);
    patch(id, { status: "conflict", lastError: message, lastTriedAt: new Date().toISOString() });
    log({ queueId: id, clientRef: entry.clientRef, kind: entry.kind, attempt: entry.attempts, result: "conflict", message, trigger: "manual" });
    return { ok: false, error: message };
  }
}
