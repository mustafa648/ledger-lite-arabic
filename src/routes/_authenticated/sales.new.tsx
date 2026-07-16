import { createFileRoute } from "@tanstack/react-router";
import { InvoiceForm } from "@/components/InvoiceForm";

export const Route = createFileRoute("/_authenticated/sales/new")({ component: () => <InvoiceForm kind="sales" /> });