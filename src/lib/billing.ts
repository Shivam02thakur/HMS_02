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

  // PAID requires something to have been owed: with totalAmount = 0 (an
  // invoice with no items) `settled >= total - 0.01` is `0 >= -0.01`,
  // which is true, so an empty invoice used to flip to PAID and lock
  // itself the moment its last item was removed. Must stay identical to
  // reconcile_invoice_totals() in migration 040.
  const status: InvoiceStatus =
    totalAmount > 0 && settledAmount >= totalAmount - 0.01
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
 * A fresh id for ONE payment attempt. Sent as payments.client_request_id;
 * the database rejects a second insert carrying the same id for the same
 * invoice (migration 040), so a double-click, a second tab, or a retry
 * after a lost response can never record the same payment twice.
 *
 * crypto.randomUUID() only exists in secure contexts (https / localhost);
 * a hospital intranet served over plain http would throw on it and break
 * payments entirely, hence the fallbacks.
 */
export function newRequestId(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** True when a payments insert failed only because this same attempt was already recorded (Postgres 23505). */
export function isDuplicatePaymentError(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505';
}

/**
 * Deletes an invoice that has no money on it (no payments, no waivers, no
 * dispensed medicine) along with its items. The database function refuses
 * anything else -- deleting a plain invoice row would cascade to payments
 * and erase revenue, so the app never issues a bare DELETE on invoices.
 * Throws an Error with a user-presentable message on refusal.
 */
export async function deleteUnpaidInvoice(invoiceId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_unpaid_invoice', { p_invoice_id: invoiceId });
  if (error) throw new Error(error.message);
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

// ============================================================
// Billing episodes -- one coherent encounter (an admission, an OPD
// visit, or a standalone walk-in), one invoice. See migration
// 035_billing_episodes.sql for why "find the patient's current invoice"
// isn't a safe substitute for this.
// ============================================================

export type EpisodeContext =
  | { episode_type: 'ADMISSION'; patient_id: string; admission_id: string }
  | { episode_type: 'OPD_VISIT'; patient_id: string; appointment_id: string }
  | { episode_type: 'WALK_IN'; patient_id: string };

export interface EpisodeInvoiceResult {
  episodeId: string;
  invoiceId: string;
}

/**
 * Finds the open episode for this admission/appointment/walk-in patient,
 * or creates one (with an empty invoice) if none exists. Called
 * identically from every charge-creating action -- appointment
 * completion, admission creation, ward transfer/discharge billing, a
 * prescribed-medicine purchase -- so they all converge on the same
 * invoice for the same episode rather than each maintaining its own
 * lookup logic.
 *
 * Handles the benign race where two near-simultaneous calls both attempt
 * to create the same episode: the partial unique indexes in migration
 * 035 are exactly what would fire in that case (Postgres error 23505,
 * unique_violation). Rather than failing the whole charge over a race
 * that isn't really an error, this catches that specific case and
 * re-queries for the episode that won.
 */
export async function findOrCreateEpisodeInvoice(
  context: EpisodeContext,
  createdBy?: string
): Promise<EpisodeInvoiceResult | { error: string }> {
  const matchColumn =
    context.episode_type === 'ADMISSION' ? 'admission_id' :
    context.episode_type === 'OPD_VISIT' ? 'appointment_id' :
    null;
  const matchValue =
    context.episode_type === 'ADMISSION' ? context.admission_id :
    context.episode_type === 'OPD_VISIT' ? context.appointment_id :
    null;

  let query = supabase.from('billing_episodes').select('id, invoices(id)').eq('status', 'OPEN');
  if (matchColumn && matchValue) {
    query = query.eq(matchColumn, matchValue);
  } else {
    query = query.eq('patient_id', context.patient_id).eq('episode_type', 'WALK_IN');
  }
  const { data: existing, error: findError } = await query.maybeSingle();
  if (findError) return { error: findError.message };
  if (existing) {
    const invoice = Array.isArray(existing.invoices) ? existing.invoices[0] : existing.invoices;
    if (invoice) return { episodeId: existing.id, invoiceId: (invoice as { id: string }).id };
    // Episode exists but somehow has no invoice yet (shouldn't normally
    // happen -- created together below -- but don't assume): create one.
    const { data: newInvoice, error: invErr } = await supabase.from('invoices').insert({
      patient_id: context.patient_id, episode_id: existing.id, created_by: createdBy,
    }).select('id').single();
    if (invErr || !newInvoice) return { error: invErr?.message || 'Could not create invoice for existing episode.' };
    return { episodeId: existing.id, invoiceId: newInvoice.id };
  }

  const { data: newEpisode, error: createError } = await supabase.from('billing_episodes').insert({
    patient_id: context.patient_id,
    episode_type: context.episode_type,
    admission_id: context.episode_type === 'ADMISSION' ? context.admission_id : null,
    appointment_id: context.episode_type === 'OPD_VISIT' ? context.appointment_id : null,
    created_by: createdBy,
  }).select('id').single();

  if (createError) {
    // 23505 = unique_violation. Another near-simultaneous call won the
    // race and created the episode first -- that's not a failure, it's
    // exactly the case the partial unique indexes exist to catch.
    // Re-query for the episode that won instead of surfacing an error.
    if (createError.code === '23505') {
      return findOrCreateEpisodeInvoice(context, createdBy);
    }
    return { error: createError.message };
  }
  if (!newEpisode) return { error: 'Could not create billing episode.' };

  const { data: newInvoice, error: invErr } = await supabase.from('invoices').insert({
    patient_id: context.patient_id, episode_id: newEpisode.id, created_by: createdBy,
  }).select('id').single();
  if (invErr || !newInvoice) return { error: invErr?.message || 'Could not create invoice for new episode.' };

  return { episodeId: newEpisode.id, invoiceId: newInvoice.id };
}

/**
 * Deliberately simple: sets status = 'CLOSED', nothing else. It never
 * touches invoice payment status -- the two lifecycles (can new charges
 * still land here vs. how much has been paid) are genuinely independent
 * by design, not just by accident.
 */
export async function closeEpisode(episodeId: string): Promise<string | null> {
  const { error } = await supabase.from('billing_episodes')
    .update({ status: 'CLOSED', closed_at: new Date().toISOString() })
    .eq('id', episodeId);
  return error ? error.message : null;
}

/**
 * Computes and inserts the invoice line for a ward-history segment that
 * has just been closed (by a transfer or a discharge -- the bed trigger,
 * migration 036, closes the segment; this is the separate
 * application-level charge computation that follows it). Marks the
 * segment with the resulting invoice_item_id so it's never billed twice.
 */
export async function billClosedWardSegment(admissionId: string, episodeInvoiceId: string): Promise<string | null> {
  const { data: segment, error: segErr } = await supabase
    .from('admission_ward_history')
    .select('id, daily_rate, started_at, ended_at, invoice_item_id, ward:wards(name, ward_type)')
    .eq('admission_id', admissionId)
    .not('ended_at', 'is', null)
    .is('invoice_item_id', null)
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (segErr) return segErr.message;
  if (!segment) return null; // nothing new to bill -- not an error

  const started = new Date(segment.started_at).getTime();
  const ended = new Date(segment.ended_at as string).getTime();
  const days = Math.max(1, Math.ceil((ended - started) / (1000 * 60 * 60 * 24)));
  const ward = Array.isArray(segment.ward) ? segment.ward[0] : segment.ward;

  const { data: item, error: itemErr } = await supabase.from('invoice_items').insert({
    invoice_id: episodeInvoiceId,
    item_type: 'bed_charge',
    description: `Room Charge - ${ward?.name || 'Ward'} (${ward?.ward_type || ''}) x ${days} day${days > 1 ? 's' : ''}`,
    quantity: days,
    unit_price: segment.daily_rate,
    total_price: days * Number(segment.daily_rate),
  }).select('id').single();

  if (itemErr || !item) return itemErr?.message || 'Could not create ward-charge invoice item.';

  const { error: updateErr } = await supabase.from('admission_ward_history')
    .update({ invoice_item_id: item.id })
    .eq('id', segment.id);
  if (updateErr) return updateErr.message;

  // Without this, the invoice's subtotal/total_amount never reflect the
  // charge just inserted above -- it would silently stay at whatever it
  // was before (0 for a freshly-created invoice), forever, since nothing
  // else recomputes it. Caught by checking whether this ever actually
  // got called anywhere in this codebase; it didn't.
  const { error: calcErr } = await supabase.rpc('calculate_invoice_total', { p_invoice_id: episodeInvoiceId });
  if (calcErr) return calcErr.message;

  return null;
}