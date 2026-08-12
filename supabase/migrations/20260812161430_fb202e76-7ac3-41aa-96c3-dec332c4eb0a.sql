-- Helper role predicates
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

-- Drop permissive policies
DROP POLICY IF EXISTS accounts_read ON public.accounts;
DROP POLICY IF EXISTS accounts_authenticated_all ON public.accounts;
DROP POLICY IF EXISTS branches_read ON public.branches;
DROP POLICY IF EXISTS branches_authenticated_all ON public.branches;
DROP POLICY IF EXISTS currencies_read ON public.currencies;
DROP POLICY IF EXISTS currencies_authenticated_all ON public.currencies;
DROP POLICY IF EXISTS docseq_read ON public.document_sequences;
DROP POLICY IF EXISTS fx_read ON public.exchange_rates;
DROP POLICY IF EXISTS exchange_rates_authenticated_all ON public.exchange_rates;
DROP POLICY IF EXISTS items_read ON public.items;
DROP POLICY IF EXISTS items_authenticated_all ON public.items;
DROP POLICY IF EXISTS je_read ON public.journal_entries;
DROP POLICY IF EXISTS journal_entries_authenticated_all ON public.journal_entries;
DROP POLICY IF EXISTS jl_read ON public.journal_lines;
DROP POLICY IF EXISTS journal_lines_authenticated_all ON public.journal_lines;
DROP POLICY IF EXISTS parties_read ON public.parties;
DROP POLICY IF EXISTS parties_authenticated_all ON public.parties;
DROP POLICY IF EXISTS pay_read ON public.payments;
DROP POLICY IF EXISTS payments_authenticated_all ON public.payments;
DROP POLICY IF EXISTS pil_read ON public.purchase_invoice_lines;
DROP POLICY IF EXISTS purchase_invoice_lines_authenticated_all ON public.purchase_invoice_lines;
DROP POLICY IF EXISTS pi_read ON public.purchase_invoices;
DROP POLICY IF EXISTS purchase_invoices_authenticated_all ON public.purchase_invoices;
DROP POLICY IF EXISTS sil_read ON public.sales_invoice_lines;
DROP POLICY IF EXISTS sales_invoice_lines_authenticated_all ON public.sales_invoice_lines;
DROP POLICY IF EXISTS si_read ON public.sales_invoices;
DROP POLICY IF EXISTS sales_invoices_authenticated_all ON public.sales_invoices;
DROP POLICY IF EXISTS sm_read ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_authenticated_all ON public.stock_movements;
DROP POLICY IF EXISTS audit_insert ON public.audit_log;

-- Financial / operational tables: staff read, writer roles modify
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['journal_entries','journal_lines','sales_invoices','sales_invoice_lines',
                           'purchase_invoices','purchase_invoice_lines','payments','stock_movements',
                           'parties','items']
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_staff(auth.uid()))', t||'_staff_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()))', t||'_writer_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()))', t||'_writer_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.can_write(auth.uid()))', t||'_writer_delete', t);
  END LOOP;

  -- Reference/config tables: staff read, admin/manager modify
  FOREACH t IN ARRAY ARRAY['accounts','branches','currencies','exchange_rates','document_sequences']
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_staff(auth.uid()))', t||'_staff_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_admin(auth.uid()))', t||'_admin_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.can_admin(auth.uid())) WITH CHECK (public.can_admin(auth.uid()))', t||'_admin_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.can_admin(auth.uid()))', t||'_admin_delete', t);
  END LOOP;
END $$;

-- Audit log: only self-attributed inserts
CREATE POLICY audit_insert_self ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Restore role gates in posting routines
CREATE OR REPLACE FUNCTION public.post_journal_entry(_entry_id uuid)
 RETURNS journal_entries LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  je public.journal_entries;
  total_debit numeric(18,2);
  total_credit numeric(18,2);
  line_count int;
BEGIN
  IF NOT public.can_write(auth.uid()) THEN RAISE EXCEPTION 'ليست لديك الصلاحية / Insufficient permissions'; END IF;
  SELECT * INTO je FROM public.journal_entries WHERE id = _entry_id FOR UPDATE;
  IF je.status = 'posted' THEN RAISE EXCEPTION 'القيد مرحل بالفعل / Already posted'; END IF;
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0), COUNT(*)
    INTO total_debit, total_credit, line_count FROM public.journal_lines WHERE entry_id = _entry_id;
  IF line_count < 2 THEN RAISE EXCEPTION 'القيد يحتاج طرفين على الأقل / Need at least 2 lines'; END IF;
  IF total_debit <> total_credit OR total_debit = 0 THEN
    RAISE EXCEPTION 'القيد غير متوازن (مدين: % / دائن: %) / Not balanced', total_debit, total_credit;
  END IF;
  IF je.entry_no IS NULL THEN
    UPDATE public.journal_entries SET entry_no = 'JE-' || public.next_doc_number(je.branch_id,'journal') WHERE id = _entry_id;
  END IF;
  UPDATE public.journal_entries SET status = 'posted', posted_by = auth.uid(), posted_at = now()
  WHERE id = _entry_id RETURNING * INTO je;
  RETURN je;
END; $function$;

-- Lock down function execution
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_doc_number(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_posted_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_journal_entry(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_payment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_sales_invoice(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_purchase_invoice(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_stock_adjustment(uuid, uuid, stock_direction, numeric, numeric, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_purchase_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_stock_adjustment(uuid, uuid, stock_direction, numeric, numeric, text) TO authenticated;

-- Ensure anon has no table access on business tables
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;