
# Accounting App — Iteration 1 Plan

Production-ready foundation with double-entry bookkeeping, Sales & Purchases, Arabic-first RTL UI, Lovable Cloud backend, and role-based access.

## Scope (this iteration)

Included:
- Auth, roles (Admin, Accountant, Manager, Viewer), multi-branch, multi-currency (YER base, SAR, USD)
- Dashboard with KPIs and charts
- Chart of Accounts (tree)
- Journal Entries (manual, balanced enforcement, draft/posted, sequential numbering)
- General Ledger view
- Customers & Suppliers
- Sales Invoices, Purchase Invoices (with auto journal entries on post)
- Payments & Receipts (with auto journal entries)
- Reports: Trial Balance, General Ledger, Customer/Supplier Statements
- Audit log, search/filter/pagination, PDF/Excel export, print-friendly reports, dark/light mode, i18n (Arabic RTL default, English toggle)

Deferred to later iterations: Cash flow, Income Statement, Balance Sheet, Inventory, Fixed Assets, Payroll, Notifications, Backup/Restore UI.

## Design

Clean corporate. Neutral gray surfaces, single blue accent (#2563eb family). Legible RTL-first typography (Cairo/IBM Plex Sans Arabic for AR, Inter for EN). Sidebar layout, dense tables, card KPIs. Fully responsive, mobile-first drawer nav.

## Tech

- TanStack Start (React + TS), Tailwind v4, shadcn/ui
- Lovable Cloud (Postgres + Auth + Storage + RLS)
- i18n via react-i18next, `dir` toggled at `<html>`
- Charts: Recharts. Excel: SheetJS. PDF: browser print + jsPDF for statements
- TanStack Query for data, server functions for privileged writes

## Database schema (Lovable Cloud)

Core tables (all with RLS + branch scoping):

- `profiles(id→auth.users, full_name, default_branch_id, locale, theme)`
- `app_role` enum: admin | accountant | manager | viewer
- `user_roles(user_id, role)` — separate table, `has_role()` security-definer fn
- `branches(id, code, name, is_active)`
- `user_branches(user_id, branch_id)` — which branches a user can access
- `currencies(code PK, name, symbol)` seeded with YER, SAR, USD
- `exchange_rates(id, from_code, to_code, rate, effective_date)`
- `accounts` (Chart of Accounts): `id, code, name_ar, name_en, type (asset|liability|equity|income|expense), parent_id, is_group, currency_code, is_active`
- `document_sequences(branch_id, doc_type, next_number)` for sequential numbering
- `journal_entries(id, entry_no, branch_id, entry_date, description, status draft|posted, source_type, source_id, created_by, posted_by, posted_at)`
- `journal_lines(id, entry_id, account_id, debit, credit, currency_code, fx_rate, description)` — DB trigger enforces sum(debit)=sum(credit) on post
- `parties(id, type customer|supplier|both, code, name, tax_id, phone, email, address, receivable_account_id, payable_account_id, currency_code, opening_balance)`
- `sales_invoices(id, invoice_no, branch_id, customer_id, invoice_date, due_date, currency_code, fx_rate, subtotal, tax, total, status draft|posted|paid|cancelled, journal_entry_id)`
- `sales_invoice_lines(id, invoice_id, description, qty, unit_price, tax_rate, income_account_id, line_total)`
- `purchase_invoices` + `purchase_invoice_lines` — mirror of sales
- `payments(id, payment_no, branch_id, party_id, direction receipt|payment, payment_date, amount, currency_code, fx_rate, cash_account_id, method, reference, status, journal_entry_id)`
- `payment_allocations(id, payment_id, invoice_id, invoice_type, amount)`
- `audit_log(id, user_id, action, table_name, row_id, before, after, at)`

### Business rules enforced in DB
- Trigger blocks posting a journal entry with unbalanced lines
- Trigger blocks UPDATE/DELETE of `status='posted'` rows (except status flips via allowed RPC)
- Trigger writes to `audit_log` on insert/update/delete of key tables
- Posting an invoice/payment creates the linked `journal_entry` in the same transaction via `SECURITY DEFINER` RPC (`post_sales_invoice`, `post_purchase_invoice`, `post_payment`)
- Sequential numbering via `next_doc_number(branch_id, doc_type)` RPC with row lock

### RLS summary
- `admin` full access; `accountant` full CRUD on transactions in their branches; `manager` read + approve; `viewer` read-only
- All transactional tables filtered by `branch_id ∈ user_branches`
- `user_roles` readable by owner + admins; writable only by admins

## App structure

```
src/
  routes/
    __root.tsx                (RTL/LTR shell, providers, sonner, i18n)
    index.tsx                 (public landing → redirect to /dashboard if auth)
    auth.tsx                  (sign in / sign up)
    _authenticated/
      route.tsx               (integration-managed gate)
      dashboard.tsx
      accounts.tsx            (Chart of Accounts tree)
      journal.index.tsx       (list) + journal.new.tsx + journal.$id.tsx
      ledger.tsx              (General Ledger)
      parties.index.tsx       (Customers & Suppliers) + parties.$id.tsx
      sales.index.tsx + sales.new.tsx + sales.$id.tsx
      purchases.index.tsx + purchases.new.tsx + purchases.$id.tsx
      payments.index.tsx + payments.new.tsx
      reports.trial-balance.tsx
      reports.general-ledger.tsx
      reports.statement.tsx
      settings.branches.tsx + settings.currencies.tsx + settings.users.tsx + settings.audit.tsx
  components/
    layout/ (AppSidebar, Topbar with branch+language+theme+user)
    accounting/ (AccountPicker, AmountInput, CurrencyBadge, JournalLinesEditor, StatusBadge)
    tables/ (DataTable with pagination/search/filter)
    exports/ (ExportPdfButton, ExportExcelButton, PrintButton)
  lib/
    i18n.ts, rtl.ts, format.ts (money, dates — Arabic-Indic optional)
    accounting/ (server functions: postInvoice, postPayment, postJournal, sequences)
  integrations/supabase/*
```

## i18n / RTL

- react-i18next with `ar` (default) and `en` locales; all UI strings in dictionaries
- `<html lang dir>` updated on locale change; Tailwind logical properties (`ps-`, `pe-`, `text-start`)
- Numbers formatted via `Intl.NumberFormat` with locale; dates via `date-fns` locales
- shadcn components verified for RTL (sidebar, dropdowns, sheet)

## Reports & exports

- Trial Balance: per-branch, date range, drill-down to GL
- General Ledger: by account, date range, running balance
- Customer/Supplier statement: opening + movements + closing, printable
- Excel export via `xlsx`; PDF via print stylesheet (`@media print`) + optional `jspdf` for statements

## Auth & sign-in

- Email/password + Google OAuth via Lovable broker
- First user auto-promoted to `admin` via trigger; subsequent users default to `viewer` until admin assigns role
- Profile row auto-created on signup

## Out of scope (flagged for later)

Cash Flow, Income Statement, Balance Sheet, Inventory, Fixed Assets, Payroll, in-app notifications, backup/restore UI, approval workflows.

## Deliverables

Enable Lovable Cloud → migrations for full schema + RLS + RPCs → i18n + RTL shell → auth + roles → each module route with list/detail/form → reports → exports → polish (dark mode, print styles, responsive).

Expect this to be sizable — I'll ship it end-to-end but you should plan to iterate on edge cases (tax rules, FX gain/loss handling, per-branch numbering formats) after first review.
