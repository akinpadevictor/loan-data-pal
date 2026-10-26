/**
 * Shared logic for turning raw uploaded spreadsheet rows into per-customer,
 * per-month figures. Runs in the browser at upload time.
 *
 * Every customer is identified by their REF: a phone number can have more
 * than one REF attached to it, so REF — not the phone — is the key everywhere.
 */

export type Dataset = "customer_overview" | "loan_information" | "distributor_detail" | "transaction_log";

export type CustomerRow = {
  phone: string;
  ref: string;
  name: string | null;
  state: string | null;
  market: string | null;
  agent: string | null;
  pl_limit: number | null;
  pl_balance: number | null;
  pos_installed: string | null;
  loan_type: string | null;
  onboarding_date: string | null;
  loyal_customer: string | null;
  loyal_target: number | null;
  loyal_target_achieved: number | null;
  loyal_pct: number | null;
};

/** Cumulative, customer-level figures derived from Loan Information. */
export type RiskRow = {
  ref: string;
  total_pending: number | null;
  npl_value: number | null;
  max_loan_aging: number | null;
};

export type MonthRow = {
  ref: string;
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
  wallet_active_days?: number | null;
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

const HIGHEST_AGING_LOAN_CLASSES = new Set(["active", "bad loan", "np loan"]);

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

/** Phone -> the REF(s) registered under it, so rows without a REF still attach. */
export type PhoneRefs = Map<string, string[]>;

export function rowRef(r: Row): string | null {
  const ref = str(r["REF"]) ?? str(r["Ref"]) ?? str(r["ref"]);
  return ref ? ref.trim().toLowerCase() : null;
}

export function buildPhoneRefs(customers: { ref: string | null; phone: string }[]): PhoneRefs {
  const map: PhoneRefs = new Map();
  for (const c of customers) {
    const phone = normalizePhone(c.phone);
    if (!c.ref || !phone) continue;
    const refs = map.get(phone) ?? [];
    if (!refs.includes(c.ref)) refs.push(c.ref);
    map.set(phone, refs);
  }
  return map;
}

/**
 * Customer key: the row's own REF when present; otherwise the phone number,
 * but only when that phone maps to exactly one REF (no ambiguity).
 */
function keyOf(r: Row, phoneRefs?: PhoneRefs): string | null {
  const ref = rowRef(r);
  if (ref) return ref;
  const phone = normalizePhone(r["Phone"]);
  const refs = phone ? phoneRefs?.get(phone) : undefined;
  return refs && refs.length === 1 ? refs[0]! : null;
}

/**
 * Finds the Loyal Customer columns by header, however they are capitalised.
 * flag = the Y/N column, target / achieved / pct = the figures.
 */
function loyalColumns(rows: Row[]): {
  flag: string | null;
  target: string | null;
  achieved: string | null;
  pct: string | null;
} {
  const names = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) if (/loyal/i.test(k)) names.add(k);
  const pick = (re: RegExp, taken: Set<string>) =>
    [...names].find((k) => re.test(k) && !taken.has(k)) ?? null;
  const taken = new Set<string>();
  const pct = pick(/%|percent/i, taken);
  if (pct) taken.add(pct);
  const achieved = pick(/achiev/i, taken);
  if (achieved) taken.add(achieved);
  const target = pick(/target/i, taken);
  if (target) taken.add(target);
  const flag = pick(/./, taken);
  if (flag) taken.add(flag);
  return { flag, target, achieved, pct };
}

export function buildCustomers(rows: Row[]): CustomerRow[] {
  const loyal = loyalColumns(rows);
  const map = new Map<string, CustomerRow>();
  for (const r of rows) {
    const ref = rowRef(r) ?? normalizePhone(r["Phone"]);
    if (!ref) continue;
    const phone = normalizePhone(r["Phone"]);
    const existing = map.get(ref);
    const limit = num(r["PL Limit"]);
    const balance = num(r["PL Balance Current"]);
    if (!existing) {
      map.set(ref, {
        phone,
        ref,
        name: str(r["Organisation_Name"]) ?? str(r["Name"]),
        state: str(r["State Name"]),
        market: str(r["Market Name"]) ?? str(r["market"]),
        agent: str(r["Agent Name"]),
        pl_limit: limit,
        pl_balance: balance,
        pos_installed: str(r["POS Installed (Y/N)"]),
        loan_type: str(r["LoanType"]),
        onboarding_date: toDateString(r["FirstLimitAssignmentDate"] ?? r["FirstLimitAssignedDate"]),
        loyal_customer: loyal.flag ? str(r[loyal.flag]) : null,
        loyal_target: loyal.target ? num(r[loyal.target]) : null,
        loyal_target_achieved: loyal.achieved ? num(r[loyal.achieved]) : null,
        loyal_pct: loyal.pct ? num(r[loyal.pct]) : null,
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

type Bucket = { ref: string; month: string; [k: string]: unknown };

function bucketize(rows: Row[], monthOf: (r: Row) => string | null, phoneRefs?: PhoneRefs) {
  const map = new Map<string, Bucket>();
  const out: { key: string; bucket: Bucket; row: Row }[] = [];
  for (const r of rows) {
    const ref = keyOf(r, phoneRefs);
    const month = monthOf(r);
    if (!ref || !month) continue;
    const key = `${ref}|${month}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { ref, month };
      map.set(key, bucket);
    }
    out.push({ key, bucket, row: r });
  }
  return { map, out };
}

export function buildLoanMonths(rows: Row[], phoneRefs?: PhoneRefs): MonthRow[] {
  const { map, out } = bucketize(rows, (r) => toMonth(r["LOANDATE"] ?? r["Date"]), phoneRefs);
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
 * Cumulative loan risk per REF, across every Loan Information record:
 * total amount pending, NPL value (aging above 20 days) and highest aging.
 * The highest aging only counts loans whose class is Active, Bad Loan or NP Loan.
 */
export function buildLoanRisk(rows: Row[], phoneRefs?: PhoneRefs): RiskRow[] {
  const map = new Map<string, RiskRow>();
  for (const r of rows) {
    const ref = keyOf(r, phoneRefs);
    if (!ref) continue;
    let entry = map.get(ref);
    if (!entry) {
      entry = { ref, total_pending: 0, npl_value: 0, max_loan_aging: null };
      map.set(ref, entry);
    }
    const pending = num(r["Total Amount Pending"]) ?? 0;
    entry.total_pending = (entry.total_pending ?? 0) + pending;
    const aging = loanAgingDays(r["Loan Aging"]);
    if (aging !== null) {
      const loanClass = str(r["Loan Class"])?.toLowerCase();
      if (
        loanClass &&
        HIGHEST_AGING_LOAN_CLASSES.has(loanClass) &&
        (entry.max_loan_aging === null || aging > entry.max_loan_aging)
      ) {
        entry.max_loan_aging = aging;
      }
      if (aging > NPL_AGING_DAYS) entry.npl_value = (entry.npl_value ?? 0) + pending;
    }
  }
  return [...map.values()];
}

/**
 * Active-day flag for a channel. The spreadsheet stores these as formulas, so
 * when the cached numeric value is missing we derive it from the amount.
 */
function activeDayFlag(flag: unknown, amount: unknown): number {
  const direct = num(flag);
  if (direct !== null) return direct > 0 ? 1 : 0;
  return (num(amount) ?? 0) >= 1 ? 1 : 0;
}

export function buildCollectionMonths(rows: Row[], phoneRefs?: PhoneRefs): MonthRow[] {
  const { map, out } = bucketize(rows, (r) => toMonth(r["Date"]), phoneRefs);
  for (const { bucket, row } of out) {
    const b = bucket as MonthRow & Bucket;
    b.collection_amount = (b.collection_amount ?? 0) + (num(row["Total Collection"]) ?? 0);
    b.collection_active_days = (b.collection_active_days ?? 0) + (num(row["Active Days"]) ?? 0);
    b.pos_active_days = (b.pos_active_days ?? 0) + (num(row["Active Days POS"]) ?? 0);
    b.pos_collection = (b.pos_collection ?? 0) + (num(row["POS Collection"]) ?? 0);
    b.wallet_active_days =
      (b.wallet_active_days ?? 0) + (activeDayFlag(row["Active Days Wallet"], row["Wallet Collection"]) ?? 0);
    b.txn_count = (b.txn_count ?? 0) + (num(row["No of Transactions"]) ?? 0);
  }
  return [...map.values()] as MonthRow[];
}

export function buildRepaymentMonths(rows: Row[], phoneRefs?: PhoneRefs): MonthRow[] {
  const repayments = rows.filter(
    (r) => String(r["TRANSACTIONTYPE"] ?? "").toLowerCase() === "amountrepaid",
  );
  const { map, out } = bucketize(repayments, (r) => toMonth(r["TRANSACTIONDATE"]), phoneRefs);
  for (const { bucket, row } of out) {
    const b = bucket as MonthRow & Bucket;
    b.repayment_amount = (b.repayment_amount ?? 0) + (num(row["AMOUNT"]) ?? 0);
    b.repayment_count = (b.repayment_count ?? 0) + 1;
  }
  return [...map.values()] as MonthRow[];
}

export type RepaymentRow = {
  ref: string;
  txn_at: string;
  amount: number;
  loan_id: string | null;
};

/** The three most recent "amountrepaid" transactions for each REF. */
export function buildLastRepayments(rows: Row[], phoneRefs?: PhoneRefs, keep = 3): RepaymentRow[] {
  const map = new Map<string, RepaymentRow[]>();
  for (const r of rows) {
    if (String(r["TRANSACTIONTYPE"] ?? "").toLowerCase() !== "amountrepaid") continue;
    const ref = keyOf(r, phoneRefs);
    const when = excelDate(r["TRANSACTIONDATE"]);
    const amount = num(r["AMOUNT"]);
    if (!ref || !when || amount === null) continue;
    const list = map.get(ref) ?? [];
    list.push({
      ref,
      txn_at: when.toISOString(),
      amount,
      loan_id: str(r["LOANID"]),
    });
    map.set(ref, list);
  }
  const out: RepaymentRow[] = [];
  for (const list of map.values()) {
    list.sort((a, b) => b.txn_at.localeCompare(a.txn_at));
    out.push(...list.slice(0, keep));
  }
  return out;
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
