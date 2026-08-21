import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Modal } from '@/components/ui/Modal';
import type { Invoice, InvoiceItem, Patient, Payment } from '@/types';
import { ArrowLeft, Plus, Trash2, Receipt, User, IndianRupee, CheckCircle } from 'lucide-react';
import { formatDate, formatCurrency, getStatusColor } from '@/lib/utils';

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isReceptionist } = useRole();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const [itemForm, setItemForm] = useState({ description: '', quantity: '1', unit_price: '', item_type: 'other' as const });
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_mode: 'Cash', transaction_id: '', notes: '' });

  useEffect(() => { if (id) fetchData(); }, [id]);

  async function fetchData() {
    if (!id) return;
    setLoading(true);
    const [{ data: inv }, { data: it }, { data: pay }] = await Promise.all([
      supabase.from('invoices').select('*, patient:patients(*)').eq('id', id).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', id).order('created_at'),
      supabase.from('payments').select('*').eq('invoice_id', id).order('paid_at')
    ]);
    setInvoice(inv as unknown as Invoice | null);
    setItems((it || []) as unknown as InvoiceItem[]);
    setPayments((pay || []) as unknown as Payment[]);
    setLoading(false);
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    const qty = parseInt(itemForm.quantity) || 1;
    const price = parseFloat(itemForm.unit_price) || 0;
    await supabase.from('invoice_items').insert({
      invoice_id: id,
      description: itemForm.description,
      quantity: qty,
      unit_price: price,
      total_price: qty * price,
      item_type: itemForm.item_type
    });
    await supabase.rpc('calculate_invoice_total', { p_invoice_id: id });
    setShowItemModal(false);
    setItemForm({ description: '', quantity: '1', unit_price: '', item_type: 'other' });
    fetchData();
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    await supabase.from('payments').insert({
      invoice_id: id,
      amount: parseFloat(paymentForm.amount),
      payment_mode: paymentForm.payment_mode as any,
      transaction_id: paymentForm.transaction_id || undefined,
      notes: paymentForm.notes,
      received_by: user?.id
    });
    setShowPaymentModal(false);
    setPaymentForm({ amount: '', payment_mode: 'Cash', transaction_id: '', notes: '' });
    fetchData();
  }

  async function deleteItem(itemId: string) {
    await supabase.from('invoice_items').delete().eq('id', itemId);
    if (id) await supabase.rpc('calculate_invoice_total', { p_invoice_id: id });
    fetchData();
  }

  if (loading) return <div className="flex h-96 items-center justify-center">Loading...</div>;
  if (!invoice) return <div className="flex h-96 items-center justify-center">Invoice not found</div>;

  const remaining = invoice.total_amount - invoice.paid_amount;

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/billing')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to Billing
      </button>

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
            </div>
          </div>
          <div className="text-right">
            <span className={`badge ${getStatusColor(invoice.status)}`}>{invoice.status}</span>
            <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(invoice.total_amount)}</p>
            <p className="text-sm text-gray-500">Paid: {formatCurrency(invoice.paid_amount)}</p>
            {remaining > 0 && <p className="text-sm text-red-600">Due: {formatCurrency(remaining)}</p>}
          </div>
        </div>
      </div>

      {/* Invoice Items */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Items</h2>
          {isReceptionist() && (
            <button onClick={() => setShowItemModal(true)} className="btn-primary text-xs py-1.5 px-3">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
            </button>
          )}
        </div>
        {items.length === 0 ? <p className="text-center text-gray-500 py-4">No items added</p> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Description</th>
                  <th className="table-header">Qty</th>
                  <th className="table-header">Unit Price</th>
                  <th className="table-header">Total</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td className="table-cell">{item.description}</td>
                    <td className="table-cell">{item.quantity}</td>
                    <td className="table-cell">{formatCurrency(item.unit_price)}</td>
                    <td className="table-cell font-medium">{formatCurrency(item.total_price)}</td>
                    <td className="table-cell text-right">
                      {isReceptionist() && (
                        <button onClick={() => deleteItem(item.id)} className="p-1 text-gray-400 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-200">
                  <td colSpan={3} className="table-cell text-right font-medium">Subtotal</td>
                  <td className="table-cell font-bold">{formatCurrency(invoice.subtotal)}</td>
                  <td></td>
                </tr>
                {invoice.discount > 0 && (
                  <tr>
                    <td colSpan={3} className="table-cell text-right font-medium">Discount</td>
                    <td className="table-cell text-green-600">-{formatCurrency(invoice.discount)}</td>
                    <td></td>
                  </tr>
                )}
                <tr>
                  <td colSpan={3} className="table-cell text-right font-bold text-lg">Total</td>
                  <td className="table-cell font-bold text-lg text-primary-700">{formatCurrency(invoice.total_amount)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payments */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Payments</h2>
          {isReceptionist() && invoice.status !== 'PAID' && (
            <button onClick={() => { setPaymentForm({...paymentForm, amount: remaining.toString()}); setShowPaymentModal(true); }} className="btn-primary text-xs py-1.5 px-3">
              <IndianRupee className="h-3.5 w-3.5 mr-1" /> Record Payment
            </button>
          )}
        </div>
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
                {pay.transaction_id && <span className="text-xs text-gray-400">{pay.transaction_id}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showItemModal} onClose={() => setShowItemModal(false)} title="Add Item" size="sm">
        <form onSubmit={addItem} className="space-y-4">
          <div>
            <label className="label">Description *</label>
            <input required value={itemForm.description} onChange={e => setItemForm({...itemForm, description: e.target.value})} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Quantity</label>
              <input type="number" min="1" value={itemForm.quantity} onChange={e => setItemForm({...itemForm, quantity: e.target.value})} className="input" />
            </div>
            <div>
              <label className="label">Unit Price (₹)</label>
              <input type="number" step="0.01" required value={itemForm.unit_price} onChange={e => setItemForm({...itemForm, unit_price: e.target.value})} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Type</label>
            <select value={itemForm.item_type} onChange={e => setItemForm({...itemForm, item_type: e.target.value as any})} className="input">
              <option value="consultation">Consultation</option>
              <option value="lab_test">Lab Test</option>
              <option value="medicine">Medicine</option>
              <option value="bed_charge">Bed Charge</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowItemModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Add Item</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} title="Record Payment" size="sm">
        <form onSubmit={recordPayment} className="space-y-4">
          <div>
            <label className="label">Amount (₹) *</label>
            <input type="number" step="0.01" required value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} className="input" />
          </div>
          <div>
            <label className="label">Payment Mode *</label>
            <select value={paymentForm.payment_mode} onChange={e => setPaymentForm({...paymentForm, payment_mode: e.target.value})} className="input">
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Card">Card</option>
            </select>
          </div>
          <div>
            <label className="label">Transaction ID</label>
            <input value={paymentForm.transaction_id} onChange={e => setPaymentForm({...paymentForm, transaction_id: e.target.value})} className="input" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowPaymentModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Record</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
