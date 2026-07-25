-- ===== Invoicing module tables =====

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  work_order_id text not null unique references public.work_orders(id) on delete restrict,
  invoice_code text not null unique,
  invoice_date date not null,
  month_year text not null,
  client_name text not null,
  client_code text not null,
  billing_type text not null check (billing_type in ('mass_production','sample_production')),
  billing_type_code text not null check (billing_type_code in ('MP','SP')),
  pcs_manual integer not null check (pcs_manual > 0),
  pcs_linked integer not null check (pcs_linked > 0),
  pcs_balance_status text not null check (pcs_balance_status in ('Balance','Tidak Balance')),
  pcs_difference integer not null,
  unit_price integer not null check (unit_price > 0),
  total_amount integer not null check (total_amount > 0),
  rate_manpower integer not null default 30000 check (rate_manpower >= 0),
  rate_operational integer not null,
  total_income_manpower integer not null,
  total_income_operational integer not null,
  finance_validation text not null check (finance_validation in ('Need Register Invoice','Collect Payment','Partial Paid','Paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_invoice_date_idx on public.invoices (invoice_date desc);
create index if not exists invoices_client_code_idx on public.invoices (client_code);

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  payment_type text not null check (payment_type in ('cash','termin')),
  termin_no integer,
  payment_date date not null,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoice_payments_invoice_id_idx on public.invoice_payments (invoice_id);

create table if not exists public.invoice_payment_files (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.invoice_payments(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_url text not null,
  uploaded_at timestamptz not null default now()
);

create index if not exists invoice_payment_files_payment_id_idx on public.invoice_payment_files (payment_id);

-- ===== Storage bucket =====
insert into storage.buckets (id, name, public)
values ('invoice-payment-proofs', 'invoice-payment-proofs', true)
on conflict (id) do nothing;
