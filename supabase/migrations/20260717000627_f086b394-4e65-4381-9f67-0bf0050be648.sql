
-- Accounts: Inventory + COGS
INSERT INTO public.accounts (code, name, name_en, type, parent_id, is_group, currency_code) VALUES
  ('13','المخزون','Inventory','asset',(SELECT id FROM public.accounts WHERE code='1'),true,'YER'),
  ('1301','المخزون','Inventory','asset',(SELECT id FROM public.accounts WHERE code='13'),false,'YER'),
  ('51','تكلفة المبيعات','Cost of Sales','expense',(SELECT id FROM public.accounts WHERE code='5'),true,'YER'),
  ('5101','تكلفة البضاعة المباعة','Cost of Goods Sold','expense',(SELECT id FROM public.accounts WHERE code='51'),false,'YER')
ON CONFLICT (code) DO NOTHING;

-- Items
CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  name_en text,
  unit text NOT NULL DEFAULT 'قطعة',
  is_service boolean NOT NULL DEFAULT false,
  sale_price numeric(18,4) NOT NULL DEFAULT 0,
  average_cost numeric(18,4) NOT NULL DEFAULT 0,
  quantity_on_hand numeric(18,4) NOT NULL DEFAULT 0,
  inventory_account_id uuid REFERENCES public.accounts(id),
  cogs_account_id uuid REFERENCES public.accounts(id),
  revenue_account_id uuid REFERENCES public.accounts(id),
  expense_account_id uuid REFERENCES public.accounts(id),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY items_read ON public.items FOR SELECT TO authenticated USING (true);
CREATE POLICY items_write ON public.items TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));
CREATE TRIGGER items_updated BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Stock movements
CREATE TYPE public.stock_direction AS ENUM ('in','out','adjust');
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  branch_id uuid REFERENCES public.branches(id),
  direction public.stock_direction NOT NULL,
  qty numeric(18,4) NOT NULL,
  unit_cost numeric(18,4) NOT NULL DEFAULT 0,
  total_cost numeric(18,2) NOT NULL DEFAULT 0,
  movement_date date NOT NULL DEFAULT CURRENT_DATE,
  source_type text,
  source_id uuid,
  journal_entry_id uuid REFERENCES public.journal_entries(id),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_movements_item ON public.stock_movements(item_id);
CREATE INDEX idx_stock_movements_date ON public.stock_movements(movement_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY sm_read ON public.stock_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY sm_write ON public.stock_movements TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));

-- Invoice lines: link to items
ALTER TABLE public.sales_invoice_lines ADD COLUMN item_id uuid REFERENCES public.items(id);
ALTER TABLE public.purchase_invoice_lines ADD COLUMN item_id uuid REFERENCES public.items(id);

-- Manual stock adjustment: writes JE + movement, updates avg cost
CREATE OR REPLACE FUNCTION public.record_stock_adjustment(
  _item_id uuid, _branch_id uuid, _direction public.stock_direction,
  _qty numeric, _unit_cost numeric, _notes text
) RETURNS public.stock_movements
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  it public.items;
  mv public.stock_movements;
  je_id uuid;
  inv_acc uuid;
  cogs_acc uuid;
  adj_acc uuid;
  new_qty numeric(18,4);
  new_avg numeric(18,4);
  total numeric(18,2);
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant')) THEN
    RAISE EXCEPTION 'ليست لديك الصلاحية / Insufficient permissions';
  END IF;
  IF _qty <= 0 THEN RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر'; END IF;

  SELECT * INTO it FROM public.items WHERE id = _item_id FOR UPDATE;
  IF it IS NULL THEN RAISE EXCEPTION 'الصنف غير موجود'; END IF;
  IF it.is_service THEN RAISE EXCEPTION 'لا يمكن إجراء حركة مخزنية على خدمة'; END IF;

  SELECT COALESCE(it.inventory_account_id, (SELECT id FROM public.accounts WHERE code='1301')) INTO inv_acc;
  SELECT COALESCE(it.cogs_account_id,      (SELECT id FROM public.accounts WHERE code='5101')) INTO cogs_acc;
  SELECT id INTO adj_acc FROM public.accounts WHERE code='5002'; -- misc expense for adjustments

  total := round(_qty * _unit_cost, 2);

  IF _direction = 'in' THEN
    new_qty := it.quantity_on_hand + _qty;
    IF new_qty > 0 THEN
      new_avg := round(((it.quantity_on_hand * it.average_cost) + (_qty * _unit_cost)) / new_qty, 4);
    ELSE new_avg := it.average_cost; END IF;
  ELSIF _direction = 'out' THEN
    IF _qty > it.quantity_on_hand THEN
      RAISE EXCEPTION 'الكمية المطلوبة (%) أكبر من الرصيد (%)', _qty, it.quantity_on_hand;
    END IF;
    new_qty := it.quantity_on_hand - _qty;
    new_avg := it.average_cost;
    total   := round(_qty * it.average_cost, 2);
  ELSE -- adjust: unit_cost may be new absolute avg
    new_qty := _qty;
    new_avg := _unit_cost;
    total   := round((new_qty * new_avg) - (it.quantity_on_hand * it.average_cost), 2);
  END IF;

  -- Journal entry (only if has monetary impact)
  IF total <> 0 THEN
    INSERT INTO public.journal_entries (branch_id, entry_date, description, status, source_type, currency_code, created_by)
    VALUES (_branch_id, CURRENT_DATE, COALESCE(_notes,'تسوية مخزون'), 'draft', 'stock_adjustment', 'YER', auth.uid())
    RETURNING id INTO je_id;

    IF _direction = 'in' THEN
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,line_no)
      VALUES (je_id, inv_acc, total, 0, 1),
             (je_id, adj_acc, 0, total, 2);
    ELSIF _direction = 'out' THEN
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,line_no)
      VALUES (je_id, cogs_acc, total, 0, 1),
             (je_id, inv_acc, 0, total, 2);
    ELSE
      IF total > 0 THEN
        INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,line_no)
        VALUES (je_id, inv_acc, total, 0, 1),
               (je_id, adj_acc, 0, total, 2);
      ELSE
        INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,line_no)
        VALUES (je_id, adj_acc, -total, 0, 1),
               (je_id, inv_acc, 0, -total, 2);
      END IF;
    END IF;

    PERFORM public.post_journal_entry(je_id);
  END IF;

  INSERT INTO public.stock_movements(item_id,branch_id,direction,qty,unit_cost,total_cost,source_type,journal_entry_id,notes,created_by)
  VALUES (_item_id,_branch_id,_direction,_qty,
          CASE _direction WHEN 'out' THEN it.average_cost WHEN 'adjust' THEN new_avg ELSE _unit_cost END,
          ABS(total), 'manual', je_id, _notes, auth.uid())
  RETURNING * INTO mv;

  UPDATE public.items SET quantity_on_hand = new_qty, average_cost = new_avg WHERE id = _item_id;
  RETURN mv;
END; $$;

-- Replace post_purchase_invoice: route inventory items to Inventory account, record stock_in, update avg cost
CREATE OR REPLACE FUNCTION public.post_purchase_invoice(_invoice_id uuid)
 RETURNS purchase_invoices
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  inv public.purchase_invoices;
  je_id uuid;
  ap_account uuid;
  vat_account uuid;
  default_expense uuid;
  inv_account uuid;
  rec record;
  it public.items;
  new_qty numeric(18,4);
  new_avg numeric(18,4);
  line_cost numeric(18,2);
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO inv FROM public.purchase_invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv.status = 'posted' THEN RAISE EXCEPTION 'Already posted'; END IF;
  IF inv.total <= 0 THEN RAISE EXCEPTION 'Zero total'; END IF;

  SELECT id INTO ap_account      FROM public.accounts WHERE code='2101';
  SELECT id INTO vat_account     FROM public.accounts WHERE code='2102';
  SELECT id INTO default_expense FROM public.accounts WHERE code='5001';
  SELECT id INTO inv_account     FROM public.accounts WHERE code='1301';

  INSERT INTO public.journal_entries (branch_id, entry_date, description, status, source_type, source_id, currency_code, created_by)
  VALUES (inv.branch_id, inv.invoice_date, 'فاتورة مشتريات ' || COALESCE(inv.invoice_no,''), 'draft', 'purchase_invoice', inv.id, inv.currency_code, auth.uid())
  RETURNING id INTO je_id;

  -- Group debits by resolved account (inventory for items, expense otherwise)
  FOR rec IN
    SELECT CASE
             WHEN pil.item_id IS NOT NULL AND NOT COALESCE(i.is_service,false)
               THEN COALESCE(i.inventory_account_id, inv_account)
             ELSE COALESCE(pil.expense_account_id, i.expense_account_id, default_expense)
           END AS acc,
           SUM(pil.line_total) AS amt
    FROM public.purchase_invoice_lines pil
    LEFT JOIN public.items i ON i.id = pil.item_id
    WHERE pil.invoice_id = inv.id
    GROUP BY 1
  LOOP
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, description, line_no)
    VALUES (je_id, rec.acc, rec.amt, 0, 'مشتريات', 1);
  END LOOP;

  IF inv.tax > 0 THEN
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, description, line_no)
    VALUES (je_id, vat_account, inv.tax, 0, 'ضريبة القيمة المضافة', 2);
  END IF;

  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, description, line_no)
  VALUES (je_id, ap_account, 0, inv.total, 'ذمم المورد', 3);

  PERFORM public.post_journal_entry(je_id);

  -- Record stock movements and update average cost for inventory-item lines
  FOR rec IN
    SELECT pil.id, pil.item_id, pil.qty, pil.line_total
    FROM public.purchase_invoice_lines pil
    JOIN public.items i ON i.id = pil.item_id
    WHERE pil.invoice_id = inv.id AND i.is_service = false
  LOOP
    SELECT * INTO it FROM public.items WHERE id = rec.item_id FOR UPDATE;
    line_cost := rec.line_total;
    new_qty := it.quantity_on_hand + rec.qty;
    IF new_qty > 0 THEN
      new_avg := round(((it.quantity_on_hand * it.average_cost) + line_cost) / new_qty, 4);
    ELSE new_avg := it.average_cost; END IF;

    INSERT INTO public.stock_movements(item_id,branch_id,direction,qty,unit_cost,total_cost,movement_date,source_type,source_id,journal_entry_id,created_by)
    VALUES (rec.item_id, inv.branch_id, 'in', rec.qty, round(line_cost/rec.qty,4), line_cost, inv.invoice_date, 'purchase_invoice', inv.id, je_id, auth.uid());

    UPDATE public.items SET quantity_on_hand = new_qty, average_cost = new_avg WHERE id = rec.item_id;
  END LOOP;

  IF inv.invoice_no IS NULL THEN
    UPDATE public.purchase_invoices SET invoice_no = 'PI-' || public.next_doc_number(inv.branch_id,'purchase_invoice')
    WHERE id = inv.id;
  END IF;

  UPDATE public.purchase_invoices SET status='posted', journal_entry_id = je_id
  WHERE id = inv.id RETURNING * INTO inv;
  RETURN inv;
END; $$;

-- Replace post_sales_invoice: after AR/revenue JE, create COGS JE and stock_out for inventory items
CREATE OR REPLACE FUNCTION public.post_sales_invoice(_invoice_id uuid)
 RETURNS sales_invoices
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  inv public.sales_invoices;
  je_id uuid;
  cogs_je_id uuid;
  ar_account uuid;
  vat_account uuid;
  default_income uuid;
  inv_account uuid;
  cogs_account uuid;
  rec record;
  it public.items;
  total_cogs numeric(18,2) := 0;
  line_cost numeric(18,2);
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant')) THEN
    RAISE EXCEPTION 'ليست لديك الصلاحية / Insufficient permissions';
  END IF;

  SELECT * INTO inv FROM public.sales_invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv.status = 'posted' THEN RAISE EXCEPTION 'الفاتورة مرحلة / Already posted'; END IF;
  IF inv.total <= 0 THEN RAISE EXCEPTION 'إجمالي الفاتورة صفر / Zero total'; END IF;

  SELECT id INTO ar_account     FROM public.accounts WHERE code='1201';
  SELECT id INTO vat_account    FROM public.accounts WHERE code='2102';
  SELECT id INTO default_income FROM public.accounts WHERE code='4001';
  SELECT id INTO inv_account    FROM public.accounts WHERE code='1301';
  SELECT id INTO cogs_account   FROM public.accounts WHERE code='5101';

  INSERT INTO public.journal_entries (branch_id, entry_date, description, status, source_type, source_id, currency_code, created_by)
  VALUES (inv.branch_id, inv.invoice_date, 'فاتورة مبيعات ' || COALESCE(inv.invoice_no,''), 'draft', 'sales_invoice', inv.id, inv.currency_code, auth.uid())
  RETURNING id INTO je_id;

  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, description, line_no)
  VALUES (je_id, ar_account, inv.total, 0, 'ذمم العميل', 1);

  FOR rec IN SELECT COALESCE(sil.income_account_id, i.revenue_account_id, default_income) AS acc, SUM(sil.line_total) AS amt
             FROM public.sales_invoice_lines sil
             LEFT JOIN public.items i ON i.id = sil.item_id
             WHERE sil.invoice_id = inv.id
             GROUP BY 1 LOOP
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, description, line_no)
    VALUES (je_id, rec.acc, 0, rec.amt, 'مبيعات', 2);
  END LOOP;

  IF inv.tax > 0 THEN
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, description, line_no)
    VALUES (je_id, vat_account, 0, inv.tax, 'ضريبة القيمة المضافة', 3);
  END IF;

  PERFORM public.post_journal_entry(je_id);

  -- COGS side for inventory items
  FOR rec IN
    SELECT sil.item_id, sil.qty
    FROM public.sales_invoice_lines sil
    JOIN public.items i ON i.id = sil.item_id
    WHERE sil.invoice_id = inv.id AND i.is_service = false
  LOOP
    SELECT * INTO it FROM public.items WHERE id = rec.item_id FOR UPDATE;
    IF rec.qty > it.quantity_on_hand THEN
      RAISE EXCEPTION 'رصيد الصنف % غير كافٍ (متاح % / مطلوب %)', it.name, it.quantity_on_hand, rec.qty;
    END IF;
    line_cost := round(rec.qty * it.average_cost, 2);
    total_cogs := total_cogs + line_cost;

    IF line_cost > 0 THEN
      IF cogs_je_id IS NULL THEN
        INSERT INTO public.journal_entries (branch_id, entry_date, description, status, source_type, source_id, currency_code, created_by)
        VALUES (inv.branch_id, inv.invoice_date, 'تكلفة البضاعة المباعة ' || COALESCE(inv.invoice_no,''), 'draft', 'sales_invoice_cogs', inv.id, inv.currency_code, auth.uid())
        RETURNING id INTO cogs_je_id;
      END IF;

      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,description,line_no)
      VALUES (cogs_je_id, COALESCE(it.cogs_account_id,cogs_account), line_cost, 0, 'تكلفة ' || it.name, 1),
             (cogs_je_id, COALESCE(it.inventory_account_id,inv_account), 0, line_cost, 'صرف مخزون ' || it.name, 2);
    END IF;

    INSERT INTO public.stock_movements(item_id,branch_id,direction,qty,unit_cost,total_cost,movement_date,source_type,source_id,journal_entry_id,created_by)
    VALUES (rec.item_id, inv.branch_id, 'out', rec.qty, it.average_cost, line_cost, inv.invoice_date, 'sales_invoice', inv.id, cogs_je_id, auth.uid());

    UPDATE public.items SET quantity_on_hand = quantity_on_hand - rec.qty WHERE id = rec.item_id;
  END LOOP;

  IF cogs_je_id IS NOT NULL THEN
    PERFORM public.post_journal_entry(cogs_je_id);
  END IF;

  IF inv.invoice_no IS NULL THEN
    UPDATE public.sales_invoices SET invoice_no = 'SI-' || public.next_doc_number(inv.branch_id,'sales_invoice')
    WHERE id = inv.id;
  END IF;

  UPDATE public.sales_invoices SET status='posted', journal_entry_id = je_id
  WHERE id = inv.id RETURNING * INTO inv;
  RETURN inv;
END; $$;
