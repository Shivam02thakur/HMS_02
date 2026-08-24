-- Recording a payment should update paid_amount and can still move a fresh
-- invoice into PARTIAL, but it should never auto-close an invoice to PAID --
-- that's now a deliberate receptionist action (see the "Mark as Paid" button
-- added to InvoiceDetailPage.tsx). Also stops a payment insert from ever
-- silently downgrading an invoice that was already manually marked PAID.

CREATE OR REPLACE FUNCTION update_invoice_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_paid DECIMAL;
  v_current_status invoice_status;
BEGIN
  SELECT paid_amount + NEW.amount, status
  INTO v_paid, v_current_status
  FROM invoices
  WHERE id = NEW.invoice_id;

  UPDATE invoices
  SET paid_amount = v_paid,
      status = CASE
        WHEN v_current_status = 'PAID' THEN 'PAID'::invoice_status
        WHEN v_paid > 0 THEN 'PARTIAL'::invoice_status
        ELSE 'PENDING'::invoice_status
      END
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;