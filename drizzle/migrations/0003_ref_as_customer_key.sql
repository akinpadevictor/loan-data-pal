-- REF becomes the unique customer key: one phone number can hold several REFs.
ALTER TABLE public.customers DROP CONSTRAINT customers_pkey;
ALTER TABLE public.customers ADD CONSTRAINT customers_pkey PRIMARY KEY (ref);

-- Loyal Customer figures from Customer Overview (filled when the newer file is uploaded).
ALTER TABLE public.customers ADD COLUMN loyal_customer text;
ALTER TABLE public.customers ADD COLUMN loyal_target numeric;
ALTER TABLE public.customers ADD COLUMN loyal_target_achieved numeric;
ALTER TABLE public.customers ADD COLUMN loyal_pct numeric;

-- Monthly and repayment rows are identified by REF too.
ALTER TABLE public.customer_months DROP CONSTRAINT customer_months_pkey;
ALTER TABLE public.customer_months ADD COLUMN ref text;
ALTER TABLE public.customer_months ADD CONSTRAINT customer_months_pkey PRIMARY KEY (ref, month);

ALTER TABLE public.customer_repayments DROP CONSTRAINT customer_repayments_pkey;
ALTER TABLE public.customer_repayments ADD COLUMN ref text;
ALTER TABLE public.customer_repayments ADD CONSTRAINT customer_repayments_pkey PRIMARY KEY (ref, txn_at, amount);

COMMENT ON COLUMN public.customers.phone IS 'Lookup attribute only: several REFs can share one phone number; ref is the customer key.';
COMMENT ON COLUMN public.customer_months.phone IS 'DEPRECATED: rows are keyed by ref; phone kept only for history.';
COMMENT ON COLUMN public.customer_repayments.phone IS 'DEPRECATED: rows are keyed by ref; phone kept only for history.';