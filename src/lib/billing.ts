import { supabase } from '@/lib/supabase';
import type { InvoiceStatus } from '@/types';

// ============================================================
// Shared payment / stock reconciliation helpers.
//
// Both BillingPage and InvoiceDetailPage record and cancel payments.
// Previously each screen updated invoice.status (and sometimes
// paid_amount) independently and inconsistently -- which is what let an
// invoice show PAID on one screen and PARTIAL on the other, and let
// "Settle" ask for -- and insert -- a second payment on an invoice that
// was already fully paid, double-counting revenue.
//
// The fix: paid_amount and status are never set directly by a screen.
// They are always recomputed here from the payments table (the actual
// source of truth) after any payment is inserted or deleted, by
// whichever screen did it. Both screens end up looking at the same
// numbers.
// ============================================================

export async function recalcInvoicePaymentState(invoiceId: string, totalAmount: number) {
  const [{ data: pays, error: paysError }, { data: adjs, error: adjsError }] = await Promise.all([
    supabase.from('payments').select('amount').eq('invoice_id', invoiceId),
    supabase.from('invoice_adjustments').select('amount').eq('invoice_id', invoiceId),
  ]);
  if (paysError) throw paysError;
  if (adjsError) throw adjsError;

  const paidAmount = (pays || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  // Waived amounts count toward closing the invoice out, but are tracked
  // in their own column -- paid_amount must only ever reflect money
  // actually collected via the payments table.
  const waivedAmount = (adjs || []).reduce((sum, a) => sum + Number(a.amount || 0), 0);
  const settledAmount = paidAmount + waivedAmount;

  const status: InvoiceStatus =
    settledAmount >= totalAmount - 0.01
      ? 'PAID'
      : settledAmount > 0
      ? 'PARTIAL'
      : 'PENDING';

  const { error: updateError } = await supabase
    .from('invoices')
    .update({ paid_amount: paidAmount, waived_amount: waivedAmount, status })
    .eq('id', invoiceId);
  if (updateError) throw updateError;

  return { paidAmount, waivedAmount, status };
}

/**
 * Records a waiver/adjustment against an invoice's outstanding balance
 * and recalculates the invoice's paid/waived/status fields from the
 * resulting ledger.
 *
 * This is deliberately NOT an insert into the payments table -- a waiver
 * is not money collected, and must never be presented or counted as one.
 * It requires a manually-entered amount (never auto-fills or defaults to
 * "the whole remaining balance") and a non-empty reason, and is
 * server-validated against the *current* outstanding balance
 * (total_amount - paid_amount - waived_amount) at the moment it's
 * recorded, not against whatever the caller's stale local state thinks
 * the balance is.
 *
 * Returns the created adjustment row and the recalculated invoice state.
 */
export async function recordInvoiceAdjustment(
  invoiceId: string,
  amount: number,
  reason: string,
  createdBy: string | undefined,
  adjustmentType: 'WAIVER' | 'WRITE_OFF' | 'DISCOUNT' | 'CORRECTION' = 'WAIVER'
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter a waiver amount greater than 0.');
  }
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Error('A reason is required to record a waiver/adjustment.');
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('total_amount, paid_amount, waived_amount')
    .eq('id', invoiceId)
    .single();
  if (invoiceError) throw invoiceError;
  if (!invoice) throw new Error('Invoice not found.');

  const outstanding = Number(invoice.total_amount) - Number(invoice.paid_amount) - Number(invoice.waived_amount);
  if (amount > outstanding + 0.01) {
    throw new Error(
      `Waiver amount cannot exceed the outstanding balance (${outstanding.toFixed(2)}).`
    );
  }

  const { data: adjustment, error: insertError } = await supabase
    .from('invoice_adjustments')
    .insert({
      invoice_id: invoiceId,
      amount,
      adjustment_type: adjustmentType,
      reason: trimmedReason,
      created_by: createdBy,
    })
    .select()
    .single();
  if (insertError) throw insertError;

  const { status } = await recalcInvoicePaymentState(invoiceId, Number(invoice.total_amount));

  return { adjustment, status };
}

/**
 * Dispenses pharmacy stock for every medicine line on this invoice that
 * hasn't been dispensed yet, and marks those lines as dispensed.
 *
 * Call this only once an invoice actually transitions INTO PAID -- not
 * when a medicine item is first added to the invoice. Returns the ids of
 * any items that failed to dispense (e.g. stock ran out between when the
 * item was added and when the invoice was paid) so the caller can
 * surface that to the user.
 *
 * Relies on an `invoice_items.dispensed boolean not null default false`
 * column -- see the migration note below.
 */
export async function dispenseUndispensedMedicines(invoiceId: string): Promise<string[]> {
  const { data: toDispense, error } = await supabase
    .from('invoice_items')
    .select('id, reference_id, quantity')
    .eq('invoice_id', invoiceId)
    .eq('item_type', 'medicine')
    .eq('dispensed', false);
  // A failed lookup must not be read as "nothing to dispense" -- that
  // would silently skip every medicine item on this invoice while
  // returning an empty (successful-looking) result to the caller.
  if (error) throw error;

  const failedItemIds: string[] = [];
  for (const item of toDispense || []) {
    // quantity is nullable in the schema (legacy rows / a manual insert
    // that skipped it) -- there's no sane amount to dispense for a
    // missing/zero quantity, so treat it the same as a missing
    // reference_id: skip it rather than guessing.
    if (!item.reference_id || !item.quantity) continue;
    const { data: ok, error: dispenseError } = await supabase.rpc('dispense_medicine', {
      p_medicine_id: item.reference_id,
      p_quantity: item.quantity,
    });
    if (dispenseError || !ok) {
      failedItemIds.push(item.id);
      continue;
    }
    // Stock has already left the pharmacy at this point -- if flagging
    // the item fails, the next dispense run would still see
    // dispensed=false and dispense it a second time. Surface that as a
    // failure too instead of leaving it to silently double-dispense.
    const { error: flagError } = await supabase.from('invoice_items').update({ dispensed: true }).eq('id', item.id);
    if (flagError) {
      console.error(`Dispensed item ${item.id} but failed to flag it as dispensed:`, flagError);
      failedItemIds.push(item.id);
    }
  }
  return failedItemIds;
}

/**
 * Reverses dispenseUndispensedMedicines: returns stock to pharmacy for
 * every dispensed medicine line on this invoice and clears the
 * dispensed flag. Call this when a paid invoice's payment/settlement is
 * cancelled and it drops back out of PAID.
 *
 * Returns the ids of any items that failed to restock, mirroring
 * dispenseUndispensedMedicines, so the caller can surface it instead of
 * assuming a silent success.
 */
export async function restockDispensedMedicines(invoiceId: string): Promise<string[]> {
  const { data: dispensedItems, error } = await supabase
    .from('invoice_items')
    .select('id, reference_id, quantity')
    .eq('invoice_id', invoiceId)
    .eq('item_type', 'medicine')
    .eq('dispensed', true);
  if (error) throw error;

  const failedItemIds: string[] = [];
  for (const item of dispensedItems || []) {
    if (!item.reference_id) continue;
    if (!item.quantity) {
      // Flagged dispensed but with no recorded quantity -- we can't know
      // how much stock to return. Surface this as a failure (don't clear
      // the dispensed flag) rather than silently leaving stock unreturned.
      console.error(`Item ${item.id} is dispensed with no quantity recorded; cannot restock.`);
      failedItemIds.push(item.id);
      continue;
    }
    const { data: ok, error: restockError } = await supabase.rpc('restock_medicine', {
      p_medicine_id: item.reference_id,
      p_quantity: item.quantity,
    });
    if (restockError || !ok) {
      // Don't clear the dispensed flag if stock was never actually
      // returned -- otherwise the item looks un-dispensed while the
      // pharmacy is still short that stock, and a future dispense run
      // could hand it out again on top of that.
      console.error(`Failed to restock item ${item.id}:`, restockError);
      failedItemIds.push(item.id);
      continue;
    }
    const { error: flagError } = await supabase.from('invoice_items').update({ dispensed: false }).eq('id', item.id);
    if (flagError) {
      console.error(`Restocked item ${item.id} but failed to clear its dispensed flag:`, flagError);
      failedItemIds.push(item.id);
    }
  }
  return failedItemIds;
}

/**
 * REQUIRED MIGRATION -- run this once against your Supabase DB before
 * deploying, so dispensing is idempotent (an item is never dispensed
 * twice, and cancel/restock only touches items that were actually
 * dispensed):
 *
 *   alter table invoice_items
 *     add column if not exists dispensed boolean not null default false;
 */