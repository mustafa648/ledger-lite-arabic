
-- Relax write policies so any authenticated user can write; keep RLS enabled.
-- Also switch default new-user role from 'viewer' to 'accountant' so signups can write.

-- Update handle_new_user to give new (non-first) users the 'accountant' role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE user_count int;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'accountant')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

-- Backfill any auth users missing a profile/role
INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id,
  CASE WHEN NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role='admin') AND u.id = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1)
       THEN 'admin'::app_role ELSE 'accountant'::app_role END
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id
WHERE r.user_id IS NULL;

-- Relax write policies: allow any authenticated user
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'accounts','branches','currencies','exchange_rates','items','journal_entries',
    'journal_lines','parties','payments','purchase_invoice_lines','purchase_invoices',
    'sales_invoice_lines','sales_invoices','stock_movements'
  ];
  write_policies text[] := ARRAY[
    'accounts_write','branches_admin_write','currencies_admin_write','fx_write','items_write',
    'je_write','jl_write','parties_write','pay_write','pil_write','pi_write',
    'sil_write','si_write','sm_write'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- drop any existing ALL/write policy for this table
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
  END LOOP;
  -- drop by known policy names too
  EXECUTE 'DROP POLICY IF EXISTS accounts_write ON public.accounts';
  EXECUTE 'DROP POLICY IF EXISTS branches_admin_write ON public.branches';
  EXECUTE 'DROP POLICY IF EXISTS currencies_admin_write ON public.currencies';
  EXECUTE 'DROP POLICY IF EXISTS fx_write ON public.exchange_rates';
  EXECUTE 'DROP POLICY IF EXISTS items_write ON public.items';
  EXECUTE 'DROP POLICY IF EXISTS je_write ON public.journal_entries';
  EXECUTE 'DROP POLICY IF EXISTS jl_write ON public.journal_lines';
  EXECUTE 'DROP POLICY IF EXISTS parties_write ON public.parties';
  EXECUTE 'DROP POLICY IF EXISTS pay_write ON public.payments';
  EXECUTE 'DROP POLICY IF EXISTS pil_write ON public.purchase_invoice_lines';
  EXECUTE 'DROP POLICY IF EXISTS pi_write ON public.purchase_invoices';
  EXECUTE 'DROP POLICY IF EXISTS sil_write ON public.sales_invoice_lines';
  EXECUTE 'DROP POLICY IF EXISTS si_write ON public.sales_invoices';
  EXECUTE 'DROP POLICY IF EXISTS sm_write ON public.stock_movements';

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t || '_authenticated_all', t
    );
  END LOOP;
END $$;

-- Also relax the has_role checks in RPCs is not needed since RPCs are SECURITY DEFINER,
-- but they gate on has_role. Update has_role guard tables to be permissive:
CREATE OR REPLACE FUNCTION public.post_journal_entry(_entry_id uuid)
RETURNS journal_entries LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  je public.journal_entries;
  total_debit numeric(18,2);
  total_credit numeric(18,2);
  line_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
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
END; $$;
