
ALTER TABLE public.sales_invoices    ADD COLUMN IF NOT EXISTS client_ref uuid;
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS client_ref uuid;
ALTER TABLE public.payments          ADD COLUMN IF NOT EXISTS client_ref uuid;

CREATE UNIQUE INDEX IF NOT EXISTS sales_invoices_client_ref_key
  ON public.sales_invoices (company_id, client_ref) WHERE client_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_invoices_client_ref_key
  ON public.purchase_invoices (company_id, client_ref) WHERE client_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_client_ref_key
  ON public.payments (company_id, client_ref) WHERE client_ref IS NOT NULL;
