import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { UploadCloud, CheckCircle2, Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { claimAdmin, ingestBatch, recordUpload } from "@/lib/ingest.functions";
import {
  DATASET_LABELS,
  buildCollectionMonths,
  buildCustomers,
  buildLoanMonths,
  buildLoanRisk,
  buildRepaymentMonths,
  detectDataset,
  type Dataset,
  type MonthRow,
} from "@/lib/aggregate";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({
    meta: [
      { title: "Update Data — Credit Lens" },
      {
        name: "description",
        content:
          "Upload the latest Customer Overview, Loan Information, Distributor Detail and Transaction Log files to refresh every customer's monthly figures.",
      },
      { property: "og:title", content: "Update Data — Credit Lens" },
      { property: "og:type", content: "website" },
      {
        property: "og:description",
        content: "Drop in your daily files and the monthly customer figures refresh automatically.",
      },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UploadPage,
});

const BATCH = 400;

type Status = { file: string; dataset: string; rows: number; done: boolean };

function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const send = useServerFn(ingestBatch);
  const log = useServerFn(recordUpload);
  const queryClient = useQueryClient();
  const claim = useServerFn(claimAdmin);

  const access = useQuery({ queryKey: ["admin-access"], queryFn: () => claim({}) });

  const uploads = useQuery({
    queryKey: ["uploads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_uploads")
        .select("dataset, file_name, rows_processed, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setProgress(0);
    setStatuses([]);
    const XLSX = await import("xlsx");

    try {
      const fileList = [...files];
      for (let f = 0; f < fileList.length; f++) {
        const file = fileList[f]!;
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
        if (rows.length === 0) continue;

        const dataset = detectDataset(Object.keys(rows[0]!)) ?? guessFromName(file.name);
        if (!dataset) {
          toast.error(`${file.name}: could not tell which report this is`);
          continue;
        }

        let target: "customers" | "months" | "risk" = "months";
        let payload: Record<string, unknown>[] = [];
        let riskPayload: Record<string, unknown>[] = [];
        if (dataset === "customer_overview") {
          target = "customers";
          payload = buildCustomers(rows) as unknown as Record<string, unknown>[];
        } else if (dataset === "loan_information") {
          payload = buildLoanMonths(rows) as unknown as Record<string, unknown>[];
          riskPayload = buildLoanRisk(rows) as unknown as Record<string, unknown>[];
        } else if (dataset === "distributor_detail") {
          payload = buildCollectionMonths(rows) as unknown as Record<string, unknown>[];
        } else {
          payload = buildRepaymentMonths(rows) as unknown as Record<string, unknown>[];
        }

        for (let i = 0; i < payload.length; i += BATCH) {
          await send({ data: { target, rows: payload.slice(i, i + BATCH) } });
          const fileShare = (i + BATCH) / payload.length;
          setProgress(Math.min(99, ((f + Math.min(fileShare, 1)) / fileList.length) * 100));
        }

        for (let i = 0; i < riskPayload.length; i += BATCH) {
          await send({ data: { target: "risk", rows: riskPayload.slice(i, i + BATCH) } });
        }

        await log({ data: { dataset, fileName: file.name, rows: payload.length } });
        setStatuses((prev) => [
          ...prev,
          { file: file.name, dataset: DATASET_LABELS[dataset], rows: payload.length, done: true },
        ]);
      }

      setProgress(100);
      toast.success("Data updated");
      await queryClient.invalidateQueries();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-5 pb-20 pt-10">
      <p className="label-caps">Daily refresh</p>
      <h1 className="mt-2 text-3xl font-extrabold">Update the data</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Select your latest Customer Overview, Loan Information, Distributor Detail and Transaction
        Log files. You can pick all four at once — each customer’s monthly figures are recalculated
        and replaced.
      </p>

      <div className="panel mt-8 p-6">
        <label
          htmlFor="files"
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface-2/40 px-6 py-12 text-center transition-colors hover:border-primary/60"
        >
          <UploadCloud className="size-8 text-primary" />
          <span className="text-sm font-semibold">Choose Excel files</span>
          <span className="text-xs text-muted-foreground">
            .xlsx files — Customer Overview, Loan Information, Distributor Detail, Transaction Log
          </span>
          <input
            ref={inputRef}
            id="files"
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            className="hidden"
            disabled={busy}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>

        {busy && (
          <div className="mt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Processing… large files can take a few
              minutes. Keep this tab open.
            </div>
            <Progress value={progress} className="mt-3" />
          </div>
        )}

        {statuses.length > 0 && (
          <ul className="mt-6 space-y-2 text-sm">
            {statuses.map((s) => (
              <li key={s.file} className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-positive" />
                <span className="font-medium">{s.dataset}</span>
                <span className="text-muted-foreground">
                  · {s.rows.toLocaleString()} records from {s.file}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel mt-6 p-6">
        <h2 className="text-sm font-semibold">Recent updates</h2>
        {uploads.data && uploads.data.length > 0 ? (
          <ul className="mt-4 divide-y divide-border/60 text-sm">
            {uploads.data.map((u, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 py-2.5">
                <FileSpreadsheet className="size-4 text-muted-foreground" />
                <span className="font-medium">
                  {DATASET_LABELS[u.dataset as Dataset] ?? u.dataset}
                </span>
                <span className="numeric text-xs text-muted-foreground">
                  {(u.rows_processed ?? 0).toLocaleString()} records
                </span>
                <span className="numeric ml-auto text-xs text-muted-foreground">
                  {new Date(u.created_at).toLocaleString("en-GB")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No uploads recorded yet.</p>
        )}
      </div>

      <div className="mt-8">
        <Button asChild variant="secondary">
          <a href="/">Back to lookup</a>
        </Button>
      </div>
    </main>
  );
}

function guessFromName(name: string): Dataset | null {
  const n = name.toLowerCase();
  if (n.includes("customer")) return "customer_overview";
  if (n.includes("loan")) return "loan_information";
  if (n.includes("distributor")) return "distributor_detail";
  if (n.includes("transaction")) return "transaction_log";
  return null;
}

export type { MonthRow };
