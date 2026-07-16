import { createFileRoute } from "@tanstack/react-router";
import { InvoiceForm } from "@/components/InvoiceForm";

export const Route = createFileRoute("/_authenticated/purchases/new")({ component: () => <InvoiceForm kind="purchases" /> });