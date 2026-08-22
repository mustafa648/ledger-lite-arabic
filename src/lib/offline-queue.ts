import { supabase } from "@/integrations/supabase/client";

const KEY = "sanad_offline_invoices";

export type QueueStatus = "pending" | "failed" | "conflict";

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
  return readQueue().filter((e) => e.status !== "conflict").length;
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
      if (entry.status === "conflict") continue; // wait for manual retry/delete
      try {
        await pushOne(entry);
        removeQueued(entry.id);
        done += 1;
      } catch (err: any) {
        const { status, message } = classify(err);
        patch(entry.id, {
          status,
          attempts: entry.attempts + 1,
          lastError: message,
          lastTriedAt: new Date().toISOString(),
        });
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
    const { status, message } = classify(err);
    patch(id, {
      status,
      attempts: entry.attempts + 1,
      lastError: message,
      lastTriedAt: new Date().toISOString(),
    });
    return { ok: false, error: message };
  }
}
