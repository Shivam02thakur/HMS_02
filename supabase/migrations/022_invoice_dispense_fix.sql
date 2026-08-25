-- ============================================================
-- Fixes: medicine stock not dispensing when an invoice is paid,
-- and payment actions (Record Payment / Settle / Mark as paid)
-- failing partway through.
--
-- Root cause: the app code (src/lib/billing.ts) tracks which
-- invoice line items have had their stock dispensed using an
-- `invoice_items.dispensed` column -- but that column was never
-- created in the database. Every payment action calls code that
-- queries/updates this column, so every one of them was failing
-- at the dispense step:
--   - Record Payment / Settle: payment still got saved and the
--     invoice status still updated (those happen first), but the
--     error after that made it look broken and stock was never
--     moved.
--   - Mark as paid: the dispense call wasn't wrapped in its own
--     error handling, so the missing column caused the whole
--     action to fail silently with no page refresh.
--
-- This migration adds the missing column and (re)creates the two
-- stock-movement functions the app calls, so they're guaranteed
-- to exist with the exact signatures the frontend uses and to be
-- atomic (they won't drop stock below zero, and they report
-- success/failure instead of silently doing nothing).
-- ============================================================

-- 1. The missing column itself.
alter table invoice_items
  add column if not exists dispensed boolean not null default false;

-- Speeds up "find undispensed medicine items for this invoice",
-- which runs on every payment action.
create index if not exists idx_invoice_items_invoice_dispensed
  on invoice_items (invoice_id, item_type, dispensed);

-- 2. Stock-out when a medicine line is actually dispensed.
-- Atomic: the row only updates if there's enough stock, so two
-- concurrent dispenses can't push stock_quantity negative.
create or replace function dispense_medicine(
  p_medicine_id uuid,
  p_quantity integer,
  p_prescription_id uuid default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if p_medicine_id is null or p_quantity is null or p_quantity <= 0 then
    return false;
  end if;

  update medicines
  set stock_quantity = stock_quantity - p_quantity,
      updated_at = now()
  where id = p_medicine_id
    and stock_quantity >= p_quantity;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- 3. Reverses a dispense (payment cancelled / invoice reopened).
create or replace function restock_medicine(
  p_medicine_id uuid,
  p_quantity integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if p_medicine_id is null or p_quantity is null or p_quantity <= 0 then
    return false;
  end if;

  update medicines
  set stock_quantity = stock_quantity + p_quantity,
      updated_at = now()
  where id = p_medicine_id;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

grant execute on function dispense_medicine(uuid, integer, uuid) to authenticated;
grant execute on function restock_medicine(uuid, integer) to authenticated;
