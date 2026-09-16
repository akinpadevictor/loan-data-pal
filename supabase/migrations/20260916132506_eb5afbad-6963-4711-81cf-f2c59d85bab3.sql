CREATE TABLE public.customers (
  phone TEXT PRIMARY KEY,
  name TEXT,
  ref TEXT,
  state TEXT,
  market TEXT,
  agent TEXT,
  pl_limit NUMERIC,
  pl_balance NUMERIC,
  pos_installed TEXT,
  loan_type TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.customer_months (
  phone TEXT NOT NULL,
  month TEXT NOT NULL,
  loan_count NUMERIC,
  loan_amount NUMERIC,
  avg_loan_aging NUMERIC,
  amount_recovered NUMERIC,
  amount_pending NUMERIC,
  collection_amount NUMERIC,
  collection_active_days NUMERIC,
  pos_active_days NUMERIC,
  pos_collection NUMERIC,
  txn_count NUMERIC,
  repayment_amount NUMERIC,
  repayment_count NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (phone, month)
);

CREATE INDEX idx_customer_months_month ON public.customer_months (month);
CREATE INDEX idx_customers_name ON public.customers (name);

CREATE TABLE public.data_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset TEXT NOT NULL,
  file_name TEXT,
  rows_processed INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.customers TO anon, authenticated;
GRANT SELECT ON public.customer_months TO anon, authenticated;
GRANT SELECT ON public.data_uploads TO anon, authenticated;
GRANT ALL ON public.customers TO service_role;
GRANT ALL ON public.customer_months TO service_role;
GRANT ALL ON public.data_uploads TO service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read customers" ON public.customers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read customer months" ON public.customer_months FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read uploads" ON public.data_uploads FOR SELECT TO anon, authenticated USING (true);