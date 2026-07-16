
-- =========================================
-- ENUMS
-- =========================================
CREATE TYPE public.app_role AS ENUM ('admin','accountant','manager','viewer');
CREATE TYPE public.account_type AS ENUM ('asset','liability','equity','income','expense');
CREATE TYPE public.doc_status AS ENUM ('draft','posted','cancelled');
CREATE TYPE public.party_type AS ENUM ('customer','supplier','both');
CREATE TYPE public.payment_direction AS ENUM ('receipt','payment');

-- =========================================
-- HELPERS
-- =========================================
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =========================================
-- PROFILES
-- =========================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  locale text NOT NULL DEFAULT 'ar',
  theme text NOT NULL DEFAULT 'light',
  default_branch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_profile_select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own_profile_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "own_profile_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- USER ROLES
-- =========================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid()
  ORDER BY CASE role
    WHEN 'admin' THEN 1 WHEN 'accountant' THEN 2 WHEN 'manager' THEN 3 WHEN 'viewer' THEN 4 END
  LIMIT 1;
$$;

CREATE POLICY "own_roles_select" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin_manage_roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Auto-create profile + first admin
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count int;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  SELECT count(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================
-- BRANCHES
-- =========================================
CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  name_en text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "branches_read" ON public.branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "branches_admin_write" ON public.branches FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER branches_updated BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- CURRENCIES
-- =========================================
CREATE TABLE public.currencies (
  code text PRIMARY KEY,
  name text NOT NULL,
  name_en text,
  symbol text,
  is_base boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.currencies TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.currencies TO authenticated;
GRANT ALL ON public.currencies TO service_role;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "currencies_read" ON public.currencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "currencies_admin_write" ON public.currencies FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.currencies (code, name, name_en, symbol, is_base) VALUES
  ('YER','ريال يمني','Yemeni Rial','﷼', true),
  ('SAR','ريال سعودي','Saudi Riyal','﷼', false),
  ('USD','دولار أمريكي','US Dollar','$', false);

CREATE TABLE public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_code text NOT NULL REFERENCES public.currencies(code),
  to_code text NOT NULL REFERENCES public.currencies(code),
  rate numeric(18,6) NOT NULL CHECK (rate > 0),
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exchange_rates TO authenticated;
GRANT ALL ON public.exchange_rates TO service_role;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fx_read" ON public.exchange_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "fx_write" ON public.exchange_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));

-- Seed a default branch
INSERT INTO public.branches (code, name, name_en) VALUES ('MAIN','الفرع الرئيسي','Main Branch');

-- =========================================
-- CHART OF ACCOUNTS
-- =========================================
CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  name_en text,
  type public.account_type NOT NULL,
  parent_id uuid REFERENCES public.accounts(id) ON DELETE RESTRICT,
  is_group boolean NOT NULL DEFAULT false,
  currency_code text NOT NULL DEFAULT 'YER' REFERENCES public.currencies(code),
  is_active boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts_read" ON public.accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "accounts_write" ON public.accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));
CREATE TRIGGER accounts_updated BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed a basic chart
INSERT INTO public.accounts (code, name, name_en, type, is_group) VALUES
  ('1','الأصول','Assets','asset',true),
  ('2','الخصوم','Liabilities','liability',true),
  ('3','حقوق الملكية','Equity','equity',true),
  ('4','الإيرادات','Income','income',true),
  ('5','المصروفات','Expenses','expense',true);

INSERT INTO public.accounts (code, name, name_en, type, parent_id, is_group)
SELECT '11','النقدية والبنوك','Cash & Banks','asset',id,true FROM public.accounts WHERE code='1';
INSERT INTO public.accounts (code, name, name_en, type, parent_id)
SELECT '1101','الصندوق','Cash on Hand','asset',id FROM public.accounts WHERE code='11';
INSERT INTO public.accounts (code, name, name_en, type, parent_id)
SELECT '1102','البنك','Bank','asset',id FROM public.accounts WHERE code='11';
INSERT INTO public.accounts (code, name, name_en, type, parent_id, is_group)
SELECT '12','المدينون','Receivables','asset',id,true FROM public.accounts WHERE code='1';
INSERT INTO public.accounts (code, name, name_en, type, parent_id)
SELECT '1201','ذمم العملاء','Accounts Receivable','asset',id FROM public.accounts WHERE code='12';
INSERT INTO public.accounts (code, name, name_en, type, parent_id, is_group)
SELECT '21','الدائنون','Payables','liability',id,true FROM public.accounts WHERE code='2';
INSERT INTO public.accounts (code, name, name_en, type, parent_id)
SELECT '2101','ذمم الموردين','Accounts Payable','liability',id FROM public.accounts WHERE code='21';
INSERT INTO public.accounts (code, name, name_en, type, parent_id)
SELECT '2102','ضريبة القيمة المضافة','VAT Payable','liability',id FROM public.accounts WHERE code='21';
INSERT INTO public.accounts (code, name, name_en, type, parent_id)
SELECT '4001','مبيعات','Sales Revenue','income',id FROM public.accounts WHERE code='4';
INSERT INTO public.accounts (code, name, name_en, type, parent_id)
SELECT '5001','مشتريات','Purchases','expense',id FROM public.accounts WHERE code='5';
INSERT INTO public.accounts (code, name, name_en, type, parent_id)
SELECT '5002','مصروفات عامة','General Expenses','expense',id FROM public.accounts WHERE code='5';

-- =========================================
-- DOCUMENT SEQUENCES
-- =========================================
CREATE TABLE public.document_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  prefix text NOT NULL DEFAULT '',
  next_number integer NOT NULL DEFAULT 1,
  UNIQUE(branch_id, doc_type)
);
GRANT SELECT ON public.document_sequences TO authenticated;
GRANT ALL ON public.document_sequences TO service_role;
ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "docseq_read" ON public.document_sequences FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.next_doc_number(_branch_id uuid, _doc_type text, _prefix text DEFAULT '')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; p text;
BEGIN
  INSERT INTO public.document_sequences (branch_id, doc_type, prefix, next_number)
  VALUES (_branch_id, _doc_type, _prefix, 1)
  ON CONFLICT (branch_id, doc_type) DO NOTHING;

  UPDATE public.document_sequences
  SET next_number = next_number + 1
  WHERE branch_id = _branch_id AND doc_type = _doc_type
  RETURNING next_number - 1, prefix INTO n, p;

  RETURN COALESCE(p,'') || lpad(n::text, 6, '0');
END; $$;

-- =========================================
-- JOURNAL ENTRIES
-- =========================================
CREATE TABLE public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_no text UNIQUE,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  status public.doc_status NOT NULL DEFAULT 'draft',
  source_type text,
  source_id uuid,
  currency_code text NOT NULL DEFAULT 'YER' REFERENCES public.currencies(code),
  created_by uuid REFERENCES auth.users(id),
  posted_by uuid REFERENCES auth.users(id),
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "je_read" ON public.journal_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "je_write" ON public.journal_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));
CREATE TRIGGER je_updated BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id),
  debit numeric(18,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(18,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description text,
  line_no int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_jl_entry ON public.journal_lines(entry_id);
CREATE INDEX idx_jl_account ON public.journal_lines(account_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_lines TO authenticated;
GRANT ALL ON public.journal_lines TO service_role;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jl_read" ON public.journal_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "jl_write" ON public.journal_lines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));

-- Prevent modifying posted entries
CREATE OR REPLACE FUNCTION public.prevent_posted_change() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'posted' THEN
    RAISE EXCEPTION 'لا يمكن حذف قيد مرحل / Cannot delete posted entry';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'posted' AND NEW.status = 'posted' THEN
    RAISE EXCEPTION 'لا يمكن تعديل قيد مرحل / Cannot modify posted entry';
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END; $$;
CREATE TRIGGER je_prevent_posted BEFORE UPDATE OR DELETE ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.prevent_posted_change();

-- Post a journal entry (requires balanced lines)
CREATE OR REPLACE FUNCTION public.post_journal_entry(_entry_id uuid)
RETURNS public.journal_entries LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  je public.journal_entries;
  total_debit numeric(18,2);
  total_credit numeric(18,2);
  line_count int;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant')) THEN
    RAISE EXCEPTION 'ليست لديك الصلاحية / Insufficient permissions';
  END IF;

  SELECT * INTO je FROM public.journal_entries WHERE id = _entry_id FOR UPDATE;
  IF je.status = 'posted' THEN RAISE EXCEPTION 'القيد مرحل بالفعل / Already posted'; END IF;

  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0), COUNT(*)
    INTO total_debit, total_credit, line_count
  FROM public.journal_lines WHERE entry_id = _entry_id;

  IF line_count < 2 THEN RAISE EXCEPTION 'القيد يحتاج طرفين على الأقل / Need at least 2 lines'; END IF;
  IF total_debit <> total_credit OR total_debit = 0 THEN
    RAISE EXCEPTION 'القيد غير متوازن (مدين: % / دائن: %) / Not balanced', total_debit, total_credit;
  END IF;

  IF je.entry_no IS NULL THEN
    UPDATE public.journal_entries SET entry_no = 'JE-' || public.next_doc_number(je.branch_id,'journal')
    WHERE id = _entry_id;
  END IF;

  UPDATE public.journal_entries
  SET status = 'posted', posted_by = auth.uid(), posted_at = now()
  WHERE id = _entry_id
  RETURNING * INTO je;
  RETURN je;
END; $$;

-- =========================================
-- PARTIES (customers & suppliers)
-- =========================================
CREATE TABLE public.parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  name text NOT NULL,
  type public.party_type NOT NULL DEFAULT 'customer',
  tax_id text,
  phone text,
  email text,
  address text,
  currency_code text NOT NULL DEFAULT 'YER' REFERENCES public.currencies(code),
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parties TO authenticated;
GRANT ALL ON public.parties TO service_role;
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parties_read" ON public.parties FOR SELECT TO authenticated USING (true);
CREATE POLICY "parties_write" ON public.parties FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));
CREATE TRIGGER parties_updated BEFORE UPDATE ON public.parties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- SALES INVOICES
-- =========================================
CREATE TABLE public.sales_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text UNIQUE,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  customer_id uuid NOT NULL REFERENCES public.parties(id),
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  currency_code text NOT NULL DEFAULT 'YER' REFERENCES public.currencies(code),
  fx_rate numeric(18,6) NOT NULL DEFAULT 1,
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  tax numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL DEFAULT 0,
  paid_amount numeric(18,2) NOT NULL DEFAULT 0,
  notes text,
  status public.doc_status NOT NULL DEFAULT 'draft',
  journal_entry_id uuid REFERENCES public.journal_entries(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_invoices TO authenticated;
GRANT ALL ON public.sales_invoices TO service_role;
ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "si_read" ON public.sales_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "si_write" ON public.sales_invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));
CREATE TRIGGER si_updated BEFORE UPDATE ON public.sales_invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER si_prevent_posted BEFORE UPDATE OR DELETE ON public.sales_invoices
FOR EACH ROW EXECUTE FUNCTION public.prevent_posted_change();

CREATE TABLE public.sales_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  qty numeric(18,4) NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price numeric(18,4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  tax_rate numeric(6,3) NOT NULL DEFAULT 0,
  line_total numeric(18,2) NOT NULL DEFAULT 0,
  income_account_id uuid REFERENCES public.accounts(id),
  line_no int NOT NULL DEFAULT 1
);
CREATE INDEX idx_sil_invoice ON public.sales_invoice_lines(invoice_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_invoice_lines TO authenticated;
GRANT ALL ON public.sales_invoice_lines TO service_role;
ALTER TABLE public.sales_invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sil_read" ON public.sales_invoice_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "sil_write" ON public.sales_invoice_lines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));

-- =========================================
-- PURCHASE INVOICES
-- =========================================
CREATE TABLE public.purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text UNIQUE,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  supplier_id uuid NOT NULL REFERENCES public.parties(id),
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  supplier_reference text,
  currency_code text NOT NULL DEFAULT 'YER' REFERENCES public.currencies(code),
  fx_rate numeric(18,6) NOT NULL DEFAULT 1,
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  tax numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL DEFAULT 0,
  paid_amount numeric(18,2) NOT NULL DEFAULT 0,
  notes text,
  status public.doc_status NOT NULL DEFAULT 'draft',
  journal_entry_id uuid REFERENCES public.journal_entries(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_invoices TO authenticated;
GRANT ALL ON public.purchase_invoices TO service_role;
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pi_read" ON public.purchase_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "pi_write" ON public.purchase_invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));
CREATE TRIGGER pi_updated BEFORE UPDATE ON public.purchase_invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER pi_prevent_posted BEFORE UPDATE OR DELETE ON public.purchase_invoices
FOR EACH ROW EXECUTE FUNCTION public.prevent_posted_change();

CREATE TABLE public.purchase_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  qty numeric(18,4) NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price numeric(18,4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  tax_rate numeric(6,3) NOT NULL DEFAULT 0,
  line_total numeric(18,2) NOT NULL DEFAULT 0,
  expense_account_id uuid REFERENCES public.accounts(id),
  line_no int NOT NULL DEFAULT 1
);
CREATE INDEX idx_pil_invoice ON public.purchase_invoice_lines(invoice_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_invoice_lines TO authenticated;
GRANT ALL ON public.purchase_invoice_lines TO service_role;
ALTER TABLE public.purchase_invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pil_read" ON public.purchase_invoice_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "pil_write" ON public.purchase_invoice_lines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));

-- =========================================
-- PAYMENTS
-- =========================================
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_no text UNIQUE,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  party_id uuid NOT NULL REFERENCES public.parties(id),
  direction public.payment_direction NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency_code text NOT NULL DEFAULT 'YER' REFERENCES public.currencies(code),
  fx_rate numeric(18,6) NOT NULL DEFAULT 1,
  cash_account_id uuid NOT NULL REFERENCES public.accounts(id),
  method text,
  reference text,
  notes text,
  status public.doc_status NOT NULL DEFAULT 'draft',
  journal_entry_id uuid REFERENCES public.journal_entries(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pay_read" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "pay_write" ON public.payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));
CREATE TRIGGER pay_updated BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER pay_prevent_posted BEFORE UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.prevent_posted_change();

-- =========================================
-- AUDIT LOG
-- =========================================
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  table_name text NOT NULL,
  row_id uuid,
  data jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_admin_read" ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "audit_insert" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- =========================================
-- POST SALES INVOICE (creates JE)
-- =========================================
CREATE OR REPLACE FUNCTION public.post_sales_invoice(_invoice_id uuid)
RETURNS public.sales_invoices LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv public.sales_invoices;
  je_id uuid;
  ar_account uuid;
  vat_account uuid;
  default_income uuid;
  rec record;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant')) THEN
    RAISE EXCEPTION 'ليست لديك الصلاحية / Insufficient permissions';
  END IF;

  SELECT * INTO inv FROM public.sales_invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv.status = 'posted' THEN RAISE EXCEPTION 'الفاتورة مرحلة / Already posted'; END IF;
  IF inv.total <= 0 THEN RAISE EXCEPTION 'إجمالي الفاتورة صفر / Zero total'; END IF;

  SELECT id INTO ar_account FROM public.accounts WHERE code='1201';
  SELECT id INTO vat_account FROM public.accounts WHERE code='2102';
  SELECT id INTO default_income FROM public.accounts WHERE code='4001';

  INSERT INTO public.journal_entries (branch_id, entry_date, description, status, source_type, source_id, currency_code, created_by)
  VALUES (inv.branch_id, inv.invoice_date, 'فاتورة مبيعات ' || COALESCE(inv.invoice_no,''), 'draft', 'sales_invoice', inv.id, inv.currency_code, auth.uid())
  RETURNING id INTO je_id;

  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, description, line_no)
  VALUES (je_id, ar_account, inv.total, 0, 'ذمم العميل', 1);

  FOR rec IN SELECT COALESCE(income_account_id, default_income) AS acc, SUM(line_total) AS amt
             FROM public.sales_invoice_lines WHERE invoice_id = inv.id
             GROUP BY COALESCE(income_account_id, default_income) LOOP
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, description, line_no)
    VALUES (je_id, rec.acc, 0, rec.amt, 'مبيعات', 2);
  END LOOP;

  IF inv.tax > 0 THEN
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, description, line_no)
    VALUES (je_id, vat_account, 0, inv.tax, 'ضريبة القيمة المضافة', 3);
  END IF;

  PERFORM public.post_journal_entry(je_id);

  IF inv.invoice_no IS NULL THEN
    UPDATE public.sales_invoices SET invoice_no = 'SI-' || public.next_doc_number(inv.branch_id,'sales_invoice')
    WHERE id = inv.id;
  END IF;

  UPDATE public.sales_invoices SET status='posted', journal_entry_id = je_id
  WHERE id = inv.id RETURNING * INTO inv;
  RETURN inv;
END; $$;

-- =========================================
-- POST PURCHASE INVOICE
-- =========================================
CREATE OR REPLACE FUNCTION public.post_purchase_invoice(_invoice_id uuid)
RETURNS public.purchase_invoices LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv public.purchase_invoices;
  je_id uuid;
  ap_account uuid;
  vat_account uuid;
  default_expense uuid;
  rec record;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO inv FROM public.purchase_invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv.status = 'posted' THEN RAISE EXCEPTION 'Already posted'; END IF;
  IF inv.total <= 0 THEN RAISE EXCEPTION 'Zero total'; END IF;

  SELECT id INTO ap_account FROM public.accounts WHERE code='2101';
  SELECT id INTO vat_account FROM public.accounts WHERE code='2102';
  SELECT id INTO default_expense FROM public.accounts WHERE code='5001';

  INSERT INTO public.journal_entries (branch_id, entry_date, description, status, source_type, source_id, currency_code, created_by)
  VALUES (inv.branch_id, inv.invoice_date, 'فاتورة مشتريات ' || COALESCE(inv.invoice_no,''), 'draft', 'purchase_invoice', inv.id, inv.currency_code, auth.uid())
  RETURNING id INTO je_id;

  FOR rec IN SELECT COALESCE(expense_account_id, default_expense) AS acc, SUM(line_total) AS amt
             FROM public.purchase_invoice_lines WHERE invoice_id = inv.id
             GROUP BY COALESCE(expense_account_id, default_expense) LOOP
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

  IF inv.invoice_no IS NULL THEN
    UPDATE public.purchase_invoices SET invoice_no = 'PI-' || public.next_doc_number(inv.branch_id,'purchase_invoice')
    WHERE id = inv.id;
  END IF;

  UPDATE public.purchase_invoices SET status='posted', journal_entry_id = je_id
  WHERE id = inv.id RETURNING * INTO inv;
  RETURN inv;
END; $$;

-- =========================================
-- POST PAYMENT
-- =========================================
CREATE OR REPLACE FUNCTION public.post_payment(_payment_id uuid)
RETURNS public.payments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.payments;
  je_id uuid;
  ar_account uuid;
  ap_account uuid;
  party_type public.party_type;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO p FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF p.status = 'posted' THEN RAISE EXCEPTION 'Already posted'; END IF;

  SELECT id INTO ar_account FROM public.accounts WHERE code='1201';
  SELECT id INTO ap_account FROM public.accounts WHERE code='2101';

  INSERT INTO public.journal_entries (branch_id, entry_date, description, status, source_type, source_id, currency_code, created_by)
  VALUES (p.branch_id, p.payment_date, CASE p.direction WHEN 'receipt' THEN 'سند قبض' ELSE 'سند صرف' END, 'draft', 'payment', p.id, p.currency_code, auth.uid())
  RETURNING id INTO je_id;

  IF p.direction = 'receipt' THEN
    -- Dr cash, Cr AR
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no)
    VALUES (je_id, p.cash_account_id, p.amount, 0, 1),
           (je_id, ar_account, 0, p.amount, 2);
  ELSE
    -- Dr AP, Cr cash
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no)
    VALUES (je_id, ap_account, p.amount, 0, 1),
           (je_id, p.cash_account_id, 0, p.amount, 2);
  END IF;

  PERFORM public.post_journal_entry(je_id);

  IF p.payment_no IS NULL THEN
    UPDATE public.payments SET payment_no = CASE p.direction WHEN 'receipt' THEN 'RC-' ELSE 'PY-' END
      || public.next_doc_number(p.branch_id,'payment_'||p.direction::text)
    WHERE id = p.id;
  END IF;

  UPDATE public.payments SET status='posted', journal_entry_id = je_id
  WHERE id = p.id RETURNING * INTO p;
  RETURN p;
END; $$;
