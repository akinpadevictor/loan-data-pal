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
  onboarding_date: string | null;
};

/** Cumulative, customer-level figures derived from Loan Information. */
export type RiskRow = {
  phone: string;
  total_pending: number | null;
  npl_value: number | null;
  max_loan_aging: number | null;
};

export type MonthRow = {
  phone: string;
  month: string;
  loan_count?: number | null;
  loan_amount?: number | null;
  avg_loan_aging?: number | null;
  aging_sum?: number | null;
  aging_count?: number | null;
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

/** Loans aged above this many days count towards the NPL value. */
export const NPL_AGING_DAYS = 20;

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

function excelDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value;
  const asNumber = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(asNumber) && asNumber > 20000 && asNumber < 90000) {
    return new Date(Math.round((asNumber - 25569) * 86400 * 1000));
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Excel serial dates, JS dates and text dates -> "YYYY-MM-DD". */
export function toDateString(value: unknown): string | null {
  const d = excelDate(value);
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Excel serial dates, JS dates and text dates -> "YYYY-MM". */
export function toMonth(value: unknown): string | null {
  const d = excelDate(value);
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

/** REF -> phone, so loan and collection rows attach to the right customer. */
export type RefMap = Map<string, string>;

function rowRef(r: Row): string | null {
  const ref = str(r["REF"]) ?? str(r["Ref"]) ?? str(r["ref"]);
  return ref ? ref.trim().toLowerCase() : null;
}

/** Customer key: matched on REF where possible, otherwise the phone number. */
function keyOf(r: Row, refMap?: RefMap): string {
  const ref = rowRef(r);
  if (ref && refMap?.has(ref)) return refMap.get(ref)!;
  return normalizePhone(r["Phone"]);
}

export function buildRefMap(customers: { ref: string | null; phone: string }[]): RefMap {
  const map: RefMap = new Map();
  for (const c of customers) {
    if (c.ref && c.phone) map.set(c.ref.trim().toLowerCase(), c.phone);
  }
  return map;
}

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
        ref: str(r["Ref"]) ?? str(r["REF"]),
        state: str(r["State Name"]),
        market: str(r["Market Name"]) ?? str(r["market"]),
        agent: str(r["Agent Name"]),
        pl_limit: limit,
        pl_balance: balance,
        pos_installed: str(r["POS Installed (Y/N)"]),
        loan_type: str(r["LoanType"]),
        onboarding_date: toDateString(r["FirstLimitAssignmentDate"] ?? r["FirstLimitAssignedDate"]),
      });
    } else {
      existing.pl_limit = Math.max(existing.pl_limit ?? 0, limit ?? 0) || existing.pl_limit;
      existing.pl_balance = (existing.pl_balance ?? 0) + (balance ?? 0);
    }
  }
  return [...map.values()];
}

/** Numeric days out of a "7 Days" style Loan Aging value. */
export function loanAgingDays(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

type Bucket = { phone: string; month: string; [k: string]: unknown };

function bucketize(rows: Row[], monthOf: (r: Row) => string | null, refMap?: RefMap) {
  const map = new Map<string, Bucket>();
  const out: { key: string; bucket: Bucket; row: Row }[] = [];
  for (const r of rows) {
    const phone = keyOf(r, refMap);
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

export function buildLoanMonths(rows: Row[], refMap?: RefMap): MonthRow[] {
  const { map, out } = bucketize(rows, (r) => toMonth(r["LOANDATE"] ?? r["Date"]), refMap);
  const loanIds = new Map<string, Set<string>>();
  for (const { key, bucket, row } of out) {
    const b = bucket as MonthRow & Bucket;
    b.loan_amount = (b.loan_amount ?? 0) + (num(row["LOANAMOUNT"]) ?? 0);
    b.amount_recovered = (b.amount_recovered ?? 0) + (num(row["Total Amount Recovered"]) ?? 0);
    b.amount_pending = (b.amount_pending ?? 0) + (num(row["Total Amount Pending"]) ?? 0);
    const ids = loanIds.get(key) ?? new Set<string>();
    ids.add(String(row["LOANID"] ?? `${key}-${ids.size}`));
    loanIds.set(key, ids);
    const aging = loanAgingDays(row["Loan Aging"]);
    if (aging !== null) {
      b.aging_sum = (b.aging_sum ?? 0) + aging;
      b.aging_count = (b.aging_count ?? 0) + 1;
    }
  }
  for (const [key, bucket] of map) {
    const b = bucket as MonthRow & Bucket;
    b.loan_count = loanIds.get(key)?.size ?? 0;
    b.avg_loan_aging =
      b.aging_count && b.aging_count > 0
        ? Math.round(((b.aging_sum ?? 0) / b.aging_count) * 10) / 10
        : null;
  }
  return [...map.values()] as MonthRow[];
}

/**
 * Cumulative loan risk per customer, across every Loan Information record:
 * total amount pending, NPL value (aging above 20 days) and highest aging.
 */
export function buildLoanRisk(rows: Row[], refMap?: RefMap): RiskRow[] {
  const map = new Map<string, RiskRow>();
  for (const r of rows) {
    const phone = keyOf(r, refMap);
    if (!phone) continue;
    let entry = map.get(phone);
    if (!entry) {
      entry = { phone, total_pending: 0, npl_value: 0, max_loan_aging: null };
      map.set(phone, entry);
    }
    const pending = num(r["Total Amount Pending"]) ?? 0;
    entry.total_pending = (entry.total_pending ?? 0) + pending;
    const aging = loanAgingDays(r["Loan Aging"]);
    if (aging !== null) {
      if (entry.max_loan_aging === null || aging > entry.max_loan_aging) entry.max_loan_aging = aging;
      if (aging > NPL_AGING_DAYS) entry.npl_value = (entry.npl_value ?? 0) + pending;
    }
  }
  return [...map.values()];
}

export function buildCollectionMonths(rows: Row[], refMap?: RefMap): MonthRow[] {
  const { map, out } = bucketize(rows, (r) => toMonth(r["Date"]), refMap);
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

export function buildRepaymentMonths(rows: Row[], refMap?: RefMap): MonthRow[] {
  const repayments = rows.filter(
    (r) => String(r["TRANSACTIONTYPE"] ?? "").toLowerCase() === "amountrepaid",
  );
  const { map, out } = bucketize(repayments, (r) => toMonth(r["TRANSACTIONDATE"]), refMap);
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

/** The month, shifted back by `back` months. */
export function shiftMonth(month: string, back: number): string {
  const parts = month.split("-").map(Number);
  const d = new Date(Date.UTC(parts[0] ?? 1970, (parts[1] ?? 1) - 1 - back, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Average loan aging over a 3-month rolling window ending with `month`.
 * Returns null when none of the three months has a loan record.
 */
export function rollingAvgAging(
  month: string,
  data: Map<string, { aging_sum: number | null; aging_count: number | null }>,
  windowSize = 3,
): number | null {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < windowSize; i++) {
    const record = data.get(shiftMonth(month, i));
    if (!record) continue;
    if (record.aging_count && record.aging_count > 0) {
      sum += record.aging_sum ?? 0;
      count += record.aging_count;
    }
  }
  return count > 0 ? Math.round((sum / count) * 10) / 10 : null;
}

export function monthLabel(month: string): string {
  const parts = month.split("-").map(Number);
  const d = new Date(Date.UTC(parts[0] ?? 1970, (parts[1] ?? 1) - 1, 1));
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function dateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
