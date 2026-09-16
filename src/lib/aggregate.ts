/**
 * Shared logic for turning raw uploaded spreadsheet rows into per-customer,
 * per-month figures. Runs in the browser at upload time.
 */

export type Dataset = "customer_overview" | "loan_information" | "distributor_detail" | "transaction_log";

export type CustomerRow = {
  phone: string;
  name: string | null;
  ref: string | null;
  state: string | null;
  market: string | null;
  agent: string | null;
  pl_limit: number | null;
  pl_balance: number | null;
  pos_installed: string | null;
  loan_type: string | null;
};

export type MonthRow = {
  phone: string;
  month: string;
  loan_count?: number | null;
  loan_amount?: number | null;
  avg_loan_aging?: number | null;
  amount_recovered?: number | null;
  amount_pending?: number | null;
  collection_amount?: number | null;
  collection_active_days?: number | null;
  pos_active_days?: number | null;
  pos_collection?: number | null;
  txn_count?: number | null;
  repayment_amount?: number | null;
  repayment_count?: number | null;
};

export const DATASET_LABELS: Record<Dataset, string> = {
  customer_overview: "Customer Overview",
  loan_information: "Loan Information",
  distributor_detail: "Distributor Detail",
  transaction_log: "Transaction Log",
};

export function normalizePhone(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s === "" || s.toLowerCase() === "nan" ? null : s;
}

/** Excel serial dates, JS dates and text dates -> "YYYY-MM". */
export function toMonth(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  let d: Date | null = null;
  if (value instanceof Date) d = value;
  else if (typeof value === "number") d = new Date(Math.round((value - 25569) * 86400 * 1000));
  else {
    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Detect which of the four datasets a sheet belongs to, from its headers. */
export function detectDataset(headers: string[]): Dataset | null {
  const h = new Set(headers.map((x) => x.trim().toLowerCase()));
  if (h.has("transactiontype") && h.has("transactiondate")) return "transaction_log";
  if (h.has("loanamount") && h.has("loandate")) return "loan_information";
  if (h.has("total collection") && h.has("active days")) return "distributor_detail";
  if (h.has("pl limit") || h.has("pl balance current")) return "customer_overview";
  return null;
}

type Row = Record<string, unknown>;

export function buildCustomers(rows: Row[]): CustomerRow[] {
  const map = new Map<string, CustomerRow>();
  for (const r of rows) {
    const phone = normalizePhone(r["Phone"]);
    if (!phone) continue;
    const existing = map.get(phone);
    const limit = num(r["PL Limit"]);
    const balance = num(r["PL Balance Current"]);
    if (!existing) {
      map.set(phone, {
        phone,
        name: str(r["Organisation_Name"]) ?? str(r["Name"]),
        ref: str(r["Ref"]),
        state: str(r["State Name"]),
        market: str(r["Market Name"]) ?? str(r["market"]),
        agent: str(r["Agent Name"]),
        pl_limit: limit,
        pl_balance: balance,
        pos_installed: str(r["POS Installed (Y/N)"]),
        loan_type: str(r["LoanType"]),
      });
    } else {
      existing.pl_limit = Math.max(existing.pl_limit ?? 0, limit ?? 0) || existing.pl_limit;
      existing.pl_balance = (existing.pl_balance ?? 0) + (balance ?? 0);
    }
  }
  return [...map.values()];
}

type Bucket = { phone: string; month: string; [k: string]: unknown };

function bucketize(rows: Row[], monthOf: (r: Row) => string | null) {
  const map = new Map<string, Bucket>();
  const out: { key: string; bucket: Bucket; row: Row }[] = [];
  for (const r of rows) {
    const phone = normalizePhone(r["Phone"]);
    const month = monthOf(r);
    if (!phone || !month) continue;
    const key = `${phone}|${month}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { phone, month };
      map.set(key, bucket);
    }
    out.push({ key, bucket, row: r });
  }
  return { map, out };
}

export function buildLoanMonths(rows: Row[]): MonthRow[] {
  const { map, out } = bucketize(rows, (r) => toMonth(r["LOANDATE"] ?? r["Date"]));
  const agingSum = new Map<string, { sum: number; n: number }>();
  const loanIds = new Map<string, Set<string>>();
  for (const { key, bucket, row } of out) {
    const b = bucket as MonthRow & Bucket;
    b.loan_amount = (b.loan_amount ?? 0) + (num(row["LOANAMOUNT"]) ?? 0);
    b.amount_recovered = (b.amount_recovered ?? 0) + (num(row["Total Amount Recovered"]) ?? 0);
    b.amount_pending = (b.amount_pending ?? 0) + (num(row["Total Amount Pending"]) ?? 0);
    const ids = loanIds.get(key) ?? new Set<string>();
    ids.add(String(row["LOANID"] ?? `${key}-${ids.size}`));
    loanIds.set(key, ids);
    const aging = num(String(row["Loan Aging"] ?? "").match(/\d+/)?.[0] ?? row["Loan Aging"]);
    if (aging !== null) {
      const acc = agingSum.get(key) ?? { sum: 0, n: 0 };
      acc.sum += aging;
      acc.n += 1;
      agingSum.set(key, acc);
    }
  }
  for (const [key, bucket] of map) {
    const b = bucket as MonthRow & Bucket;
    b.loan_count = loanIds.get(key)?.size ?? 0;
    const acc = agingSum.get(key);
    b.avg_loan_aging = acc && acc.n > 0 ? Math.round((acc.sum / acc.n) * 10) / 10 : null;
  }
  return [...map.values()] as MonthRow[];
}

export function buildCollectionMonths(rows: Row[]): MonthRow[] {
  const { map, out } = bucketize(rows, (r) => toMonth(r["Date"]));
  for (const { bucket, row } of out) {
    const b = bucket as MonthRow & Bucket;
    b.collection_amount = (b.collection_amount ?? 0) + (num(row["Total Collection"]) ?? 0);
    b.collection_active_days = (b.collection_active_days ?? 0) + (num(row["Active Days"]) ?? 0);
    b.pos_active_days = (b.pos_active_days ?? 0) + (num(row["Active Days POS"]) ?? 0);
    b.pos_collection = (b.pos_collection ?? 0) + (num(row["POS Collection"]) ?? 0);
    b.txn_count = (b.txn_count ?? 0) + (num(row["No of Transactions"]) ?? 0);
  }
  return [...map.values()] as MonthRow[];
}

export function buildRepaymentMonths(rows: Row[]): MonthRow[] {
  const repayments = rows.filter(
    (r) => String(r["TRANSACTIONTYPE"] ?? "").toLowerCase() === "amountrepaid",
  );
  const { map, out } = bucketize(repayments, (r) => toMonth(r["TRANSACTIONDATE"]));
  for (const { bucket, row } of out) {
    const b = bucket as MonthRow & Bucket;
    b.repayment_amount = (b.repayment_amount ?? 0) + (num(row["AMOUNT"]) ?? 0);
    b.repayment_count = (b.repayment_count ?? 0) + 1;
  }
  return [...map.values()] as MonthRow[];
}

/** Sorted list of the selected month plus the three months before it. */
export function windowMonths(current: string, count = 4): string[] {
  const parts = current.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

export function monthLabel(month: string): string {
  const parts = month.split("-").map(Number);
  const d = new Date(Date.UTC(parts[0] ?? 1970, (parts[1] ?? 1) - 1, 1));
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}
