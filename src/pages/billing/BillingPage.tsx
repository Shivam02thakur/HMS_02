import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatCard } from '@/components/ui/StatCard';
import type { Invoice, Patient, InvoiceStatus } from '@/types';
import {
  Plus, User, IndianRupee, Wallet, Receipt, AlertCircle,
  Download, X, ChevronLeft, ChevronRight, SlidersHorizontal, CheckCircle, History
} from 'lucide-react';
import { formatDate, formatCurrency, formatNumber, getStatusColor, getStatusLabel } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { recalcInvoicePaymentState, dispenseUndispensedMedicines } from '@/lib/billing';

const PAGE_SIZE = 10;
const STATUS_OPTIONS: { value: InvoiceStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PARTIAL', label: 'Partially Paid' },
  { value: 'PAID', label: 'Paid' },
];

export function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'ALL'>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showRevenueHistory, setShowRevenueHistory] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Revenue collected is tracked independently of the filtered invoice list
  // above -- it's driven off the payments table (paid_at) so "today" and
  // "this year" stay accurate in real time regardless of whatever search/
  // status/date filters are applied to the invoice table.
  const [revenueLoading, setRevenueLoading] = useState(true);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [yearToDateRevenue, setYearToDateRevenue] = useState(0);
  const [dailyRevenue, setDailyRevenue] = useState<{ dateKey: string; label: string; amount: number; count: number }[]>([]);
  const debouncedSearch = useDebounce(search, 300);
  const { user } = useAuth();
  const { isReceptionist } = useRole();
  const navigate = useNavigate();

  const [form, setForm] = useState({ patient_id: '', notes: '' });
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_mode: 'Cash', transaction_id: '', notes: '' });
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const hasActiveFilters = statusFilter !== 'ALL' || !!dateFrom || !!dateTo || !!search;

  useEffect(() => { fetchData(); }, [debouncedSearch, statusFilter, dateFrom, dateTo]);
  useEffect(() => { setCurrentPage(1); }, [debouncedSearch, statusFilter, dateFrom, dateTo]);
  useEffect(() => { fetchRevenueData(); }, []);

  // Pulls every payment recorded so far this calendar year and rolls it up
  // into: today's total, the year-to-date total, and a day-by-day history
  // (most recent first) for the revenue history view.
  async function fetchRevenueData() {
    setRevenueLoading(true);
    const now = new Date();
    const yearStart = `${now.getFullYear()}-01-01T00:00:00`;

    const { data, error } = await supabase
      .from('payments')
      .select('amount, paid_at')
      .gte('paid_at', yearStart)
      .order('paid_at', { ascending: false });

    if (error) {
      console.error('Failed to load revenue data:', error);
      setRevenueLoading(false);
      return;
    }

    const todayKey = dateKey(now);
    let today = 0;
    let yearToDate = 0;
    const byDate = new Map<string, { label: string; amount: number; count: number }>();

    for (const p of (data || [])) {
      const paidAt = new Date(p.paid_at as unknown as string);
      const amount = Number(p.amount || 0);
      const key = dateKey(paidAt);

      yearToDate += amount;
      if (key === todayKey) today += amount;

      const existing = byDate.get(key);
      if (existing) {
        existing.amount += amount;
        existing.count += 1;
      } else {
        byDate.set(key, { label: formatDate(paidAt), amount, count: 1 });
      }
    }

    const history = Array.from(byDate.entries())
      .map(([key, v]) => ({ dateKey: key, label: v.label, amount: v.amount, count: v.count }))
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

    setTodayRevenue(today);
    setYearToDateRevenue(yearToDate);
    setDailyRevenue(history);
    setRevenueLoading(false);
  }

  // Local (not UTC) Y-M-D key, so a payment made this evening in the
  // user's timezone still counts as "today" even if UTC has rolled over.
  function dateKey(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  async function fetchData() {
    setLoading(true);

    let query = supabase.from('invoices').select('*, patient:patients(full_name)').order('created_at', { ascending: false });
    if (statusFilter !== 'ALL') query = query.eq('status', statusFilter);
    if (dateFrom) query = query.gte('invoice_date', dateFrom);
    if (dateTo) query = query.lte('invoice_date', dateTo);

    const { data, error } = await query;
    if (error) console.error('Failed to load invoices:', error);

    let filtered = (data || []) as unknown as Invoice[];
    if (debouncedSearch) {
      filtered = filtered.filter(i =>
        i.patient?.full_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        i.invoice_number?.toLowerCase().includes(debouncedSearch.toLowerCase())
      );
    }
    setInvoices(filtered);

    if (patients.length === 0) {
      const { data: p } = await supabase.from('patients').select('id, full_name').order('full_name');
      setPatients((p || []) as unknown as Patient[]);
    }

    setLoading(false);
  }

  // Summary is computed from the currently filtered result set, so the
  // numbers above the table always reflect exactly what's shown below.
  const summary = useMemo(() => {
    const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.paid_amount || 0), 0);
    const outstanding = invoices.reduce((sum, inv) => {
      if (inv.status === 'PAID') return sum;
      return sum + (Number(inv.total_amount || 0) - Number(inv.paid_amount || 0) - Number(inv.waived_amount || 0));
    }, 0);
    const pendingCount = invoices.filter(i => i.status !== 'PAID').length;
    return { totalRevenue, outstanding, totalInvoices: invoices.length, pendingCount };
  }, [invoices]);

  const totalPages = Math.max(1, Math.ceil(invoices.length / PAGE_SIZE));
  const paginatedInvoices = invoices.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function clearFilters() {
    setSearch('');
    setStatusFilter('ALL');
    setDateFrom('');
    setDateTo('');
  }

  function exportCsv() {
    const header = ['Invoice #', 'Patient', 'Date', 'Total', 'Paid', 'Balance', 'Status'];
    const rows = invoices.map(inv => [
      inv.invoice_number || '',
      inv.patient?.full_name || '',
      formatDate(inv.invoice_date),
      inv.total_amount.toFixed(2),
      inv.paid_amount.toFixed(2),
      (inv.total_amount - inv.paid_amount - Number(inv.waived_amount || 0)).toFixed(2),
      inv.status,
    ]);
    const csv = [header, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
    setPaymentError(null);

    const amount = parseFloat(paymentForm.amount);
    if (!amount || amount <= 0) {
      setPaymentError('Enter a valid amount.');
      return;
    }

    // This "Pay" action's whole purpose is to fully settle the invoice.
    // If the amount doesn't cover the remaining balance, marking it PAID
    // anyway would leave the status and the actual paid amount out of
    // sync -- so we refuse and point to the right place for partial
    // payments instead.
    const remainingBalance = Number(selectedInvoice.total_amount) - Number(selectedInvoice.paid_amount) - Number(selectedInvoice.waived_amount || 0);
    if (amount < remainingBalance - 0.01) {
      setPaymentError(
        `This only covers ${formatCurrency(amount)} of the ${formatCurrency(remainingBalance)} owed. ` +
        `For a partial payment, open the invoice and use "Record Payment" there instead.`
      );
      return;

    if (amount > remainingBalance + 0.01) {
      setPaymentError(
        `OVERPAYMENT: Payment of ${formatCurrency(amount)} exceeds the remaining balance of ${formatCurrency(remainingBalance)}.`
      );
      return;
    }
    }

    const { error } = await supabase.from('payments').insert({
      invoice_id: selectedInvoice.id,
      amount,
      payment_mode: paymentForm.payment_mode as any,
      transaction_id: paymentForm.transaction_id || undefined,
      notes: paymentForm.notes,
      received_by: user?.id
    });

    if (error) {
      console.error('Failed to record payment:', error);
      setPaymentError(error.message);
      return;
    }

    const wasPaid = selectedInvoice.status === 'PAID';

    try {
      // Recompute paid_amount and status from the payments table itself,
      // same as InvoiceDetailPage -- never set status directly. This is
      // what keeps this list and the invoice detail page agreeing on how
      // much has actually been paid (see @/lib/billing).
      const { status: newStatus } = await recalcInvoicePaymentState(selectedInvoice.id, Number(selectedInvoice.total_amount));

      if (newStatus === 'PAID' && !wasPaid) {
        const failed = await dispenseUndispensedMedicines(selectedInvoice.id);
        if (failed.length > 0) {
          console.error('Some medicine items could not be dispensed:', failed);
          setPaymentError('Payment recorded, but some medicine items could not be dispensed (check pharmacy stock).');
        }
      }
    } catch (recalcErr: any) {
      console.error('Payment recorded, but failed to update invoice totals:', recalcErr);
      setPaymentError(`Payment recorded, but the invoice totals couldn't be updated: ${recalcErr.message || recalcErr}`);
      fetchData();
      return;
    }

    setShowPaymentModal(false);
    setSelectedInvoice(null);
    setPaymentForm({ amount: '', payment_mode: 'Cash', transaction_id: '', notes: '' });
    fetchData();
    fetchRevenueData();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
          <p className="text-gray-500">Manage invoices and payments</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} disabled={invoices.length === 0} className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed">
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </button>
          {isReceptionist() && (
            <button onClick={() => setShowModal(true)} className="btn-primary">
              <Plus className="h-4 w-4 mr-2" /> Create Invoice
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Invoices" value={formatNumber(summary.totalInvoices)} icon={Receipt} color="blue" />

        {/* Revenue Collected: real-time today's/year-to-date totals from
            the payments table, with a link into the full daily history. */}
        <button onClick={() => setShowRevenueHistory(true)} className="card w-full text-left transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Revenue Collected</p>
              {revenueLoading ? (
                <p className="mt-1 text-sm text-gray-400">Loading...</p>
              ) : (
                <>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{formatCurrency(todayRevenue)}</p>
                  <p className="text-xs text-gray-400">today</p>
                  <p className="mt-1 text-sm font-semibold text-gray-600">{formatCurrency(yearToDateRevenue)} <span className="font-normal text-gray-400">this year</span></p>
                </>
              )}
            </div>
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-600">
              <Wallet className="h-6 w-6" />
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1 text-xs font-medium text-primary-600">
            <History className="h-3.5 w-3.5" /> View daily history
          </p>
        </button>

        <StatCard title="Outstanding" value={formatCurrency(summary.outstanding)} icon={IndianRupee} color="red" />
        <StatCard title="Pending / Partial" value={formatNumber(summary.pendingCount)} icon={AlertCircle} color="yellow" />
      </div>

      <div className="card">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Search by patient or invoice #..." />
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`btn-secondary shrink-0 ${showFilters ? 'ring-2 ring-primary-200' : ''}`}
          >
            <SlidersHorizontal className="h-4 w-4 mr-2" /> Filters
          </button>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 shrink-0">
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          )}
        </div>

        {showFilters && (
          <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-gray-50 p-4 sm:grid-cols-3">
            <div>
              <label className="label">Status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as InvoiceStatus | 'ALL')} className="input">
                {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">From Date</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">To Date</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input" />
            </div>
          </div>
        )}

        {loading ? <div className="py-12 text-center">Loading...</div> :
        invoices.length === 0 ? (
          <EmptyState
            title={hasActiveFilters ? 'No invoices match your filters' : 'No invoices found'}
            description={hasActiveFilters ? 'Try adjusting or clearing your filters.' : 'Create an invoice to get started.'}
            action={hasActiveFilters ? (
              <button onClick={clearFilters} className="btn-secondary text-sm">Clear filters</button>
            ) : undefined}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Invoice #</th>
                    <th className="table-header">Patient</th>
                    <th className="table-header">Date</th>
                    <th className="table-header">Total</th>
                    <th className="table-header">Payment</th>
                    <th className="table-header text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedInvoices.map((inv) => {
                    const balance = inv.total_amount - inv.paid_amount - Number(inv.waived_amount || 0);
                    return (
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
                        <td className="table-cell">
                          <span className={`badge ${getStatusColor(inv.status)}`}>{getStatusLabel(inv.status)}</span>
                          {balance > 0 && (
                            <p className="mt-1 text-xs text-red-600 font-medium">{formatCurrency(balance)} due</p>
                          )}
                        </td>
                        <td className="table-cell text-right">
                          {inv.status !== 'PAID' && isReceptionist() ? (
                            <button onClick={(e) => { e.stopPropagation(); setSelectedInvoice(inv); setPaymentForm({...paymentForm, amount: (inv.total_amount - inv.paid_amount - Number(inv.waived_amount || 0)).toString()}); setShowPaymentModal(true); }} className="text-xs bg-medical-50 text-medical-700 px-2.5 py-1.5 rounded-md font-medium hover:bg-medical-100">
                              Settle
                            </button>
                          ) : inv.status === 'PAID' ? (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                              <CheckCircle className="h-3.5 w-3.5" /> Settled
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-500">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, invoices.length)} of {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="btn-secondary px-2 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-sm text-gray-600">Page {currentPage} of {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="btn-secondary px-2 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </>
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

      <Modal isOpen={showPaymentModal} onClose={() => { setShowPaymentModal(false); setSelectedInvoice(null); setPaymentError(null); }} title="Settle Invoice" size="sm">
        <form onSubmit={handlePayment} className="space-y-4">
          {selectedInvoice && (
            <p className="text-sm text-gray-500">
              Amount owed: <span className="font-semibold text-gray-900">{formatCurrency(Number(selectedInvoice.total_amount) - Number(selectedInvoice.paid_amount) - Number(selectedInvoice.waived_amount || 0))}</span>
            </p>
          )}
          <div>
            <label className="label">Amount (₹) *</label>
            <input type="number" step="0.01" required value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} className="input" />
            <p className="mt-1 text-xs text-gray-400">This closes the invoice as PAID — it must cover the full amount owed.</p>
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
            <label className="label">Notes</label>
            <textarea value={paymentForm.notes} onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})} className="input" rows={2} />
          </div>
          {paymentError && (
            <div className={
              paymentError.startsWith('OVERPAYMENT')
              ? 'flex items-center gap-2 rounded-lg bg-red-100 border-2 border-red-600 px-3 py-2 text-sm font-bold text-red-700'
              : 'flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700'
              }>
              {paymentError}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setShowPaymentModal(false); setSelectedInvoice(null); setPaymentError(null); }} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Record Payment</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showRevenueHistory} onClose={() => setShowRevenueHistory(false)} title="Revenue Collected" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-green-50 p-4">
              <p className="text-xs font-medium text-green-700">Today</p>
              <p className="mt-1 text-xl font-bold text-green-900">{formatCurrency(todayRevenue)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-500">{new Date().getFullYear()} Year to Date</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{formatCurrency(yearToDateRevenue)}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Daily Collection History</p>
            {revenueLoading ? (
              <div className="py-8 text-center text-sm text-gray-400">Loading...</div>
            ) : dailyRevenue.length === 0 ? (
              <EmptyState title="No revenue recorded yet" description="Payments recorded this year will show up here, day by day." />
            ) : (
              <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-100">
                <table className="w-full">
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <th className="table-header">Date</th>
                      <th className="table-header text-right">Payments</th>
                      <th className="table-header text-right">Amount Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRevenue.map(day => (
                      <tr key={day.dateKey} className={day.dateKey === dateKey(new Date()) ? 'bg-green-50/60' : ''}>
                        <td className="table-cell">
                          {day.label}
                          {day.dateKey === dateKey(new Date()) && (
                            <span className="ml-2 badge bg-green-100 text-green-800">Today</span>
                          )}
                        </td>
                        <td className="table-cell text-right">{formatNumber(day.count)}</td>
                        <td className="table-cell text-right font-medium">{formatCurrency(day.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}