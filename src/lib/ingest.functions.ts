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
  ref: z.string().min(1),
  // REF is the customer's identity, so the phone may be blank or short.
  phone: z.string(),
  name: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  market: z.string().nullable().optional(),
  agent: z.string().nullable().optional(),
  pl_limit: z.number().nullable().optional(),
  pl_balance: z.number().nullable().optional(),
  pos_installed: z.string().nullable().optional(),
  loan_type: z.string().nullable().optional(),
  onboarding_date: z.string().nullable().optional(),
  loyal_customer: z.string().nullable().optional(),
  loyal_target: z.number().nullable().optional(),
  loyal_target_achieved: z.number().nullable().optional(),
  loyal_pct: z.number().nullable().optional(),
});

const riskSchema = z.object({
  ref: z.string().min(1),
  total_pending: z.number().nullable().optional(),
  npl_value: z.number().nullable().optional(),
  max_loan_aging: z.number().nullable().optional(),
});

const monthSchema = z
  .object({
    ref: z.string().min(1),
    month: z.string().regex(/^\d{4}-\d{2}$/),
  })
  .catchall(z.union([z.number(), z.string(), z.null()]));

const repaymentSchema = z.object({
  ref: z.string().min(1),
  txn_at: z.string().min(4),
  amount: z.number(),
  loan_id: z.string().nullable().optional(),
});

const payloadSchema = z.object({
  target: z.enum(["customers", "months", "risk", "repayments"]),
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
  "wallet_active_days",
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
          ref: c.ref,
          phone: c.phone,
          name: c.name ?? null,
          state: c.state ?? null,
          market: c.market ?? null,
          agent: c.agent ?? null,
          pl_limit: c.pl_limit ?? null,
          pl_balance: c.pl_balance ?? null,
          pos_installed: c.pos_installed ?? null,
          loan_type: c.loan_type ?? null,
          onboarding_date: c.onboarding_date ?? null,
          loyal_customer: c.loyal_customer ?? null,
          loyal_target: c.loyal_target ?? null,
          loyal_target_achieved: c.loyal_target_achieved ?? null,
          loyal_pct: c.loyal_pct ?? null,
          updated_at: new Date().toISOString(),
        };
      });
      const { error } = await supabaseAdmin.from("customers").upsert(rows, { onConflict: "ref" });
      if (error) throw new Error(error.message);
      return { inserted: rows.length };
    }

    if (data.target === "risk") {
      const refs = [...new Set(data.rows.map((r) => String(r["ref"] ?? "")))].filter(Boolean);
      // The risk figures ride on the customer row, so carry the stored phone along.
      const { data: existing, error: readError } = await supabaseAdmin
        .from("customers")
        .select("ref, phone")
        .in("ref", refs);
      if (readError) throw new Error(readError.message);
      const phoneByRef = new Map((existing ?? []).map((e) => [e.ref as string, e.phone as string]));
      const rows = data.rows.map((r) => {
        const c = riskSchema.parse(r);
        return {
          ref: c.ref,
          phone: phoneByRef.get(c.ref) ?? "",
          total_pending: c.total_pending ?? null,
          npl_value: c.npl_value ?? null,
          max_loan_aging: c.max_loan_aging ?? null,
          updated_at: new Date().toISOString(),
        };
      });
      const { error } = await supabaseAdmin.from("customers").upsert(rows, { onConflict: "ref" });
      if (error) throw new Error(error.message);
      return { inserted: rows.length };
    }

    if (data.target === "repayments") {
      const rows = data.rows.map((r) => {
        const c = repaymentSchema.parse(r);
        return {
          ref: c.ref,
          txn_at: c.txn_at,
          amount: c.amount,
          loan_id: c.loan_id ?? null,
          updated_at: new Date().toISOString(),
        };
      });
      // Replace each customer's stored repayments so only the latest three remain.
      const refs = [...new Set(rows.map((r) => r.ref))];
      const { error: clearError } = await supabaseAdmin
        .from("customer_repayments")
        .delete()
        .in("ref", refs);
      if (clearError) throw new Error(clearError.message);
      const { error } = await supabaseAdmin
        .from("customer_repayments")
        .upsert(rows, { onConflict: "ref,txn_at,amount" });
      if (error) throw new Error(error.message);
      return { inserted: rows.length };
    }

    // Merge the incoming monthly figures with whatever is already stored for
    // those months so uploading one file never wipes another file's numbers.
    const rows = data.rows.map((r) => monthSchema.parse(r));
    const keys = rows.map((r) => `${r.ref}|${r.month}`);
    const refs = [...new Set(rows.map((r) => r.ref))];
    const months = [...new Set(rows.map((r) => r.month))];
    const { data: existing, error: readError } = await supabaseAdmin
      .from("customer_months")
      .select("*")
      .in("ref", refs)
      .in("month", months);
    if (readError) throw new Error(readError.message);

    const existingMap = new Map<string, Record<string, unknown>>();
    for (const row of existing ?? []) {
      existingMap.set(`${row.ref}|${row.month}`, row as Record<string, unknown>);
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
        ref: row.ref,
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
        wallet_active_days: pick("wallet_active_days"),
        pos_collection: pick("pos_collection"),
        txn_count: pick("txn_count"),
        repayment_amount: pick("repayment_amount"),
        repayment_count: pick("repayment_count"),
      };
    });

    const { error } = await supabaseAdmin
      .from("customer_months")
      .upsert(merged, { onConflict: "ref,month" });
    if (error) throw new Error(error.message);
    return { inserted: merged.length };
  });

/** Records that a file finished uploading, for the "last updated" display. */
export const recordUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { dataset: string; fileName: string; rows: number }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("data_uploads").insert({
      dataset: data.dataset,
      file_name: data.fileName,
      rows_processed: data.rows,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * The very first signed-in account becomes the administrator. Afterwards this
 * does nothing, so nobody else can grant themselves upload rights.
 */
export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: admins, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1);
    if (error) throw new Error(error.message);
    if ((admins ?? []).length > 0) {
      return { isAdmin: (admins ?? []).some((a) => a.user_id === context.userId) };
    }
    const { error: insertError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
    if (insertError) throw new Error(insertError.message);
    return { isAdmin: true };
  });
