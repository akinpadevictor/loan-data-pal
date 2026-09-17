ALTER TABLE public.customer_months
  ADD COLUMN interest_accrued NUMERIC,
  ADD COLUMN npl_value NUMERIC;