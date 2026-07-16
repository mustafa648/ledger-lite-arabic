
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.prevent_posted_change() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_doc_number(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.post_journal_entry(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.post_sales_invoice(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.post_purchase_invoice(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.post_payment(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_doc_number(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_purchase_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_payment(uuid) TO authenticated;
