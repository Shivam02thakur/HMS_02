import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import type { Invoice, InvoiceItem, Payment, InvoiceAdjustment, Medicine, LabTest, Doctor, Ward } from '@/types';
import {
  ArrowLeft, Plus, Trash2, Receipt, User, IndianRupee, CheckCircle, AlertTriangle,
  Printer, Phone, StickyNote, Pill, FlaskConical, Stethoscope, BedDouble, FileText, ChevronDown, MinusCircle,
} from 'lucide-react';
import { formatDate, formatCurrency, getStatusColor, getStatusLabel } from '@/lib/utils';
import { recalcInvoicePaymentState, dispenseUndispensedMedicines, restockDispensedMedicines, recordInvoiceAdjustment } from '@/lib/billing';

type ItemType = 'medicine' | 'lab_test' | 'consultation' | 'bed_charge' | 'other';

interface RxItemOption {
  id: string;
  medicineId: string;
  medicineName: string;
  prescriptionNumber: string;
  cap: number;
  remaining: number;
}

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  medicine: 'Medicine',
  lab_test: 'Lab Test',
  consultation: 'Consultation',
  bed_charge: 'Room / Bed',
  other: 'Other',
};

const ITEM_TYPE_ICONS: Record<ItemType, typeof Pill> = {
  medicine: Pill,
  lab_test: FlaskConical,
  consultation: Stethoscope,
  bed_charge: BedDouble,
  other: FileText,
};

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isReceptionist } = useRole();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [adjustments, setAdjustments] = useState<InvoiceAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showWaiverModal, setShowWaiverModal] = useState(false);

  // Reference data for auto-priced billing items
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [labTests, setLabTests] = useState<LabTest[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);

  const todayIso = () => new Date().toISOString().slice(0, 10);
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_mode: 'Cash', transaction_id: '', notes: '', payment_date: todayIso() });
  const [paymentError, setPaymentError] = useState<string | null>(null);
  // Per-payment "Cancel" action (voids a single recorded payment)
  const [cancellingPaymentId, setCancellingPaymentId] = useState<string | null>(null);
  // Secondary "More" menu next to Record Payment, houses the rare
  // waive/adjust action so it isn't a one-click option sitting next to
  // real payment recording.
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [waiverForm, setWaiverForm] = useState({ amount: '', reason: '' });
  const [waiverError, setWaiverError] = useState<string | null>(null);
  const [waiverSubmitting, setWaiverSubmitting] = useState(false);

  useEffect(() => { if (id) fetchData(); }, [id]);

  async function fetchData() {
    if (!id) return;
    setLoading(true);
    const [{ data: inv }, { data: it }, { data: pay }, { data: adj }, { data: meds }, { data: tests }, { data: docs }, { data: wds }] = await Promise.all([
      supabase.from('invoices').select('*, patient:patients(*)').eq('id', id).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', id).order('created_at'),
      supabase.from('payments').select('*').eq('invoice_id', id).order('paid_at'),
      supabase.from('invoice_adjustments').select('*, created_by_profile:profiles(full_name)').eq('invoice_id', id).order('created_at'),
      supabase.from('medicines').select('id, name, unit_price, stock_quantity').gt('stock_quantity', 0).order('name'),
      supabase.from('lab_tests').select('id, name, code, price').order('name'),
      supabase.from('doctors').select('id, full_name, consultation_fee').eq('is_active', true).order('full_name'),
      supabase.from('wards').select('id, name, ward_type, daily_rate').order('name'),
    ]);
    setInvoice(inv as unknown as Invoice | null);
    setItems((it || []) as unknown as InvoiceItem[]);
    setPayments((pay || []) as unknown as Payment[]);
    setAdjustments((adj || []) as unknown as InvoiceAdjustment[]);
    setMedicines((meds || []) as unknown as Medicine[]);
    setLabTests((tests || []) as unknown as LabTest[]);
    setDoctors((docs || []) as unknown as Doctor[]);
    setWards((wds || []) as unknown as Ward[]);
    setLoading(false);
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !invoice) return;
    setPaymentError(null);

    const amount = parseFloat(paymentForm.amount);
    if (!amount || amount <= 0) {
      setPaymentError('Enter a valid amount.');
      return;
    }

    const { error } = await supabase.from('payments').insert({
      invoice_id: id,
      amount,
      payment_mode: paymentForm.payment_mode as any,
      transaction_id: paymentForm.transaction_id || undefined,
      notes: paymentForm.notes,
      received_by: user?.id,
      paid_at: paymentForm.payment_date ? new Date(paymentForm.payment_date).toISOString() : undefined,
    });

    if (error) {
      console.error('Failed to record payment:', error);
      setPaymentError(error.message);
      return;
    }

    const wasPaid = invoice.status === 'PAID';

    try {
      // Recompute paid_amount and status from the payments table itself
      // -- this is what keeps this page and the Billing list agreeing on
      // how much has actually been paid. Previously this handler never
      // updated paid_amount/status at all, so a full payment recorded
      // here could still show as PARTIAL on the Billing page, and
      // "Settle" there would ask for the balance again and insert a
      // second payment, double-counting revenue.
      const { status: newStatus } = await recalcInvoicePaymentState(id, Number(invoice.total_amount));

      // Dispense medicine stock now that the invoice is actually paid in
      // full -- not when the items were originally added.
      if (newStatus === 'PAID' && !wasPaid) {
        const failed = await dispenseUndispensedMedicines(id);
        if (failed.length > 0) {
          console.error('Some medicine items could not be dispensed:', failed);
          setPaymentError('Payment recorded, but some medicine items could not be dispensed (check pharmacy stock).');
        }
      }
    } catch (recalcErr: any) {
      console.error('Payment recorded, but failed to update invoice totals:', recalcErr);
      setPaymentError(`Payment recorded, but the invoice totals couldn't be updated: ${recalcErr.message || recalcErr}`);
    }

    setShowPaymentModal(false);
    setPaymentForm({ amount: '', payment_mode: 'Cash', transaction_id: '', notes: '', payment_date: todayIso() });
    fetchData();
  }

  // Voids a single recorded payment (e.g. entered by mistake, wrong
  // amount, wrong invoice). Recalculates paid_amount/status from what's
  // left, and if that drops the invoice out of PAID, returns any
  // already-dispensed medicine stock to pharmacy.
  async function cancelPayment(payment: Payment) {
    if (!id || !invoice) return;
    if (!window.confirm(`Cancel this payment of ${formatCurrency(payment.amount)}? This cannot be undone.`)) return;
    setPaymentError(null);
    setCancellingPaymentId(payment.id);

    const wasPaid = invoice.status === 'PAID';

    const { error } = await supabase.from('payments').delete().eq('id', payment.id);
    if (error) {
      console.error('Failed to cancel payment:', error);
      setPaymentError(error.message);
      setCancellingPaymentId(null);
      return;
    }

    try {
      const { status: newStatus } = await recalcInvoicePaymentState(id, Number(invoice.total_amount));
      if (wasPaid && newStatus !== 'PAID') {
        const failed = await restockDispensedMedicines(id);
        if (failed.length > 0) {
          console.error('Some medicine items could not be restocked:', failed);
          setPaymentError('Payment cancelled, but some medicine items could not be restocked (check pharmacy stock).');
        }
      }
    } catch (recalcErr: any) {
      console.error('Payment cancelled, but failed to update invoice totals:', recalcErr);
      setPaymentError(`Payment cancelled, but the invoice totals couldn't be updated: ${recalcErr.message || recalcErr}`);
    }

    setCancellingPaymentId(null);
    fetchData();
  }

  // Opens the waiver modal, pre-clearing any stale amount/reason/error
  // from a previous attempt.
  function openWaiverModal() {
    setShowMoreMenu(false);
    setWaiverForm({ amount: '', reason: '' });
    setWaiverError(null);
    setShowWaiverModal(true);
  }

  // Records a manually-entered waiver/adjustment against the outstanding
  // balance. Deliberately does NOT default the amount field to the full
  // remaining balance -- the user must type the amount they intend to
  // waive. Validated both here (fast feedback) and again inside
  // recordInvoiceAdjustment against the invoice's live outstanding
  // balance (source of truth, in case it changed since this page loaded).
  async function submitWaiver(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !invoice) return;
    setWaiverError(null);

    const amount = parseFloat(waiverForm.amount);
    if (!waiverForm.amount || !Number.isFinite(amount) || amount <= 0) {
      setWaiverError('Enter a waiver amount greater than 0.');
      return;
    }
    if (amount > remaining + 0.01) {
      setWaiverError(`Waiver amount cannot exceed the outstanding balance (${formatCurrency(remaining)}).`);
      return;
    }
    if (!waiverForm.reason.trim()) {
      setWaiverError('Enter a reason for this waiver/adjustment.');
      return;
    }

    setWaiverSubmitting(true);
    const wasPaid = invoice.status === 'PAID';

    try {
      const { status: newStatus } = await recordInvoiceAdjustment(id, amount, waiverForm.reason, user?.id);

      // Same rule as payments: only dispense pharmacy stock the moment
      // the invoice actually becomes fully settled, and only once.
      if (newStatus === 'PAID' && !wasPaid) {
        const failed = await dispenseUndispensedMedicines(id);
        if (failed.length > 0) {
          console.error('Some medicine items could not be dispensed:', failed);
          setPaymentError('Waiver recorded, but some medicine items could not be dispensed (check pharmacy stock).');
        }
      }
    } catch (err: any) {
      console.error('Failed to record waiver:', err);
      setWaiverError(err.message || String(err));
      setWaiverSubmitting(false);
      return;
    }

    setWaiverSubmitting(false);
    setShowWaiverModal(false);
    setWaiverForm({ amount: '', reason: '' });
    fetchData();
  }

  async function deleteItem(itemId: string) {
    const item = items.find(i => i.id === itemId);
    if (!window.confirm(`Remove "${item?.description || 'this item'}" from the invoice?`)) return;

    await supabase.from('invoice_items').delete().eq('id', itemId);

    // Medicine stock is only dispensed once the invoice is actually PAID
    // (see dispenseUndispensedMedicines in @/lib/billing), and items can
    // only be removed while the invoice isn't PAID yet -- so nothing has
    // been dispensed for this item and there's no stock to return here.
    if (id) {
      await supabase.rpc('calculate_invoice_total', { p_invoice_id: id });

      // Removing an item changes total_amount, and paid_amount doesn't
      // move with it -- so a PARTIAL invoice can end up fully covered by
      // payments already on file (e.g. remove a big-ticket item after a
      // partial payment) and needs to be recomputed into PAID here, same
      // as after recording/cancelling a payment. Deletion is only
      // possible while status !== PAID, so this is always a fresh
      // transition into PAID, never out of it -- dispense any medicine
      // items that are still owed.
      const { data: refreshed } = await supabase.from('invoices').select('total_amount').eq('id', id).single();
      if (refreshed) {
        try {
          const { status: newStatus } = await recalcInvoicePaymentState(id, Number(refreshed.total_amount));
          if (newStatus === 'PAID') {
            const failed = await dispenseUndispensedMedicines(id);
            if (failed.length > 0) {
              console.error('Some medicine items could not be dispensed:', failed);
              setPaymentError('Item removed, but some medicine items could not be dispensed (check pharmacy stock).');
            }
          }
        } catch (recalcErr: any) {
          console.error('Item removed, but failed to update invoice totals:', recalcErr);
          setPaymentError(`Item removed, but the invoice totals couldn't be updated: ${recalcErr.message || recalcErr}`);
        }
      }
    }
    fetchData();
  }

  if (loading) return <div className="flex h-96 items-center justify-center">Loading...</div>;
  if (!invoice) return <div className="flex h-96 items-center justify-center">Invoice not found</div>;

  const remaining = invoice.total_amount - invoice.paid_amount - Number(invoice.waived_amount || 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <button onClick={() => navigate('/billing')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Back to Billing
        </button>
        <button onClick={() => window.print()} className="btn-secondary text-xs py-1.5 px-3">
          <Printer className="h-3.5 w-3.5 mr-1" /> Print
        </button>
      </div>

      <div className="card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary-600" />
              <h1 className="text-xl font-bold text-gray-900">{invoice.invoice_number}</h1>
            </div>
            <p className="text-sm text-gray-500 mt-1">{formatDate(invoice.invoice_date)}</p>
            <div className="mt-2 flex items-center gap-2">
              <User className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium">{invoice.patient?.full_name}</span>
              {invoice.patient?.patient_code && (
                <span className="text-xs text-gray-400 font-mono">({invoice.patient.patient_code})</span>
              )}
            </div>
            {invoice.patient?.phone && (
              <div className="mt-1 flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600">{invoice.patient.phone}</span>
              </div>
            )}
          </div>
          <div className="text-right">
            <span className={`badge ${getStatusColor(invoice.status)}`}>{getStatusLabel(invoice.status)}</span>
            <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(invoice.total_amount)}</p>
            <p className="text-sm text-gray-500">Paid: {formatCurrency(invoice.paid_amount)}</p>
            {invoice.waived_amount > 0 && <p className="text-sm text-gray-500">Waived: {formatCurrency(invoice.waived_amount)}</p>}
            {remaining > 0 && <p className="text-sm text-red-600">Due: {formatCurrency(remaining)}</p>}
          </div>
        </div>
        {invoice.notes && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-gray-50 p-3 border-t border-gray-100 pt-3">
            <StickyNote className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600">{invoice.notes}</p>
          </div>
        )}
        {invoice.status === 'PAID' && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            This invoice is fully paid and closed. Items can no longer be edited. Use "Cancel" on a payment below to reopen it.
          </div>
        )}
      </div>

      {/* Invoice Items */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Items</h2>
          {isReceptionist() && invoice.status !== 'PAID' && (
            <button onClick={() => setShowItemModal(true)} className="btn-primary text-xs py-1.5 px-3 print:hidden">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
            </button>
          )}
        </div>
        {items.length === 0 ? <p className="text-center text-gray-500 py-4">No items added</p> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Item / Service</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">Qty</th>
                  <th className="table-header">Unit Price</th>
                  <th className="table-header">Total</th>
                  <th className="table-header text-right print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const TypeIcon = item.item_type ? ITEM_TYPE_ICONS[item.item_type as ItemType] : null;
                  return (
                    <tr key={item.id}>
                      <td className="table-cell">
                        {item.description}
                      </td>
                      <td className="table-cell">
                        {item.item_type && (
                          <span className="badge bg-gray-100 text-gray-600 inline-flex items-center gap-1">
                            {TypeIcon && <TypeIcon className="h-3 w-3" />}
                            {ITEM_TYPE_LABELS[item.item_type as ItemType] || item.item_type}
                          </span>
                        )}
                      </td>
                      <td className="table-cell">{item.quantity}</td>
                      <td className="table-cell">{formatCurrency(item.unit_price)}</td>
                      <td className="table-cell font-medium">{formatCurrency(item.total_price)}</td>
                      <td className="table-cell text-right print:hidden">
                        {isReceptionist() && invoice.status !== 'PAID' && (
                          <button onClick={() => deleteItem(item.id)} className="p-1 text-gray-400 hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {/* {items.some(i => i.item_type === 'medicine') && invoice.status !== 'PAID' && (
          <p className="mt-3 text-xs text-gray-400">
            Medicine stock is reserved but not yet dispensed from pharmacy — it dispenses automatically once this invoice is fully paid.
          </p>
        )} */}

        {/* Totals + primary payment action, together so the numbers that
            justify "Record Payment" sit right next to the button. */}
        {items.length > 0 && (
          <div className="mt-4 flex justify-end border-t border-gray-100 pt-4">
            <div className="w-full max-w-xs space-y-1.5">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span>{formatCurrency(invoice.subtotal)}</span>
              </div>
              {invoice.discount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount</span>
                  <span>-{formatCurrency(invoice.discount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-100 pt-1.5 text-base font-bold text-gray-900">
                <span>Total</span>
                <span>{formatCurrency(invoice.total_amount)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Paid</span>
                <span>{formatCurrency(invoice.paid_amount)}</span>
              </div>
              {invoice.waived_amount > 0 && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Waived</span>
                  <span>{formatCurrency(invoice.waived_amount)}</span>
                </div>
              )}
              <div className={`flex justify-between border-t border-gray-100 pt-1.5 text-base font-bold ${remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                <span>Balance Due</span>
                <span>{formatCurrency(Math.max(remaining, 0))}</span>
              </div>

              {isReceptionist() && invoice.status !== 'PAID' && (
                <div className="flex items-center justify-end gap-2 pt-3 print:hidden">
                  <button
                    onClick={() => { setPaymentForm({...paymentForm, amount: remaining.toString(), payment_date: todayIso()}); setShowPaymentModal(true); }}
                    className="btn-primary text-xs py-1.5 px-3"
                  >
                    <IndianRupee className="h-3.5 w-3.5 mr-1" /> Record Payment
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setShowMoreMenu(v => !v)}
                      className="btn-secondary text-xs py-1.5 px-2.5"
                    >
                      More <ChevronDown className="h-3.5 w-3.5 ml-1" />
                    </button>
                    {showMoreMenu && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowMoreMenu(false)} />
                        <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                          <button
                            onClick={openWaiverModal}
                            className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                          >
                            Waive / Adjust Balance
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Payments */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Payments</h2>
        {payments.length === 0 ? <p className="text-center text-gray-500 py-4">No payments recorded</p> : (
          <div className="space-y-2">
            {payments.map(pay => (
              <div key={pay.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <div>
                    <p className="text-sm font-medium">{formatCurrency(pay.amount)}</p>
                    <p className="text-xs text-gray-500">{pay.payment_mode} | {formatDate(pay.paid_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 print:hidden">
                  {pay.transaction_id && <span className="text-xs text-gray-400">{pay.transaction_id}</span>}
                  {/* Voids this specific payment -- e.g. wrong amount, wrong
                      invoice, or recorded by mistake. Available regardless of
                      invoice status, since a paid invoice may need reopening
                      to correct an error. */}
                  {isReceptionist() && (
                    <button
                      onClick={() => cancelPayment(pay)}
                      disabled={cancellingPaymentId === pay.id}
                      className="text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                    >
                      {cancellingPaymentId === pay.id ? 'Cancelling...' : 'Cancel'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Adjustments / Waivers -- kept entirely separate from Payments so
          waived amounts are never mistaken for money collected. */}
      {adjustments.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Adjustments &amp; Waivers</h2>
          <div className="space-y-2">
            {adjustments.map(adj => (
              <div key={adj.id} className="flex items-start justify-between rounded-lg bg-orange-50 p-3">
                <div className="flex items-start gap-2">
                  <MinusCircle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {formatCurrency(adj.amount)}
                      <span className="ml-2 badge bg-orange-100 text-orange-700 text-[10px]">{adj.adjustment_type}</span>
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">{adj.reason}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDate(adj.created_at)}
                      {adj.created_by_profile?.full_name && ` · by ${adj.created_by_profile.full_name}`}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AddItemModal
        isOpen={showItemModal}
        onClose={() => setShowItemModal(false)}
        invoiceId={id!}
        patientId={invoice?.patient_id}
        medicines={medicines}
        labTests={labTests}
        doctors={doctors}
        wards={wards}
        onAdded={fetchData}
      />

      <Modal isOpen={showPaymentModal} onClose={() => { setShowPaymentModal(false); setPaymentError(null); }} title="Record Payment" size="sm">
        <form onSubmit={recordPayment} className="space-y-4">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">Outstanding Amount</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(Math.max(remaining, 0))}</p>
          </div>
          <div>
            <label className="label">Amount *</label>
            <input type="number" step="0.01" required value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} className="input" />
          </div>
          <div>
            <label className="label">Payment Method *</label>
            <select value={paymentForm.payment_mode} onChange={e => setPaymentForm({...paymentForm, payment_mode: e.target.value})} className="input">
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Card">Card</option>
            </select>
          </div>
          <div>
            <label className="label">Transaction ID</label>
            <input value={paymentForm.transaction_id} onChange={e => setPaymentForm({...paymentForm, transaction_id: e.target.value})} className="input" placeholder="Optional" />
          </div>
          <div>
            <label className="label">Payment Date *</label>
            <input type="date" required max={todayIso()} value={paymentForm.payment_date} onChange={e => setPaymentForm({...paymentForm, payment_date: e.target.value})} className="input" />
          </div>
          {paymentError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {paymentError}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setShowPaymentModal(false); setPaymentError(null); }} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Record</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showWaiverModal} onClose={() => { setShowWaiverModal(false); setWaiverError(null); }} title="Waive / Adjust Balance" size="sm">
        <form onSubmit={submitWaiver} className="space-y-4">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">Outstanding Balance</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(Math.max(remaining, 0))}</p>
          </div>
          <div>
            <label className="label">Waiver Amount *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={remaining > 0 ? remaining : undefined}
              required
              value={waiverForm.amount}
              onChange={e => setWaiverForm({...waiverForm, amount: e.target.value})}
              className="input"
              placeholder="0.00"
            />
            {/* <p className="mt-1 text-xs text-gray-400">
              Enter the exact amount to waive — it will never auto-fill the full balance. Must be greater than 0 and cannot exceed {formatCurrency(Math.max(remaining, 0))}.
            </p> */}
          </div>
          <div>
            <label className="label">Reason / Description *</label>
            <textarea
              required
              value={waiverForm.reason}
              onChange={e => setWaiverForm({...waiverForm, reason: e.target.value})}
              className="input"
              rows={3}
              placeholder="e.g. Goodwill discount for delayed treatment, billing correction, etc."
            />
          </div>
          {waiverError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {waiverError}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setShowWaiverModal(false); setWaiverError(null); }} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={waiverSubmitting} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              {waiverSubmitting ? 'Recording...' : 'Record Waiver'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ============================================================
// Add Item modal — type-first flow, price always DB-derived
// except for the free-text "Other" type.
//
// Medicine stock is NOT dispensed here anymore. Adding a medicine line
// only records the intended quantity on the invoice; the actual
// dispense_medicine call happens once the invoice is fully paid (see
// dispenseUndispensedMedicines in @/lib/billing, called from
// recordPayment / handlePayment / markAsPaid). This means stock isn't
// hard-reserved the moment an item is added -- the "Insufficient stock"
// check below is a best-effort warning against the last-known stock
// figures, not a guaranteed reservation.
//
// On a successful add, the modal stays open (resets only the
// selection/search/quantity fields, keeps the chosen Type) so several
// items of the same type can be added back-to-back without reopening it.
// ============================================================
function AddItemModal({
  isOpen, onClose, invoiceId, patientId, medicines, labTests, doctors, wards, onAdded,
}: {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string;
  patientId?: string;
  medicines: Medicine[];
  labTests: LabTest[];
  doctors: Doctor[];
  wards: Ward[];
  onAdded: () => void;
}) {
  const { user } = useAuth();
  const { isPharmacist, isAdmin } = useRole();
  const canOverrideQuantity = isPharmacist() || isAdmin();

  const [itemType, setItemType] = useState<ItemType>('medicine');
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [otherDescription, setOtherDescription] = useState('');
  const [otherPrice, setOtherPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  // Prescription-linked purchase: lets a medicine purchase trace back to
  // the exact prescribed line it came from, so the remaining-quantity cap
  // is enforced per prescription LINE, not per medicine in general (the
  // same drug on two different prescriptions is two separate allowances).
  // Purely optional -- this modal also handles ad-hoc, non-prescription
  // medicine sales, which have no cap at all.
  const [rxItems, setRxItems] = useState<RxItemOption[]>([]);
  const [selectedRxItemId, setSelectedRxItemId] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  useEffect(() => {
    if (!isOpen || itemType !== 'medicine' || !patientId) {
      setRxItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      // Every not-yet-superseded prescription's medicine lines for this
      // patient that actually have a quantity cap recorded (NULL-quantity
      // lines predate this feature and stay uncapped/unlinkable here).
      const { data: pItems, error: pItemsError } = await supabase
        .from('prescription_items')
        .select('id, medicine_id, quantity, medicine:medicines(name), prescription:prescriptions!inner(id, prescription_number, patient_id, superseded_by)')
        .eq('prescription.patient_id', patientId)
        .is('prescription.superseded_by', null)
        .not('quantity', 'is', null);

      if (pItemsError || !pItems || pItems.length === 0) {
        if (pItemsError) console.error('Failed to load prescription items for linking:', pItemsError);
        if (!cancelled) setRxItems([]);
        return;
      }

      const ids = pItems.map((pi: any) => pi.id);
      const { data: purchased, error: purchasedError } = await supabase
        .from('invoice_items')
        .select('prescription_item_id, quantity')
        .in('prescription_item_id', ids);
      if (purchasedError) console.error('Failed to load prior purchases against these prescriptions:', purchasedError);

      const purchasedByItem = new Map<string, number>();
      (purchased || []).forEach((row: any) => {
        purchasedByItem.set(row.prescription_item_id, (purchasedByItem.get(row.prescription_item_id) || 0) + (row.quantity || 0));
      });

      const options: RxItemOption[] = pItems.map((pi: any) => {
        const cap = pi.quantity as number;
        const alreadyPurchased = purchasedByItem.get(pi.id) || 0;
        return {
          id: pi.id,
          medicineId: pi.medicine_id,
          medicineName: pi.medicine?.name || 'Unknown medicine',
          prescriptionNumber: pi.prescription?.prescription_number || '—',
          cap,
          remaining: Math.max(0, cap - alreadyPurchased),
        };
      });
      if (!cancelled) setRxItems(options);
    })();
    return () => { cancelled = true; };
  }, [isOpen, itemType, patientId]);

  const selectedRxItem = rxItems.find(r => r.id === selectedRxItemId);

  function resetSelection() {
    setSearch('');
    setDropdownOpen(false);
    setSelectedId('');
    setQuantity('1');
    setOtherDescription('');
    setOtherPrice('');
    setSubmitError(null);
    setSelectedRxItemId('');
    setOverrideReason('');
  }

  function handleClose() {
    resetSelection();
    setItemType('medicine');
    setJustAdded(null);
    onClose();
  }

  function handleTypeChange(t: ItemType) {
    setItemType(t);
    resetSelection();
    setJustAdded(null);
  }

  function handleRxItemChange(rxItemId: string) {
    setSelectedRxItemId(rxItemId);
    setOverrideReason('');
    const rxItem = rxItems.find(r => r.id === rxItemId);
    if (rxItem) {
      setSelectedId(rxItem.medicineId);
      setDropdownOpen(false);
      setSearch('');
    }
  }

  const selectedMedicine = medicines.find(m => m.id === selectedId);
  const selectedLabTest = labTests.find(t => t.id === selectedId);
  const selectedDoctor = doctors.find(d => d.id === selectedId);
  const selectedWard = wards.find(w => w.id === selectedId);

  const filteredMedicines = useMemo(
    () => medicines.filter(m => m.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8),
    [medicines, search]
  );
  const filteredLabTests = useMemo(
    () => labTests.filter(t => t.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8),
    [labTests, search]
  );

  // Derived: description / unit price / effective quantity / reference_id for the current selection.
  const computed = useMemo(() => {
    switch (itemType) {
      case 'medicine':
        if (!selectedMedicine) return null;
        return {
          description: selectedMedicine.name,
          unit_price: selectedMedicine.unit_price,
          quantity: Math.max(1, parseInt(quantity) || 1),
          reference_id: selectedMedicine.id,
        };
      case 'lab_test':
        if (!selectedLabTest) return null;
        return { description: selectedLabTest.name, unit_price: selectedLabTest.price, quantity: 1, reference_id: selectedLabTest.id };
      case 'consultation':
        if (!selectedDoctor) return null;
        return {
          description: `Consultation - Dr. ${selectedDoctor.full_name}`,
          unit_price: selectedDoctor.consultation_fee,
          quantity: 1,
          reference_id: selectedDoctor.id,
        };
      case 'bed_charge': {
        if (!selectedWard) return null;
        const days = Math.max(1, parseInt(quantity) || 1);
        return {
          description: `Room Charge - ${selectedWard.name} (${selectedWard.ward_type}) x ${days} day${days > 1 ? 's' : ''}`,
          unit_price: selectedWard.daily_rate,
          quantity: days,
          reference_id: selectedWard.id,
        };
      }
      case 'other': {
        if (!otherDescription.trim()) return null;
        const price = parseFloat(otherPrice);
        if (isNaN(price)) return null;
        return { description: otherDescription.trim(), unit_price: price, quantity: Math.max(1, parseInt(quantity) || 1), reference_id: null as string | null };
      }
    }
  }, [itemType, selectedMedicine, selectedLabTest, selectedDoctor, selectedWard, quantity, otherDescription, otherPrice]);

  const total = computed ? computed.quantity * computed.unit_price : 0;
  const insufficientStock = itemType === 'medicine' && selectedMedicine && computed ? computed.quantity > selectedMedicine.stock_quantity : false;

  // Default, self-service-safe path: a purchase can't exceed what's left
  // on the linked prescription line. The exception is a deliberate,
  // auditable override -- pharmacist/admin only, requires a reason -- for
  // cases like lost or damaged medication where the patient has a genuine
  // ongoing need beyond what was originally capped.
  const exceedsRemaining = itemType === 'medicine' && selectedRxItem && computed ? computed.quantity > selectedRxItem.remaining : false;
  const needsOverride = exceedsRemaining;
  const overrideProvided = needsOverride && canOverrideQuantity && overrideReason.trim().length > 0;

  const canSubmit = computed !== null && total > 0 && !insufficientStock && (!needsOverride || overrideProvided);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!computed || !canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    const overrideFields = overrideProvided
      ? { quantity_override_reason: overrideReason.trim(), quantity_override_by: user?.id, quantity_override_at: new Date().toISOString() }
      : {};

    const { error: insertError } = await supabase
      .from('invoice_items')
      .insert({
        invoice_id: invoiceId,
        description: computed.description,
        quantity: computed.quantity,
        unit_price: computed.unit_price,
        total_price: computed.quantity * computed.unit_price,
        item_type: itemType,
        reference_id: computed.reference_id,
        prescription_item_id: itemType === 'medicine' ? (selectedRxItemId || null) : null,
        ...overrideFields,
      });

    if (insertError) {
      console.error('Failed to add invoice item:', insertError);
      setSubmitError(insertError.message);
      setSubmitting(false);
      return;
    }

    const { error: rpcError } = await supabase.rpc('calculate_invoice_total', { p_invoice_id: invoiceId });
    if (rpcError) {
      console.error('Failed to recalculate invoice total:', rpcError);
      setSubmitError(`Item saved, but totals didn't update: ${rpcError.message}`);
      setSubmitting(false);
      onAdded();
      return;
    }

    // Stay open on the same Type so the user can keep adding items
    // (e.g. several medicines in a row) without reopening the modal.
    const addedLabel = computed.description;
    setSubmitting(false);
    resetSelection();
    onAdded();
    setJustAdded(addedLabel);
    setTimeout(() => setJustAdded(null), 2000);
  }

  const showQuantity = itemType !== 'lab_test' && itemType !== 'consultation';
  const quantityLabel = itemType === 'bed_charge' ? 'Days' : 'Quantity';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Billing Item" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {justAdded && (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            Added "{justAdded}". Add another {ITEM_TYPE_LABELS[itemType].toLowerCase()} or click Done when finished.
          </div>
        )}

        <div>
          <label className="label">Type *</label>
          <select value={itemType} onChange={e => handleTypeChange(e.target.value as ItemType)} className="input">
            <option value="medicine">Medicine</option>
            <option value="lab_test">Lab Test</option>
            <option value="consultation">Consultation</option>
            <option value="bed_charge">Room / Bed</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Medicine */}
        {itemType === 'medicine' && (
          <div>
            {rxItems.length > 0 && (
              <div className="mb-3">
                <label className="label">Link to Prescription (optional)</label>
                <select value={selectedRxItemId} onChange={e => handleRxItemChange(e.target.value)} className="input">
                  <option value="">Not linked to a prescription</option>
                  {rxItems.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.prescriptionNumber} · {r.medicineName} — {r.remaining} of {r.cap} remaining
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-400">
                  Linking checks this purchase against what's left on that specific prescription line.
                </p>
              </div>
            )}
            <label className="label">Medicine *</label>
            {selectedMedicine ? (
              <SelectedChip
                label={selectedMedicine.name}
                sub={`${formatCurrency(selectedMedicine.unit_price)} · Stock: ${selectedMedicine.stock_quantity}`}
                onClear={resetSelection}
              />
            ) : (
              <div className="relative">
                <SearchInput value={search} onChange={v => { setSearch(v); setDropdownOpen(true); }} placeholder="Search medicine..." />
                {dropdownOpen && search && (
                  <DropdownList empty={filteredMedicines.length === 0} emptyLabel="No medicines found">
                    {filteredMedicines.map(m => (
                      <DropdownOption
                        key={m.id}
                        left={m.name}
                        right={`${formatCurrency(m.unit_price)} · Stock: ${m.stock_quantity}`}
                        onSelect={() => { setSelectedId(m.id); setDropdownOpen(false); }}
                      />
                    ))}
                  </DropdownList>
                )}
              </div>
            )}
          </div>
        )}

        {/* Lab Test */}
        {itemType === 'lab_test' && (
          <div>
            <label className="label">Lab Test *</label>
            {selectedLabTest ? (
              <SelectedChip label={selectedLabTest.name} sub={formatCurrency(selectedLabTest.price)} onClear={resetSelection} />
            ) : (
              <div className="relative">
                <SearchInput value={search} onChange={v => { setSearch(v); setDropdownOpen(true); }} placeholder="Search test..." />
                {dropdownOpen && search && (
                  <DropdownList empty={filteredLabTests.length === 0} emptyLabel="No tests found">
                    {filteredLabTests.map(t => (
                      <DropdownOption
                        key={t.id}
                        left={t.name}
                        right={formatCurrency(t.price)}
                        onSelect={() => { setSelectedId(t.id); setDropdownOpen(false); }}
                      />
                    ))}
                  </DropdownList>
                )}
              </div>
            )}
          </div>
        )}

        {/* Consultation */}
        {itemType === 'consultation' && (
          <div>
            <label className="label">Doctor *</label>
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="input">
              <option value="">Select doctor</option>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>Dr. {d.full_name} — {formatCurrency(d.consultation_fee)}</option>
              ))}
            </select>
          </div>
        )}

        {/* Room / Bed */}
        {itemType === 'bed_charge' && (
          <div>
            <label className="label">Ward *</label>
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="input">
              <option value="">Select ward</option>
              {wards.map(w => (
                <option key={w.id} value={w.id}>{w.name} ({w.ward_type}) — {formatCurrency(w.daily_rate)}/day</option>
              ))}
            </select>
          </div>
        )}

        {/* Other */}
        {itemType === 'other' && (
          <div>
            <label className="label">Description *</label>
            <input required value={otherDescription} onChange={e => setOtherDescription(e.target.value)} className="input" placeholder="Enter description..." />
          </div>
        )}

        {insufficientStock && selectedMedicine && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            Insufficient stock. Available: {selectedMedicine.stock_quantity}
          </div>
        )}

        {exceedsRemaining && selectedRxItem && (
          <div className="space-y-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                This exceeds the {selectedRxItem.remaining} remaining on {selectedRxItem.prescriptionNumber}.
                {!canOverrideQuantity && ' Ask a pharmacist or admin to authorize a purchase beyond the prescribed quantity (e.g. for lost or damaged medication).'}
              </span>
            </div>
            {canOverrideQuantity && (
              <div>
                <label className="text-xs font-medium text-amber-800">Reason for override (required) *</label>
                <input
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  className="input mt-1"
                  placeholder="e.g. Original medication lost, patient has ongoing need"
                />
                <p className="mt-1 text-xs text-amber-700">This will be recorded against your name and today's date for audit.</p>
              </div>
            )}
          </div>
        )}

        <div className={`grid grid-cols-1 gap-3 ${showQuantity ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          {showQuantity && (
            <div>
              <label className="label">{quantityLabel}</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                className="input"
              />
            </div>
          )}
          <div>
            <label className="label">Unit Price (₹)</label>
            {itemType === 'other' ? (
              <input type="number" step="0.01" required value={otherPrice} onChange={e => setOtherPrice(e.target.value)} className="input" />
            ) : (
              <input type="text" disabled value={computed ? formatCurrency(computed.unit_price) : '—'} className="input bg-gray-50 text-gray-500" />
            )}
          </div>
          <div>
            <label className="label">Total</label>
            <input type="text" disabled value={computed ? formatCurrency(total) : '—'} className="input bg-gray-50 font-semibold text-gray-900" />
          </div>
        </div>

        {submitError && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {submitError}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={handleClose} className="btn-secondary">Done</button>
          <button type="submit" disabled={!canSubmit || submitting} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? 'Adding...' : 'Add Item'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SelectedChip({ label, sub, onClear }: { label: string; sub: string; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-primary-200 bg-primary-50 px-3 py-2">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{sub}</p>
      </div>
      <button type="button" onClick={onClear} className="text-xs font-medium text-primary-600 hover:text-primary-700">
        Change
      </button>
    </div>
  );
}

function DropdownList({ children, empty, emptyLabel }: { children: React.ReactNode; empty: boolean; emptyLabel: string }) {
  return (
    <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
      {empty ? <p className="p-3 text-sm text-gray-400">{emptyLabel}</p> : children}
    </div>
  );
}

function DropdownOption({ left, right, onSelect }: { left: string; right: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={onSelect}
      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
    >
      <span className="text-gray-900">{left}</span>
      <span className="ml-3 flex-shrink-0 text-xs text-gray-400">{right}</span>
    </button>
  );
}