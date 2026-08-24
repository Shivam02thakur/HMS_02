-- Billing <-> Pharmacy integration: adding a 'medicine' invoice item now
-- dispenses stock via the existing dispense_medicine() RPC (003_functions.sql),
-- the same atomic stock check already used by the Pharmacy page's own
-- "Dispense" button -- avoids duplicating the stock-check logic and avoids
-- the race condition of reading stock client-side then writing it back.
--
-- restock_medicine() is the mirror image, used when a medicine invoice item
-- is deleted from an invoice -- the stock that was dispensed for it is
-- returned, so removing a billing mistake doesn't leave pharmacy stock short.

CREATE OR REPLACE FUNCTION restock_medicine(
  p_medicine_id UUID,
  p_quantity INTEGER
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE medicines
  SET stock_quantity = stock_quantity + p_quantity
  WHERE id = p_medicine_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;