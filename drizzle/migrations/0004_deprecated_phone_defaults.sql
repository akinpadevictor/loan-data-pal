-- The phone columns on monthly and repayment rows are deprecated (rows are keyed by
-- ref). A default keeps inserts valid now that rows are written per ref.
ALTER TABLE public.customer_months ALTER COLUMN phone SET DEFAULT '';
ALTER TABLE public.customer_repayments ALTER COLUMN phone SET DEFAULT '';