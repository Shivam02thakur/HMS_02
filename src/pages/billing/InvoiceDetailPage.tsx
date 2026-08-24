import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import type { Invoice, InvoiceItem, Payment, Medicine, LabTest, Doctor, Ward } from '@/types';
import { ArrowLeft, Plus, Trash2, Receipt, User, IndianRupee, CheckCircle, AlertTriangle } from 'lucide-react';
import { formatDate, formatCurrency, getStatusColor } from '@/lib/utils';

type ItemType = 'medicine' | 'lab_test' | 'consultation' | 'bed_charge' | 'other';

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  medicine: 'Medicine',
  lab_test: 'Lab Test',
  consultation: 'Consultation',
  bed_charge: 'Room / Bed',
  other: 'Other',
};

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

  // Reference data for auto-priced billing items
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [labTests, setLabTests] = useState<LabTest[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);

  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_mode: 'Cash', transaction_id: '', notes: '' });

  useEffect(() => { if (id) fetchData(); }, [id]);

  async function fetchData() {
    if (!id) return;
    setLoading(true);
    const [{ data: inv }, { data: it }, { data: pay }, { data: meds }, { data: tests }, { data: docs }, { data: wds }] = await Promise.all([
      supabase.from('invoices').select('*, patient:patients(*)').eq('id', id).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', id).order('created_at'),
      supabase.from('payments').select('*').eq('invoice_id', id).order('paid_at'),
      supabase.from('medicines').select('id, name, unit_price, stock_quantity').gt('stock_quantity', 0).order('name'),
      supabase.from('lab_tests').select('id, name, code, price').order('name'),
      supabase.from('doctors').select('id, full_name, consultation_fee').eq('is_active', true).order('full_name'),
      supabase.from('wards').select('id, name, ward_type, daily_rate').order('name'),
    ]);
    setInvoice(inv as unknown as Invoice | null);
    setItems((it || []) as unknown as InvoiceItem[]);
    setPayments((pay || []) as unknown as Payment[]);
    setMedicines((meds || []) as unknown as Medicine[]);
    setLabTests((tests || []) as unknown as LabTest[]);
    setDoctors((docs || []) as unknown as Doctor[]);
    setWards((wds || []) as unknown as Ward[]);
    setLoading(false);
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
                  <th className="table-header">Item / Service</th>
                  <th className="table-header">Type</th>
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
                    <td className="table-cell">
                      {item.item_type && <span className="badge bg-gray-100 text-gray-600">{ITEM_TYPE_LABELS[item.item_type as ItemType] || item.item_type}</span>}
                    </td>
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
                  <td colSpan={4} className="table-cell text-right font-medium">Subtotal</td>
                  <td className="table-cell font-bold">{formatCurrency(invoice.subtotal)}</td>
                  <td></td>
                </tr>
                {invoice.discount > 0 && (
                  <tr>
                    <td colSpan={4} className="table-cell text-right font-medium">Discount</td>
                    <td className="table-cell text-green-600">-{formatCurrency(invoice.discount)}</td>
                    <td></td>
                  </tr>
                )}
                <tr>
                  <td colSpan={4} className="table-cell text-right font-bold text-lg">Total</td>
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

      <AddItemModal
        isOpen={showItemModal}
        onClose={() => setShowItemModal(false)}
        invoiceId={id!}
        medicines={medicines}
        labTests={labTests}
        doctors={doctors}
        wards={wards}
        onAdded={fetchData}
      />

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

// ============================================================
// Add Item modal — type-first flow, price always DB-derived
// except for the free-text "Other" type.
// ============================================================
function AddItemModal({
  isOpen, onClose, invoiceId, medicines, labTests, doctors, wards, onAdded,
}: {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string;
  medicines: Medicine[];
  labTests: LabTest[];
  doctors: Doctor[];
  wards: Ward[];
  onAdded: () => void;
}) {
  const [itemType, setItemType] = useState<ItemType>('medicine');
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [otherDescription, setOtherDescription] = useState('');
  const [otherPrice, setOtherPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function resetSelection() {
    setSearch('');
    setDropdownOpen(false);
    setSelectedId('');
    setQuantity('1');
    setOtherDescription('');
    setOtherPrice('');
    setSubmitError(null);
  }

  function handleClose() {
    resetSelection();
    setItemType('medicine');
    onClose();
  }

  function handleTypeChange(t: ItemType) {
    setItemType(t);
    resetSelection();
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
  const canSubmit = computed !== null && total > 0 && !insufficientStock;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!computed || !canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    const { error: insertError } = await supabase.from('invoice_items').insert({
      invoice_id: invoiceId,
      description: computed.description,
      quantity: computed.quantity,
      unit_price: computed.unit_price,
      total_price: computed.quantity * computed.unit_price,
      item_type: itemType,
      reference_id: computed.reference_id,
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

    setSubmitting(false);
    handleClose();
    onAdded();
  }

  const showQuantity = itemType !== 'lab_test' && itemType !== 'consultation';
  const quantityLabel = itemType === 'bed_charge' ? 'Days' : 'Quantity';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Billing Item" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
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
          <button type="button" onClick={handleClose} className="btn-secondary">Cancel</button>
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