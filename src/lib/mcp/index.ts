import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listAccounts from "./tools/list-accounts";
import listParties from "./tools/list-parties";
import createParty from "./tools/create-party";
import listItems from "./tools/list-items";
import listInvoices from "./tools/list-invoices";
import trialBalance from "./tools/trial-balance";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "harmony-books",
  title: "Harmony Books",
  version: "0.1.0",
  instructions:
    "Tools for the Harmony Books double-entry accounting app. Read the chart of accounts, customers and suppliers, inventory items, sales and purchase invoices, and compute a trial balance. You can also create a new customer or supplier. All data is scoped to the signed-in user's account via row-level security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listAccounts, listParties, createParty, listItems, listInvoices, trialBalance],
});
