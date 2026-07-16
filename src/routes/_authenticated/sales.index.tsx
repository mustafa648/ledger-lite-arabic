import { createFileRoute } from "@tanstack/react-router";
import { InvoiceList } from "@/components/InvoiceList";

export const Route = createFileRoute("/_authenticated/sales/")({ component: () => <InvoiceList kind="sales" /> });