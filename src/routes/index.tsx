import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Phone, ArrowRight, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  dateLabel,
  monthLabel,
  normalizePhone,
  rollingAvgAging,
  windowMonths,
} from "@/lib/aggregate";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Customer Lookup — Credit Lens" },
      {
        name: "description",
        content:
          "Enter a customer phone number to see PL limit, loan usage, average repayment days, PL balance, collections and POS activity for each month.",
      },
      { property: "og:title", content: "Customer Lookup — Credit Lens" },
      { property: "og:type", content: "website" },
      {
        property: "og:description",
        content:
          "Monthly credit and collection performance for any customer, looked up by phone number.",
      },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LookupPage,
});

type Customer = {
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
  total_pending: number | null;
  npl_value: number | null;
  max_loan_aging: number | null;
};

type MonthRecord = {
  month: string;
  loan_count: number | null;
  loan_amount: number | null;
  avg_loan_aging: number | null;
  aging_sum: number | null;
  aging_count: number | null;
  npl_value: number | null;
  collection_amount: number | null;
  collection_active_days: number | null;
  pos_active_days: number | null;
  amount_pending: number | null;
};

const money = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "—"
    : `₦${Math.round(v).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

const plain = (v: number | null | undefined, suffix = "") =>
  v === null || v === undefined ? "—" : `${Math.round(v * 10) / 10}${suffix}`;

function LookupPage() {
  const [input, setInput] = useState("");
  const [phone, setPhone] = useState<string>("");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [extraMonths, setExtraMonths] = useState<string[]>([]);

  const search = useQuery({
    queryKey: ["customer", phone],
    enabled: phone.length >= 6,
    queryFn: async () => {
      const { data: customer, error } = await supabase
        .from("customers")
        .select("*")
        .eq("phone", phone)
        .maybeSingle();
      if (error) throw error;

      const { data: months, error: monthsError } = await supabase
        .from("customer_months")
        .select(
          "month, loan_count, loan_amount, avg_loan_aging, aging_sum, aging_count, npl_value, collection_amount, collection_active_days, pos_active_days, amount_pending",
        )
        .eq("phone", phone)
        .order("month", { ascending: false });
      if (monthsError) throw monthsError;

      return {
        customer: (customer ?? null) as Customer | null,
        months: (months ?? []) as MonthRecord[],
      };
    },
  });

  const availableMonths = useMemo(
    () => (search.data?.months ?? []).map((m) => m.month),
    [search.data],
  );
  const latestMonth = availableMonths[0] ?? null;
  const currentMonth = anchor ?? latestMonth;

  const shownMonths = useMemo(() => {
    if (!currentMonth) return [];
    const base = windowMonths(currentMonth, 4);
    return [...new Set([...base, ...extraMonths])].sort();
  }, [currentMonth, extraMonths]);

  const byMonth = useMemo(() => {
    const map = new Map<string, MonthRecord>();
    for (const m of search.data?.months ?? []) map.set(m.month, m);
    return map;
  }, [search.data]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizePhone(input);
    setAnchor(null);
    setExtraMonths([]);
    setPhone(normalized || input.replace(/\D/g, ""));
  };

  const customer = search.data?.customer ?? null;
  const notFound = search.isSuccess && !customer && (search.data?.months.length ?? 0) === 0;

  const rows: { label: string; hint?: string; get: (m: MonthRecord | undefined) => string }[] = [
    {
      label: "PL limit",
      hint: "Current assigned limit",
      get: () => money(customer?.pl_limit ?? null),
    },
    {
      label: "Loan usage",
      hint: "Total loan amount taken",
      get: (m) => money(m?.loan_amount ?? null),
    },
    { label: "Loans taken", get: (m) => plain(m?.loan_count ?? null) },
    {
      label: "Loan aging",
      hint: "Average loan age of loans taken",
      get: (m) =>
        m?.avg_loan_aging !== null && m?.avg_loan_aging !== undefined && m.avg_loan_aging > 20
          ? `${plain(m.avg_loan_aging, " days")} · Possible NPL`
          : plain(m?.avg_loan_aging ?? null, " days"),
    },
    {
      label: "Interest accrued",
      get: (m) => money(m?.interest_accrued ?? null),
    },
    {
      label: "NPL value",
      hint: "Pending value on loans aged above 20 days",
      get: (m) => money(m?.npl_value ?? null),
    },
    {
      label: "Collection amount",
      get: (m) => money(m?.collection_amount ?? null),
    },
    {
      label: "Collection active days",
      get: (m) => plain(m?.collection_active_days ?? null),
    },
    {
      label: "POS active days",
      get: (m) => plain(m?.pos_active_days ?? null),
    },
  ];

  return (
    <main className="mx-auto max-w-6xl px-5 pb-20 pt-10">
      <div className="max-w-2xl">
        <p className="label-caps">Customer credit &amp; collections</p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">
          Look up a customer by phone number
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Enter the phone number to see PL limit, loan usage, average repayment days, PL balance,
          collections and POS activity for the current month and each of the last three months — or
          any other month you pick.
        </p>
      </div>

      <form onSubmit={submit} className="mt-7 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            inputMode="tel"
            placeholder="e.g. 08033814902"
            aria-label="Customer phone number"
            className="numeric h-12 border-border bg-surface pl-10 text-base"
          />
        </div>
        <Button type="submit" size="lg" className="h-12 gap-2 px-6 font-semibold">
          <Search className="size-4" /> Look up
        </Button>
      </form>

      {search.isFetching && (
        <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Fetching customer data…
        </div>
      )}

      {search.isError && (
        <p className="mt-10 text-sm text-destructive">
          Could not load this customer. Please try again.
        </p>
      )}

      {notFound && !search.isFetching && (
        <div className="panel mt-10 p-6">
          <h2 className="text-base font-semibold">No record for this number</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Check the digits, or upload the latest files on the “Update data” page.
          </p>
        </div>
      )}

      {customer && !search.isFetching && (
        <section className="mt-10 space-y-6">
          <div className="panel p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="label-caps">Organization name</p>
                <h2 className="mt-1 text-xl font-bold">{customer.name ?? "Unnamed customer"}</h2>
                <p className="numeric mt-1 text-sm text-muted-foreground">{customer.phone}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {[customer.state, customer.market, customer.loan_type]
                  .filter(Boolean)
                  .map((tag) => (
                    <span
                      key={tag as string}
                      className="rounded-full bg-secondary px-3 py-1 font-medium text-secondary-foreground"
                    >
                      {tag}
                    </span>
                  ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="PL limit" value={money(customer.pl_limit)} tone="primary" />
              <Stat
                label="PL balance (current)"
                value={money(customer.pl_balance)}
                tone="accent"
              />
              <Stat label="Agent" value={customer.agent ?? "—"} small />
              <Stat
                label="POS installed"
                value={customer.pos_installed === "Y" ? "Yes" : "No"}
                small
              />
            </div>
          </div>

          <div className="panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-5">
              <div>
                <h3 className="text-sm font-semibold">Month by month</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Showing the selected month and the three months before it.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Current month
                <select
                  value={currentMonth ?? ""}
                  onChange={(e) => setAnchor(e.target.value)}
                  className="numeric rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-foreground"
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {monthLabel(m)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2/60">
                    <th className="label-caps px-5 py-3 text-left">Metric</th>
                    {shownMonths.map((m) => (
                      <th
                        key={m}
                        className={`px-5 py-3 text-right text-xs font-semibold ${
                          m === currentMonth ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {monthLabel(m)}
                        {m === currentMonth && (
                          <span className="ml-1 font-normal opacity-70">(current)</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label} className="border-b border-border/60 last:border-0">
                      <td className="px-5 py-3">
                        <span className="font-medium">{row.label}</span>
                        {row.hint && (
                          <span className="block text-xs text-muted-foreground">{row.hint}</span>
                        )}
                      </td>
                      {shownMonths.map((m) => (
                        <td key={m} className="numeric px-5 py-3 text-right">
                          {row.label === "Loan aging" &&
                          (byMonth.get(m)?.avg_loan_aging ?? 0) > 20 ? (
                            <span className="inline-flex flex-col items-end gap-1">
                              <span>{plain(byMonth.get(m)?.avg_loan_aging, " days")}</span>
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning">
                                <TriangleAlert className="size-3" /> Possible NPL
                              </span>
                            </span>
                          ) : (
                            row.get(byMonth.get(m))
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {availableMonths.length > 0 && (
              <div className="border-t border-border p-5">
                <p className="label-caps">Add other months</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {availableMonths.map((m) => {
                    const active = shownMonths.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() =>
                          setExtraMonths((prev) =>
                            prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
                          )
                        }
                        className={`numeric rounded-full border px-3 py-1 text-xs transition-colors ${
                          active
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {monthLabel(m)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {!phone && (
        <div className="panel mt-12 flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <h2 className="text-sm font-semibold">Keeping the numbers fresh</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload your four daily files and every customer’s monthly figures are recalculated.
            </p>
          </div>
          <Button asChild variant="secondary" className="gap-2">
            <a href="/upload">
              Update data <ArrowRight className="size-4" />
            </a>
          </Button>
        </div>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: string;
  tone?: "primary" | "accent";
  small?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/60 p-4">
      <p className="label-caps">{label}</p>
      <p
        className={`mt-2 font-bold ${small ? "text-sm" : "numeric text-xl"} ${
          tone === "primary" ? "text-primary" : tone === "accent" ? "text-accent" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
