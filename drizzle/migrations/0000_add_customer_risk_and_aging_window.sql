ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS onboarding_date DATE,
  ADD COLUMN IF NOT EXISTS total_pending NUMERIC,
  ADD COLUMN IF NOT EXISTS npl_value NUMERIC,
  ADD COLUMN IF NOT EXISTS max_loan_aging NUMERIC;

ALTER TABLE public.customer_months
  ADD COLUMN IF NOT EXISTS aging_sum NUMERIC,
  ADD COLUMN IF NOT EXISTS aging_count NUMERIC;

CREATE INDEX IF NOT EXISTS customers_ref_idx ON public.customers (ref);