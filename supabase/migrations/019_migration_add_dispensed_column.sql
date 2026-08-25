-- Required migration for invoice_items.dispensed tracking
-- (see comment block at the bottom of src/lib/billing.ts)
alter table invoice_items
  add column if not exists dispensed boolean not null default false;