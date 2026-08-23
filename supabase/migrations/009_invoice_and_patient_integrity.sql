-- 009_invoice_and_patient_integrity.sql
-- Closes a gap where financial/status columns had DB defaults but no NOT NULL
-- constraint, meaning an explicit NULL insert would silently bypass the default.

ALTER TABLE patients ALTER COLUMN patient_code SET NOT NULL;

ALTER TABLE invoices ALTER COLUMN subtotal SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN discount SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN total_amount SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN paid_amount SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN status SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN invoice_date SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN created_at SET NOT NULL;