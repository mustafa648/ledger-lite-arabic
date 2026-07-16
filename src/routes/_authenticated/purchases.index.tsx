import { createFileRoute } from "@tanstack/react-router";
import { InvoiceList } from "@/components/InvoiceList";

export const Route = createFileRoute("/_authenticated/purchases/")({ component: () => <InvoiceList kind="purchases" /> });