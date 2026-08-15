
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles   ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

DO $mig$
DECLARE cid uuid; oid uuid;
BEGIN
  SELECT id INTO oid FROM auth.users ORDER BY created_at LIMIT 1;
  INSERT INTO public.companies (name, owner_id) VALUES ('شركتي', oid) RETURNING id INTO cid;
  UPDATE public.profiles   SET company_id = cid WHERE company_id IS NULL;
  UPDATE public.user_roles SET company_id = cid WHERE company_id IS NULL;
END $mig$;

CREATE OR REPLACE FUNCTION public.current_company()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

ALTER TABLE public.accounts            ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.branches            ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.items               ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.parties             ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.journal_entries     ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.sales_invoices      ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_invoices   ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.payments            ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.stock_movements     ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.document_sequences  ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.exchange_rates      ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.audit_log           ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

DO $bf$
DECLARE cid uuid; t text;
BEGIN
  SELECT id INTO cid FROM public.companies ORDER BY created_at LIMIT 1;
  ALTER TABLE public.journal_entries   DISABLE TRIGGER je_prevent_posted;
  ALTER TABLE public.sales_invoices    DISABLE TRIGGER si_prevent_posted;
  ALTER TABLE public.purchase_invoices DISABLE TRIGGER pi_prevent_posted;
  ALTER TABLE public.payments          DISABLE TRIGGER pay_prevent_posted;
  FOREACH t IN ARRAY ARRAY['accounts','branches','items','parties','journal_entries','sales_invoices','purchase_invoices','payments','stock_movements','document_sequences','exchange_rates','audit_log'] LOOP
    EXECUTE format('UPDATE public.%I SET company_id = %L WHERE company_id IS NULL', t, cid);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL, ALTER COLUMN company_id SET DEFAULT public.current_company()', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (company_id)', t||'_company_idx', t);
  END LOOP;
  ALTER TABLE public.journal_entries   ENABLE TRIGGER je_prevent_posted;
  ALTER TABLE public.sales_invoices    ENABLE TRIGGER si_prevent_posted;
  ALTER TABLE public.purchase_invoices ENABLE TRIGGER pi_prevent_posted;
  ALTER TABLE public.payments          ENABLE TRIGGER pay_prevent_posted;
END $bf$;

ALTER TABLE public.profiles   ALTER COLUMN company_id SET DEFAULT public.current_company();
ALTER TABLE public.user_roles ALTER COLUMN company_id SET DEFAULT public.current_company();

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_company_code_key ON public.accounts (company_id, code);
ALTER TABLE public.branches DROP CONSTRAINT IF EXISTS branches_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS branches_company_code_key ON public.branches (company_id, code);
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_sku_key;
CREATE UNIQUE INDEX IF NOT EXISTS items_company_sku_key ON public.items (company_id, sku);

CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE DEFAULT public.current_company(),
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'accountant',
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX invitations_pending_key ON public.invitations (company_id, lower(email)) WHERE status = 'pending';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER invitations_updated BEFORE UPDATE ON public.invitations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE inv public.invitations; cid uuid; r public.app_role;
BEGIN
  SELECT * INTO inv FROM public.invitations
   WHERE lower(email) = lower(NEW.email) AND status = 'pending'
   ORDER BY created_at LIMIT 1;

  IF inv.id IS NOT NULL THEN
    cid := inv.company_id;
    r := inv.role;
    UPDATE public.invitations SET status = 'accepted', accepted_at = now() WHERE id = inv.id;
  ELSE
    INSERT INTO public.companies (name, owner_id)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'company_name', 'شركة ' || COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)), NEW.id)
    RETURNING id INTO cid;
    r := 'admin';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, company_id)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), cid)
  ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id;

  INSERT INTO public.user_roles (user_id, role, company_id) VALUES (NEW.id, r, cid)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $fn$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.can_write(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','accountant'));
$$;

CREATE OR REPLACE FUNCTION public.can_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','manager'));
$$;

GRANT EXECUTE ON FUNCTION public.can_write(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company() TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_purchase_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_stock_adjustment(uuid, uuid, public.stock_direction, numeric, numeric, text) TO authenticated;

DO $pol$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','branches','items','parties','journal_entries','journal_lines','sales_invoices','sales_invoice_lines','purchase_invoices','purchase_invoice_lines','payments','stock_movements','document_sequences','exchange_rates','audit_log','profiles','user_roles'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $pol$;

DO $mk$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['items','parties','journal_entries','sales_invoices','purchase_invoices','payments','stock_movements'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (company_id = public.current_company() AND public.is_staff(auth.uid()))', t||'_tenant_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (company_id = public.current_company() AND public.can_write(auth.uid()))', t||'_tenant_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (company_id = public.current_company() AND public.can_write(auth.uid())) WITH CHECK (company_id = public.current_company())', t||'_tenant_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (company_id = public.current_company() AND public.can_write(auth.uid()))', t||'_tenant_delete', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['accounts','branches','exchange_rates','document_sequences'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (company_id = public.current_company() AND public.is_staff(auth.uid()))', t||'_tenant_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (company_id = public.current_company() AND public.can_admin(auth.uid()))', t||'_tenant_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (company_id = public.current_company() AND public.can_admin(auth.uid())) WITH CHECK (company_id = public.current_company())', t||'_tenant_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (company_id = public.current_company() AND public.can_admin(auth.uid()))', t||'_tenant_delete', t);
  END LOOP;
END $mk$;

CREATE POLICY journal_lines_tenant_all ON public.journal_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id = entry_id AND e.company_id = public.current_company()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id = entry_id AND e.company_id = public.current_company()) AND public.can_write(auth.uid()));

CREATE POLICY sales_invoice_lines_tenant_all ON public.sales_invoice_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales_invoices i WHERE i.id = invoice_id AND i.company_id = public.current_company()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales_invoices i WHERE i.id = invoice_id AND i.company_id = public.current_company()) AND public.can_write(auth.uid()));

CREATE POLICY purchase_invoice_lines_tenant_all ON public.purchase_invoice_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_invoices i WHERE i.id = invoice_id AND i.company_id = public.current_company()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_invoices i WHERE i.id = invoice_id AND i.company_id = public.current_company()) AND public.can_write(auth.uid()));

CREATE POLICY audit_tenant_read ON public.audit_log FOR SELECT TO authenticated
  USING (company_id = public.current_company() AND public.can_admin(auth.uid()));
CREATE POLICY audit_tenant_insert ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company() AND user_id = auth.uid());

CREATE POLICY profiles_tenant_select ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR company_id = public.current_company());
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_self_insert ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY user_roles_tenant_select ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR company_id = public.current_company());
CREATE POLICY user_roles_admin_manage ON public.user_roles FOR ALL TO authenticated
  USING (company_id = public.current_company() AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (company_id = public.current_company() AND public.has_role(auth.uid(),'admin'));

CREATE POLICY companies_member_select ON public.companies FOR SELECT TO authenticated
  USING (id = public.current_company());
CREATE POLICY companies_admin_update ON public.companies FOR UPDATE TO authenticated
  USING (id = public.current_company() AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (id = public.current_company());

CREATE POLICY invitations_admin_all ON public.invitations FOR ALL TO authenticated
  USING (company_id = public.current_company() AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (company_id = public.current_company() AND public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.post_payment(_payment_id uuid)
RETURNS public.payments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE p public.payments; je_id uuid; ar_account uuid; ap_account uuid;
BEGIN
  IF NOT public.can_write(auth.uid()) THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT * INTO p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF p.company_id <> public.current_company() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p.status = 'posted' THEN RAISE EXCEPTION 'Already posted'; END IF;

  SELECT id INTO ar_account FROM public.accounts WHERE code='1201' AND company_id = p.company_id;
  SELECT id INTO ap_account FROM public.accounts WHERE code='2101' AND company_id = p.company_id;

  INSERT INTO public.journal_entries (company_id, branch_id, entry_date, description, status, source_type, source_id, currency_code, created_by)
  VALUES (p.company_id, p.branch_id, p.payment_date, CASE p.direction WHEN 'receipt' THEN 'سند قبض' ELSE 'سند صرف' END, 'draft', 'payment', p.id, p.currency_code, auth.uid())
  RETURNING id INTO je_id;

  IF p.direction = 'receipt' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no)
    VALUES (je_id, p.cash_account_id, p.amount, 0, 1), (je_id, ar_account, 0, p.amount, 2);
  ELSE
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no)
    VALUES (je_id, ap_account, p.amount, 0, 1), (je_id, p.cash_account_id, 0, p.amount, 2);
  END IF;

  PERFORM public.post_journal_entry(je_id);

  IF p.payment_no IS NULL THEN
    UPDATE public.payments SET payment_no = CASE p.direction WHEN 'receipt' THEN 'RC-' ELSE 'PY-' END
      || public.next_doc_number(p.branch_id,'payment_'||p.direction::text) WHERE id = p.id;
  END IF;

  UPDATE public.payments SET status='posted', journal_entry_id = je_id WHERE id = p.id RETURNING * INTO p;
  RETURN p;
END; $fn$;

CREATE OR REPLACE FUNCTION public.post_sales_invoice(_invoice_id uuid)
RETURNS public.sales_invoices LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  inv public.sales_invoices; je_id uuid; cogs_je_id uuid;
  ar_account uuid; vat_account uuid; default_income uuid; inv_account uuid; cogs_account uuid;
  rec record; it public.items; line_cost numeric(18,2);
BEGIN
  IF NOT public.can_write(auth.uid()) THEN RAISE EXCEPTION 'ليست لديك الصلاحية / Insufficient permissions'; END IF;
  SELECT * INTO inv FROM public.sales_invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv.company_id <> public.current_company() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF inv.status = 'posted' THEN RAISE EXCEPTION 'الفاتورة مرحلة / Already posted'; END IF;
  IF inv.total <= 0 THEN RAISE EXCEPTION 'إجمالي الفاتورة صفر / Zero total'; END IF;

  SELECT id INTO ar_account     FROM public.accounts WHERE code='1201' AND company_id = inv.company_id;
  SELECT id INTO vat_account    FROM public.accounts WHERE code='2102' AND company_id = inv.company_id;
  SELECT id INTO default_income FROM public.accounts WHERE code='4001' AND company_id = inv.company_id;
  SELECT id INTO inv_account    FROM public.accounts WHERE code='1301' AND company_id = inv.company_id;
  SELECT id INTO cogs_account   FROM public.accounts WHERE code='5101' AND company_id = inv.company_id;

  INSERT INTO public.journal_entries (company_id, branch_id, entry_date, description, status, source_type, source_id, currency_code, created_by)
  VALUES (inv.company_id, inv.branch_id, inv.invoice_date, 'فاتورة مبيعات ' || COALESCE(inv.invoice_no,''), 'draft', 'sales_invoice', inv.id, inv.currency_code, auth.uid())
  RETURNING id INTO je_id;

  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, description, line_no)
  VALUES (je_id, ar_account, inv.total, 0, 'ذمم العميل', 1);

  FOR rec IN SELECT COALESCE(sil.income_account_id, i.revenue_account_id, default_income) AS acc, SUM(sil.line_total) AS amt
             FROM public.sales_invoice_lines sil LEFT JOIN public.items i ON i.id = sil.item_id
             WHERE sil.invoice_id = inv.id GROUP BY 1 LOOP
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, description, line_no)
    VALUES (je_id, rec.acc, 0, rec.amt, 'مبيعات', 2);
  END LOOP;

  IF inv.tax > 0 THEN
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, description, line_no)
    VALUES (je_id, vat_account, 0, inv.tax, 'ضريبة القيمة المضافة', 3);
  END IF;

  PERFORM public.post_journal_entry(je_id);

  FOR rec IN SELECT sil.item_id, sil.qty FROM public.sales_invoice_lines sil
             JOIN public.items i ON i.id = sil.item_id
             WHERE sil.invoice_id = inv.id AND i.is_service = false LOOP
    SELECT * INTO it FROM public.items WHERE id = rec.item_id FOR UPDATE;
    IF rec.qty > it.quantity_on_hand THEN
      RAISE EXCEPTION 'رصيد الصنف % غير كافٍ (متاح % / مطلوب %)', it.name, it.quantity_on_hand, rec.qty;
    END IF;
    line_cost := round(rec.qty * it.average_cost, 2);

    IF line_cost > 0 THEN
      IF cogs_je_id IS NULL THEN
        INSERT INTO public.journal_entries (company_id, branch_id, entry_date, description, status, source_type, source_id, currency_code, created_by)
        VALUES (inv.company_id, inv.branch_id, inv.invoice_date, 'تكلفة البضاعة المباعة ' || COALESCE(inv.invoice_no,''), 'draft', 'sales_invoice_cogs', inv.id, inv.currency_code, auth.uid())
        RETURNING id INTO cogs_je_id;
      END IF;
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,description,line_no)
      VALUES (cogs_je_id, COALESCE(it.cogs_account_id,cogs_account), line_cost, 0, 'تكلفة ' || it.name, 1),
             (cogs_je_id, COALESCE(it.inventory_account_id,inv_account), 0, line_cost, 'صرف مخزون ' || it.name, 2);
    END IF;

    INSERT INTO public.stock_movements(company_id,item_id,branch_id,direction,qty,unit_cost,total_cost,movement_date,source_type,source_id,journal_entry_id,created_by)
    VALUES (inv.company_id, rec.item_id, inv.branch_id, 'out', rec.qty, it.average_cost, line_cost, inv.invoice_date, 'sales_invoice', inv.id, cogs_je_id, auth.uid());

    UPDATE public.items SET quantity_on_hand = quantity_on_hand - rec.qty WHERE id = rec.item_id;
  END LOOP;

  IF cogs_je_id IS NOT NULL THEN PERFORM public.post_journal_entry(cogs_je_id); END IF;

  IF inv.invoice_no IS NULL THEN
    UPDATE public.sales_invoices SET invoice_no = 'SI-' || public.next_doc_number(inv.branch_id,'sales_invoice') WHERE id = inv.id;
  END IF;

  UPDATE public.sales_invoices SET status='posted', journal_entry_id = je_id WHERE id = inv.id RETURNING * INTO inv;
  RETURN inv;
END; $fn$;

CREATE OR REPLACE FUNCTION public.post_purchase_invoice(_invoice_id uuid)
RETURNS public.purchase_invoices LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  inv public.purchase_invoices; je_id uuid;
  ap_account uuid; vat_account uuid; default_expense uuid; inv_account uuid;
  rec record; it public.items; new_qty numeric(18,4); new_avg numeric(18,4); line_cost numeric(18,2);
BEGIN
  IF NOT public.can_write(auth.uid()) THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT * INTO inv FROM public.purchase_invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv.company_id <> public.current_company() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF inv.status = 'posted' THEN RAISE EXCEPTION 'Already posted'; END IF;
  IF inv.total <= 0 THEN RAISE EXCEPTION 'Zero total'; END IF;

  SELECT id INTO ap_account      FROM public.accounts WHERE code='2101' AND company_id = inv.company_id;
  SELECT id INTO vat_account     FROM public.accounts WHERE code='2102' AND company_id = inv.company_id;
  SELECT id INTO default_expense FROM public.accounts WHERE code='5001' AND company_id = inv.company_id;
  SELECT id INTO inv_account     FROM public.accounts WHERE code='1301' AND company_id = inv.company_id;

  INSERT INTO public.journal_entries (company_id, branch_id, entry_date, description, status, source_type, source_id, currency_code, created_by)
  VALUES (inv.company_id, inv.branch_id, inv.invoice_date, 'فاتورة مشتريات ' || COALESCE(inv.invoice_no,''), 'draft', 'purchase_invoice', inv.id, inv.currency_code, auth.uid())
  RETURNING id INTO je_id;

  FOR rec IN
    SELECT CASE WHEN pil.item_id IS NOT NULL AND NOT COALESCE(i.is_service,false)
                THEN COALESCE(i.inventory_account_id, inv_account)
                ELSE COALESCE(pil.expense_account_id, i.expense_account_id, default_expense) END AS acc,
           SUM(pil.line_total) AS amt
    FROM public.purchase_invoice_lines pil LEFT JOIN public.items i ON i.id = pil.item_id
    WHERE pil.invoice_id = inv.id GROUP BY 1
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

  FOR rec IN SELECT pil.id, pil.item_id, pil.qty, pil.line_total
             FROM public.purchase_invoice_lines pil JOIN public.items i ON i.id = pil.item_id
             WHERE pil.invoice_id = inv.id AND i.is_service = false LOOP
    SELECT * INTO it FROM public.items WHERE id = rec.item_id FOR UPDATE;
    line_cost := rec.line_total;
    new_qty := it.quantity_on_hand + rec.qty;
    IF new_qty > 0 THEN
      new_avg := round(((it.quantity_on_hand * it.average_cost) + line_cost) / new_qty, 4);
    ELSE new_avg := it.average_cost; END IF;

    INSERT INTO public.stock_movements(company_id,item_id,branch_id,direction,qty,unit_cost,total_cost,movement_date,source_type,source_id,journal_entry_id,created_by)
    VALUES (inv.company_id, rec.item_id, inv.branch_id, 'in', rec.qty, round(line_cost/rec.qty,4), line_cost, inv.invoice_date, 'purchase_invoice', inv.id, je_id, auth.uid());

    UPDATE public.items SET quantity_on_hand = new_qty, average_cost = new_avg WHERE id = rec.item_id;
  END LOOP;

  IF inv.invoice_no IS NULL THEN
    UPDATE public.purchase_invoices SET invoice_no = 'PI-' || public.next_doc_number(inv.branch_id,'purchase_invoice') WHERE id = inv.id;
  END IF;

  UPDATE public.purchase_invoices SET status='posted', journal_entry_id = je_id WHERE id = inv.id RETURNING * INTO inv;
  RETURN inv;
END; $fn$;

CREATE OR REPLACE FUNCTION public.record_stock_adjustment(_item_id uuid, _branch_id uuid, _direction stock_direction, _qty numeric, _unit_cost numeric, _notes text)
RETURNS public.stock_movements LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  it public.items; mv public.stock_movements; je_id uuid;
  inv_acc uuid; cogs_acc uuid; adj_acc uuid; cid uuid;
  new_qty numeric(18,4); new_avg numeric(18,4); total numeric(18,2);
BEGIN
  IF NOT public.can_write(auth.uid()) THEN RAISE EXCEPTION 'ليست لديك الصلاحية / Insufficient permissions'; END IF;
  IF _qty <= 0 THEN RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر'; END IF;

  cid := public.current_company();
  SELECT * INTO it FROM public.items WHERE id = _item_id AND company_id = cid FOR UPDATE;
  IF it IS NULL THEN RAISE EXCEPTION 'الصنف غير موجود'; END IF;
  IF it.is_service THEN RAISE EXCEPTION 'لا يمكن إجراء حركة مخزنية على خدمة'; END IF;

  SELECT COALESCE(it.inventory_account_id, (SELECT id FROM public.accounts WHERE code='1301' AND company_id = cid)) INTO inv_acc;
  SELECT COALESCE(it.cogs_account_id,      (SELECT id FROM public.accounts WHERE code='5101' AND company_id = cid)) INTO cogs_acc;
  SELECT id INTO adj_acc FROM public.accounts WHERE code='5002' AND company_id = cid;

  total := round(_qty * _unit_cost, 2);

  IF _direction = 'in' THEN
    new_qty := it.quantity_on_hand + _qty;
    IF new_qty > 0 THEN new_avg := round(((it.quantity_on_hand * it.average_cost) + (_qty * _unit_cost)) / new_qty, 4);
    ELSE new_avg := it.average_cost; END IF;
  ELSIF _direction = 'out' THEN
    IF _qty > it.quantity_on_hand THEN RAISE EXCEPTION 'الكمية المطلوبة (%) أكبر من الرصيد (%)', _qty, it.quantity_on_hand; END IF;
    new_qty := it.quantity_on_hand - _qty; new_avg := it.average_cost;
    total := round(_qty * it.average_cost, 2);
  ELSE
    new_qty := _qty; new_avg := _unit_cost;
    total := round((new_qty * new_avg) - (it.quantity_on_hand * it.average_cost), 2);
  END IF;

  IF total <> 0 THEN
    INSERT INTO public.journal_entries (company_id, branch_id, entry_date, description, status, source_type, currency_code, created_by)
    VALUES (cid, _branch_id, CURRENT_DATE, COALESCE(_notes,'تسوية مخزون'), 'draft', 'stock_adjustment', 'YER', auth.uid())
    RETURNING id INTO je_id;

    IF _direction = 'in' THEN
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,line_no)
      VALUES (je_id, inv_acc, total, 0, 1), (je_id, adj_acc, 0, total, 2);
    ELSIF _direction = 'out' THEN
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,line_no)
      VALUES (je_id, cogs_acc, total, 0, 1), (je_id, inv_acc, 0, total, 2);
    ELSE
      IF total > 0 THEN
        INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,line_no)
        VALUES (je_id, inv_acc, total, 0, 1), (je_id, adj_acc, 0, total, 2);
      ELSE
        INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,line_no)
        VALUES (je_id, adj_acc, -total, 0, 1), (je_id, inv_acc, 0, -total, 2);
      END IF;
    END IF;

    PERFORM public.post_journal_entry(je_id);
  END IF;

  INSERT INTO public.stock_movements(company_id,item_id,branch_id,direction,qty,unit_cost,total_cost,source_type,journal_entry_id,notes,created_by)
  VALUES (cid,_item_id,_branch_id,_direction,_qty,
          CASE _direction WHEN 'out' THEN it.average_cost WHEN 'adjust' THEN new_avg ELSE _unit_cost END,
          ABS(total), 'manual', je_id, _notes, auth.uid())
  RETURNING * INTO mv;

  UPDATE public.items SET quantity_on_hand = new_qty, average_cost = new_avg WHERE id = _item_id;
  RETURN mv;
END; $fn$;

CREATE OR REPLACE FUNCTION public.seed_company(_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.accounts WHERE company_id = _company_id) THEN RETURN; END IF;

  INSERT INTO public.branches (company_id, code, name, name_en, is_active)
  VALUES (_company_id, 'MAIN', 'الفرع الرئيسي', 'Main Branch', true);

  INSERT INTO public.accounts (company_id, code, name, name_en, type, is_group, currency_code, is_active) VALUES
    (_company_id,'1000','الأصول','Assets','asset',true,'YER',true),
    (_company_id,'1101','الصندوق','Cash','asset',false,'YER',true),
    (_company_id,'1102','البنك','Bank','asset',false,'YER',true),
    (_company_id,'1201','ذمم العملاء','Accounts Receivable','asset',false,'YER',true),
    (_company_id,'1301','المخزون','Inventory','asset',false,'YER',true),
    (_company_id,'2000','الخصوم','Liabilities','liability',true,'YER',true),
    (_company_id,'2101','ذمم الموردين','Accounts Payable','liability',false,'YER',true),
    (_company_id,'2102','ضريبة القيمة المضافة','VAT Payable','liability',false,'YER',true),
    (_company_id,'3000','حقوق الملكية','Equity','equity',true,'YER',true),
    (_company_id,'3101','رأس المال','Capital','equity',false,'YER',true),
    (_company_id,'4000','الإيرادات','Income','income',true,'YER',true),
    (_company_id,'4001','إيرادات المبيعات','Sales Revenue','income',false,'YER',true),
    (_company_id,'5000','المصروفات','Expenses','expense',true,'YER',true),
    (_company_id,'5001','مصروفات عامة','General Expenses','expense',false,'YER',true),
    (_company_id,'5002','مصروفات متنوعة','Misc Expenses','expense',false,'YER',true),
    (_company_id,'5101','تكلفة البضاعة المباعة','COGS','expense',false,'YER',true);

  UPDATE public.accounts c SET parent_id = p.id
  FROM public.accounts p
  WHERE c.company_id = _company_id AND p.company_id = _company_id AND p.is_group
    AND left(c.code,1) = left(p.code,1) AND NOT c.is_group;
END; $fn$;

GRANT EXECUTE ON FUNCTION public.seed_company(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.companies_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.seed_company(NEW.id);
  RETURN NEW;
END; $fn$;

CREATE TRIGGER companies_seed AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.companies_after_insert();
