import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { fail, ok, requireAuth } from "./_shared";

export default defineTool({
  name: "create_party",
  title: "Create a customer or supplier",
  description: "Create a new customer or supplier record in the accounting system.",
  inputSchema: {
    name: z.string().describe("Display name of the customer or supplier."),
    type: z.enum(["customer", "supplier", "both"]).describe("Whether this party is a customer, supplier, or both."),
    phone: z.string().optional().describe("Contact phone number."),
    email: z.string().optional().describe("Contact email address."),
    address: z.string().optional().describe("Postal address."),
    currency_code: z.string().optional().describe("Currency code, e.g. YER or USD. Defaults to the system base currency."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    requireAuth(ctx);
    const name = input.name.trim();
    if (!name) return fail("name must not be empty");
    const { data, error } = await supabaseForUser(ctx)
      .from("parties")
      .insert({
        name,
        type: input.type,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        ...(input.currency_code ? { currency_code: input.currency_code } : {}),
      })
      .select("id, code, name, type, phone, email, currency_code")
      .single();
    return error ? fail(error.message) : ok(data);
  },
});
