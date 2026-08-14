import { supabase } from "@/integrations/supabase/client";

const KEY = "sanad_offline_invoices";

export type QueuedInvoice = {
  id: string;
  kind: "sales" | "purchases";
  invoice: Record<string, any>;
  lines: Record<string, any>[];
  post: boolean;
  payment?: Record<string, any> | null;
  createdAt: string;
};

export function readQueue(): QueuedInvoice[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as QueuedInvoice[];
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedInvoice[]) {
  window.localStorage.setItem(KEY, JSON.stringify(q));
  window.dispatchEvent(new CustomEvent("sanad:queue-changed"));
}

export function enqueueInvoice(entry: Omit<QueuedInvoice, "id" | "createdAt">) {
  const q = readQueue();
  q.push({ ...entry, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
  writeQueue(q);
}

async function pushOne(entry: QueuedInvoice) {
  const table = entry.kind === "sales" ? "sales_invoices" : "purchase_invoices";
  const linesTable = entry.kind === "sales" ? "sales_invoice_lines" : "purchase_invoice_lines";
  const rpc = entry.kind === "sales" ? "post_sales_invoice" : "post_purchase_invoice";

  const { data: inv, error } = await (supabase.from(table as any) as any)
    .insert(entry.invoice)
    .select()
    .single();
  if (error) throw error;

  const ins = await (supabase.from(linesTable as any) as any).insert(
    entry.lines.map((l) => ({ ...l, invoice_id: inv.id })),
  );
  if (ins.error) throw ins.error;

  if (entry.post) {
    const { error: pErr } = await supabase.rpc(rpc as any, { _invoice_id: inv.id });
    if (pErr) throw pErr;
  }

  if (entry.payment) {
    const { data: pay, error: payErr } = await supabase
      .from("payments")
      .insert(entry.payment as any)
      .select()
      .single();
    if (payErr) throw payErr;
    if (entry.post) await supabase.rpc("post_payment", { _payment_id: pay.id });
  }
}

let syncing = false;

export async function syncQueue(): Promise<number> {
  if (syncing || typeof navigator === "undefined" || !navigator.onLine) return 0;
  syncing = true;
  let done = 0;
  try {
    for (const entry of readQueue()) {
      try {
        await pushOne(entry);
        writeQueue(readQueue().filter((e) => e.id !== entry.id));
        done += 1;
      } catch {
        break; // keep order; retry later
      }
    }
  } finally {
    syncing = false;
  }
  return done;
}
