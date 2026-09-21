ALTER TABLE public.customer_months ADD COLUMN IF NOT EXISTS wallet_active_days NUMERIC;

CREATE TABLE IF NOT EXISTS public.customer_repayments (
  phone TEXT NOT NULL,
  txn_at TIMESTAMPTZ NOT NULL,
  amount NUMERIC NOT NULL,
  loan_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (phone, txn_at, amount)
);

GRANT SELECT ON public.customer_repayments TO anon;
GRANT SELECT ON public.customer_repayments TO authenticated;
GRANT ALL ON public.customer_repayments TO service_role;

ALTER TABLE public.customer_repayments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read repayments" ON public.customer_repayments FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS customer_repayments_phone_idx ON public.customer_repayments (phone, txn_at DESC);