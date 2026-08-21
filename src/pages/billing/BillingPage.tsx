import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Invoice, Patient, Payment } from '@/types';
import { Plus, Receipt, User, CheckCircle, Clock, IndianRupee } from 'lucide-react';
import { formatDate, formatCurrency, getStatusColor } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

export function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const { user } = useAuth();
  const { isReceptionist } = useRole();
  const navigate = useNavigate();

  const [form, setForm] = useState({ patient_id: '', notes: '' });
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_mode: 'Cash', transaction_id: '', notes: '' });

  useEffect(() => { fetchData(); }, [debouncedSearch]);

  async function fetchData() {
    setLoading(true);
    let query = supabase.from('invoices').select('*, patient:patients(full_name)').order('created_at', { ascending: false });
    const { data } = await query;
    let filtered = (data || []) as unknown as Invoice[];
    if (debouncedSearch) {
      filtered = filtered.filter(i =>
        i.patient?.full_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        i.invoice_number?.toLowerCase().includes(debouncedSearch.toLowerCase())
      );
    }
    setInvoices(filtered);

    const { data: p } = await supabase.from('patients').select('id, full_name').order('full_name');
    setPatients((p || []) as unknown as Patient[]);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { data } = await supabase.from('invoices').insert({
      patient_id: form.patient_id,
      notes: form.notes,
      created_by: user?.id
    }).select().single();
    setShowModal(false);
    setForm({ patient_id: '', notes: '' });
    if (data) navigate(`/billing/${data.id}`);
    else fetchData();
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInvoice) return;
    await supabase.from('payments').insert({
      invoice_id: selectedInvoice.id,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
          <p className="text-gray-500">Manage invoices and payments</p>
        </div>
        {isReceptionist() && (
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus className="h-4 w-4 mr-2" /> Create Invoice
          </button>
        )}
      </div>

      <div className="card">
        <div className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search invoices..." />
        </div>

        {loading ? <div className="py-12 text-center">Loading...</div> :
        invoices.length === 0 ? <EmptyState title="No invoices found" /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Invoice #</th>
                  <th className="table-header">Patient</th>
                  <th className="table-header">Date</th>
                  <th className="table-header">Total</th>
                  <th className="table-header">Paid</th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/billing/${inv.id}`)}>
                    <td className="table-cell font-mono text-xs">{inv.invoice_number}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        {inv.patient?.full_name}
                      </div>
                    </td>
                    <td className="table-cell">{formatDate(inv.invoice_date)}</td>
                    <td className="table-cell font-medium">{formatCurrency(inv.total_amount)}</td>
                    <td className="table-cell">{formatCurrency(inv.paid_amount)}</td>
                    <td className="table-cell"><span className={`badge ${getStatusColor(inv.status)}`}>{inv.status}</span></td>
                    <td className="table-cell text-right">
                      {inv.status !== 'PAID' && isReceptionist() && (
                        <button onClick={(e) => { e.stopPropagation(); setSelectedInvoice(inv); setPaymentForm({...paymentForm, amount: (inv.total_amount - inv.paid_amount).toString()}); setShowPaymentModal(true); }} className="text-xs bg-medical-50 text-medical-700 px-2 py-1 rounded hover:bg-medical-100">
                          Pay
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Create Invoice">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Patient *</label>
            <select required value={form.patient_id} onChange={e => setForm({...form, patient_id: e.target.value})} className="input">
              <option value="">Select Patient</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="input" rows={2} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create Invoice</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} title="Record Payment" size="sm">
        <form onSubmit={handlePayment} className="space-y-4">
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
            <input value={paymentForm.transaction_id} onChange={e => setPaymentForm({...paymentForm, transaction_id: e.target.value})} className="input" placeholder="Optional" />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={paymentForm.notes} onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})} className="input" rows={2} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowPaymentModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Record Payment</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
