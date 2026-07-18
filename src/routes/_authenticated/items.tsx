import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Sliders } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/items")({ component: ItemsPage });

function ItemsPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [adjust, setAdjust] = useState<any>(null);

  const items = useQuery({
    queryKey: ["items"],
    queryFn: async () => (await supabase.from("items").select("*").order("sku")).data ?? [],
  });

  const filtered = (items.data ?? []).filter((i: any) =>
    !search || i.sku.toLowerCase().includes(search.toLowerCase()) || i.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title={t("items.title")}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="me-1 h-4 w-4" />{t("items.newItem")}</Button>
            </DialogTrigger>
            <ItemDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["items"] }); }} />
          </Dialog>
        }
      />
      <Card className="p-4 space-y-3">
        <Input placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-start">{t("items.sku")}</th>
                <th className="p-2 text-start">{t("common.name")}</th>
                <th className="p-2 text-start">{t("items.unit")}</th>
                <th className="p-2 text-end">{t("items.salePrice")}</th>
                <th className="p-2 text-end">{t("items.averageCost")}</th>
                <th className="p-2 text-end">{t("items.onHand")}</th>
                <th className="p-2 text-center">{t("items.isService")}</th>
                <th className="p-2 text-end w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it: any) => (
                <tr key={it.id} className="border-b">
                  <td className="p-2 font-mono">{it.sku}</td>
                  <td className="p-2">{i18n.language === "en" ? it.name_en || it.name : it.name}</td>
                  <td className="p-2">{it.unit}</td>
                  <td className="p-2 text-end">{formatMoney(it.sale_price, "YER", i18n.language)}</td>
                  <td className="p-2 text-end">{formatMoney(it.average_cost, "YER", i18n.language)}</td>
                  <td className="p-2 text-end">{Number(it.quantity_on_hand).toLocaleString()}</td>
                  <td className="p-2 text-center">{it.is_service ? "•" : ""}</td>
                  <td className="p-2 text-end">
                    {!it.is_service && (
                      <Button variant="ghost" size="icon" onClick={() => setAdjust(it)} title={t("items.adjustStock")}>
                        <Sliders className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">{t("common.noData")}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!adjust} onOpenChange={(o) => !o && setAdjust(null)}>
        {adjust && <AdjustDialog item={adjust} onDone={() => { setAdjust(null); qc.invalidateQueries({ queryKey: ["items"] }); }} />}
      </Dialog>
    </>
  );
}

function ItemDialog({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ sku: "", name: "", name_en: "", unit: "قطعة", is_service: false, sale_price: 0 });
  const save = useMutation({
    mutationFn: async () => {
      if (!f.sku || !f.name) throw new Error("SKU + name required");
      const { error } = await supabase.from("items").insert(f as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("common.save")); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{t("items.newItem")}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t("items.sku")}</Label><Input value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} /></div>
          <div><Label>{t("items.unit")}</Label><Input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></div>
        </div>
        <div><Label>{t("common.name")} (AR)</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><Label>{t("common.name")} (EN)</Label><Input value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} /></div>
        <div><Label>{t("items.salePrice")}</Label><NumberInput value={f.sale_price} onChange={(n) => setF({ ...f, sale_price: n })} /></div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={f.is_service} onCheckedChange={(v) => setF({ ...f, is_service: !!v })} />
          {t("items.isService")}
        </label>
      </div>
      <DialogFooter>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{t("common.save")}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function AdjustDialog({ item, onDone }: { item: any; onDone: () => void }) {
  const { t } = useTranslation();
  const [direction, setDirection] = useState<"in" | "out" | "adjust">("in");
  const [qty, setQty] = useState(0);
  const [unitCost, setUnitCost] = useState(item.average_cost || 0);
  const [notes, setNotes] = useState("");
  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await supabase.from("branches").select("id, name").eq("is_active", true)).data ?? [],
  });
  const [branchId, setBranchId] = useState<string>("");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("record_stock_adjustment" as any, {
        _item_id: item.id,
        _branch_id: branchId || branches.data?.[0]?.id,
        _direction: direction,
        _qty: qty,
        _unit_cost: unitCost,
        _notes: notes || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("common.save")); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{t("items.adjustStock")} — {item.name}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div>
          <Label>{t("items.direction")}</Label>
          <Select value={direction} onValueChange={(v) => setDirection(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="in">{t("items.in")}</SelectItem>
              <SelectItem value="out">{t("items.out")}</SelectItem>
              <SelectItem value="adjust">{t("items.adjust")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t("common.branch")}</Label>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger><SelectValue placeholder={branches.data?.[0]?.name ?? "—"} /></SelectTrigger>
            <SelectContent>{(branches.data ?? []).map((b: any) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{direction === "adjust" ? t("items.onHand") : t("invoice.qty")}</Label>
            <NumberInput value={qty} onChange={setQty} />
          </div>
          <div>
            <Label>{direction === "out" ? t("items.averageCost") : t("invoice.unitPrice")}</Label>
            <NumberInput value={unitCost} onChange={setUnitCost} disabled={direction === "out"} />
          </div>
        </div>
        <div><Label>{t("invoice.notes")}</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      <DialogFooter>
        <Button onClick={() => save.mutate()} disabled={save.isPending || qty <= 0}>{t("common.save")}</Button>
      </DialogFooter>
    </DialogContent>
  );
}