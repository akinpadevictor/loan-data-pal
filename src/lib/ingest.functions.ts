import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Only accounts holding the admin role may refresh the data. */
async function assertAdmin(context: { supabase: { rpc: Function }; userId: string }) {
  const { data, error } = await (context.supabase.rpc as any)("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only an administrator can upload data.");
}


const customerSchema = z.object({
  phone: z.string().min(6),
  name: z.string().nullable().optional(),
  ref: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  market: z.string().nullable().optional(),
  agent: z.string().nullable().optional(),
  pl_limit: z.number().nullable().optional(),
  pl_balance: z.number().nullable().optional(),
  pos_installed: z.string().nullable().optional(),
  loan_type: z.string().nullable().optional(),
  onboarding_date: z.string().nullable().optional(),
});

const riskSchema = z.object({
  phone: z.string().min(6),
  total_pending: z.number().nullable().optional(),
  npl_value: z.number().nullable().optional(),
  max_loan_aging: z.number().nullable().optional(),
});

const monthSchema = z
  .object({
    phone: z.string().min(6),
    month: z.string().regex(/^\d{4}-\d{2}$/),
  })
  .catchall(z.union([z.number(), z.string(), z.null()]));

const payloadSchema = z.object({
  target: z.enum(["customers", "months", "risk"]),
  rows: z.array(z.record(z.string(), z.unknown())).max(1000),
});

const NUMERIC_MONTH_FIELDS = [
  "loan_count",
  "loan_amount",
  "avg_loan_aging",
  "aging_sum",
  "aging_count",
  "amount_recovered",
  "amount_pending",
  "collection_amount",
  "collection_active_days",
  "pos_active_days",
  "pos_collection",
  "txn_count",
  "repayment_amount",
  "repayment_count",
] as const;

/** Upserts a batch of customers, cumulative risk figures or monthly rows. */
export const ingestBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => payloadSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.target === "customers") {
      const rows = data.rows.map((r) => {
        const c = customerSchema.parse(r);
        return {
          phone: c.phone,
          name: c.name ?? null,
          ref: c.ref ?? null,
          state: c.state ?? null,
          market: c.market ?? null,
          agent: c.agent ?? null,
          pl_limit: c.pl_limit ?? null,
          pl_balance: c.pl_balance ?? null,
          pos_installed: c.pos_installed ?? null,
          loan_type: c.loan_type ?? null,
          onboarding_date: c.onboarding_date ?? null,
          updated_at: new Date().toISOString(),
        };
      });
      const { error } = await supabaseAdmin.from("customers").upsert(rows, { onConflict: "phone" });
      if (error) throw new Error(error.message);
      return { inserted: rows.length };
    }

    if (data.target === "risk") {
      const rows = data.rows.map((r) => {
        const c = riskSchema.parse(r);
        return {
          phone: c.phone,
          total_pending: c.total_pending ?? null,
          npl_value: c.npl_value ?? null,
          max_loan_aging: c.max_loan_aging ?? null,
          updated_at: new Date().toISOString(),
        };
      });
      const { error } = await supabaseAdmin.from("customers").upsert(rows, { onConflict: "phone" });
      if (error) throw new Error(error.message);
      return { inserted: rows.length };
    }

    // Merge the incoming monthly figures with whatever is already stored for
    // those months so uploading one file never wipes another file's numbers.
    const rows = data.rows.map((r) => monthSchema.parse(r));
    const keys = rows.map((r) => `${r.phone}|${r.month}`);
    const phones = [...new Set(rows.map((r) => r.phone))];
    const months = [...new Set(rows.map((r) => r.month))];
    const { data: existing, error: readError } = await supabaseAdmin
      .from("customer_months")
      .select("*")
      .in("phone", phones)
      .in("month", months);
    if (readError) throw new Error(readError.message);

    const existingMap = new Map<string, Record<string, unknown>>();
    for (const row of existing ?? []) {
      existingMap.set(`${row.phone}|${row.month}`, row as Record<string, unknown>);
    }

    const merged = rows.map((row, i) => {
      const prev = existingMap.get(keys[i]!) ?? {};
      const pick = (field: (typeof NUMERIC_MONTH_FIELDS)[number]): number | null => {
        const incoming = (row as Record<string, unknown>)[field];
        if (incoming === undefined || incoming === null) {
          return (prev[field] as number | null | undefined) ?? null;
        }
        return Number(incoming);
      };
      return {
        phone: row.phone,
        month: row.month,
        updated_at: new Date().toISOString(),
        loan_count: pick("loan_count"),
        loan_amount: pick("loan_amount"),
        avg_loan_aging: pick("avg_loan_aging"),
        aging_sum: pick("aging_sum"),
        aging_count: pick("aging_count"),
        amount_recovered: pick("amount_recovered"),
        amount_pending: pick("amount_pending"),
        collection_amount: pick("collection_amount"),
        collection_active_days: pick("collection_active_days"),
        pos_active_days: pick("pos_active_days"),
        pos_collection: pick("pos_collection"),
        txn_count: pick("txn_count"),
        repayment_amount: pick("repayment_amount"),
        repayment_count: pick("repayment_count"),
      };
    });

    const { error } = await supabaseAdmin
      .from("customer_months")
      .upsert(merged, { onConflict: "phone,month" });
    if (error) throw new Error(error.message);
    return { inserted: merged.length };
  });

/** Records that a file finished uploading, for the "last updated" display. */
export const recordUpload = createServerFn({ method: "POST" })
  .inputValidator((input: { dataset: string; fileName: string; rows: number }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("data_uploads").insert({
      dataset: data.dataset,
      file_name: data.fileName,
      rows_processed: data.rows,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
