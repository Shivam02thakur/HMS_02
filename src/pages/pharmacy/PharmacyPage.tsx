import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRole } from '@/hooks/useRole';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { ReauthModal } from '@/components/ui/ReauthModal';
import type { Medicine } from '@/types';
import { Plus, Pill, AlertTriangle, Package, Trash2, Edit, ClipboardList } from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

interface OrderRow {
  id: string;
  description: string;
  quantity: number | null;
  dispensed: boolean;
  created_at: string;
  invoice: { id: string; invoice_number: string | null; status: string; patient: { full_name: string } | null } | null;
}

export function PharmacyPage() {
  const [activeTab, setActiveTab] = useState<'inventory' | 'orders'>('inventory');
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDispenseModal, setShowDispenseModal] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [dispenseQty, setDispenseQty] = useState('1');
  const debouncedSearch = useDebounce(search, 300);
  const { isPharmacist } = useRole();
  const { user } = useAuth();

  // Delete safety: prescription_items cascades from medicines (real FK,
  // 001_schema.sql), but invoice_items.reference_id also points at a
  // medicine when item_type = 'medicine' with NO foreign key at all (it's
  // intentionally polymorphic -- also points at doctors/wards depending on
  // type). Deleting a referenced medicine wouldn't cascade or error -- it
  // would silently leave invoice_items pointing at nothing, which is worse
  // than a cascade since it fails silently. Both are checked here.
  const [deleteTarget, setDeleteTarget] = useState<Medicine | null>(null);
  const [showReauth, setShowReauth] = useState(false);
  const [deleteBlockedInfo, setDeleteBlockedInfo] = useState<{ medicine: Medicine; counts: Record<string, number> } | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [orderSubTab, setOrderSubTab] = useState<'pending' | 'dispensed'>('pending');

  const [form, setForm] = useState({
    name: '', generic_name: '', category: '', manufacturer: '',
    stock_quantity: '', reorder_level: '', unit_price: '', expiry_date: ''
  });

  useEffect(() => { fetchData(); }, [debouncedSearch]);
  useEffect(() => { if (activeTab === 'orders') fetchOrders(); }, [activeTab]);

  async function fetchData() {
    setLoading(true);
    let query = supabase.from('medicines').select('*').order('name');
    if (debouncedSearch) {
      query = query.or(`name.ilike.%${debouncedSearch}%,generic_name.ilike.%${debouncedSearch}%,category.ilike.%${debouncedSearch}%`);
    }
    const { data } = await query;
    setMedicines(data || []);
    setLoading(false);
  }

  // Read-only: reads invoice_items directly (scoped to item_type =
  // 'medicine'), joined to the parent invoice and patient, not medicines.
  // No dispense action here -- dispensing already happens automatically
  // once an invoice is fully paid (src/lib/billing.ts), and a manual
  // dispense action already exists separately on the Inventory tab. This
  // exists purely so the status has somewhere to be seen.
  async function fetchOrders() {
    setOrdersLoading(true);
    const { data, error } = await supabase
      .from('invoice_items')
      .select('id, description, quantity, dispensed, created_at, invoice:invoices(id, invoice_number, status, patient:patients(full_name))')
      .eq('item_type', 'medicine')
      .order('created_at', { ascending: false });
    if (error) console.error('Failed to load pharmacy orders:', error);
    setOrders((data || []) as unknown as OrderRow[]);
    setOrdersLoading(false);
  }

  function openModal(medicine?: Medicine) {
    if (medicine) {
      setEditingMedicine(medicine);
      setForm({
        name: medicine.name, generic_name: medicine.generic_name || '', category: medicine.category || '',
        manufacturer: medicine.manufacturer || '', stock_quantity: medicine.stock_quantity.toString(),
        reorder_level: medicine.reorder_level.toString(), unit_price: medicine.unit_price.toString(),
        expiry_date: medicine.expiry_date || ''
      });
    } else {
      setEditingMedicine(null);
      setForm({ name: '', generic_name: '', category: '', manufacturer: '', stock_quantity: '', reorder_level: '', unit_price: '', expiry_date: '' });
    }
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name, generic_name: form.generic_name || undefined, category: form.category || undefined,
      manufacturer: form.manufacturer || undefined, stock_quantity: parseInt(form.stock_quantity) || 0,
      reorder_level: parseInt(form.reorder_level) || 10, unit_price: parseFloat(form.unit_price) || 0,
      expiry_date: form.expiry_date || undefined
    };
    if (editingMedicine) {
      await supabase.from('medicines').update(payload).eq('id', editingMedicine.id);
    } else {
      await supabase.from('medicines').insert(payload);
    }
    setShowModal(false);
    fetchData();
  }

  async function handleDispense() {
    if (!selectedMedicine || !dispenseQty) return;
    const qty = parseInt(dispenseQty);
    if (qty <= 0 || qty > selectedMedicine.stock_quantity) return;

    const { data: success } = await supabase.rpc('dispense_medicine', {
      p_medicine_id: selectedMedicine.id,
      p_quantity: qty
    });

    if (success) {
      setShowDispenseModal(false);
      setDispenseQty('1');
      fetchData();
    }
  }

  async function handleDeleteClick(medicine: Medicine) {
    setDeleteError('');
    const [{ count: prescriptionItems }, { count: invoiceRefs }] = await Promise.all([
      supabase.from('prescription_items').select('id', { count: 'exact', head: true }).eq('medicine_id', medicine.id),
      supabase.from('invoice_items').select('id', { count: 'exact', head: true }).eq('item_type', 'medicine').eq('reference_id', medicine.id),
    ]);
    const counts = { 'Prescription lines': prescriptionItems || 0, 'Invoice lines': invoiceRefs || 0 };
    if (Object.values(counts).some(c => c > 0)) {
      setDeleteBlockedInfo({ medicine, counts });
      return;
    }
    setDeleteTarget(medicine);
    setShowReauth(true);
  }

  async function handleConfirmedDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setShowReauth(false);
    const { error } = await supabase.from('medicines').delete().eq('id', target.id);
    if (error) {
      setDeleteError(`Could not delete ${target.name}. Please try again.`);
      console.error(error);
    }
    setDeleteTarget(null);
    fetchData();
  }

  const lowStock = medicines.filter(m => m.stock_quantity <= m.reorder_level);
  const pendingOrders = orders.filter(o => !o.dispensed);
  const dispensedOrders = orders.filter(o => o.dispensed);
  const visibleOrders = orderSubTab === 'pending' ? pendingOrders : dispensedOrders;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pharmacy</h1>
          <p className="text-gray-500">Manage medicines and inventory</p>
        </div>
        {activeTab === 'inventory' && isPharmacist() && (
          <button onClick={() => openModal()} className="btn-primary">
            <Plus className="h-4 w-4 mr-2" /> Add Medicine
          </button>
        )}
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        <button onClick={() => setActiveTab('inventory')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'inventory' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Inventory
        </button>
        <button onClick={() => setActiveTab('orders')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${activeTab === 'orders' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <ClipboardList className="h-3.5 w-3.5" /> Orders
        </button>
      </div>

      {activeTab === 'inventory' ? (
        <>
          {lowStock.length > 0 && (
            <div className="card border-l-4 border-l-yellow-400">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <h2 className="text-sm font-semibold text-gray-900">Low Stock Alert</h2>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {lowStock.map(m => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg bg-yellow-50 p-2">
                    <span className="text-xs font-medium text-gray-900">{m.name}</span>
                    <span className="text-xs font-bold text-yellow-700">{m.stock_quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="mb-4">
              <SearchInput value={search} onChange={setSearch} placeholder="Search medicines..." />
            </div>

            {loading ? <div className="py-12 text-center">Loading...</div> :
            medicines.length === 0 ? <EmptyState title="No medicines found" /> : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="table-header">Medicine</th>
                      <th className="table-header">Category</th>
                      <th className="table-header">Stock</th>
                      <th className="table-header">Price</th>
                      <th className="table-header">Expiry</th>
                      <th className="table-header text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medicines.map((m) => (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="table-cell">
                          <div className="flex items-center gap-2">
                            <Pill className="h-4 w-4 text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-900">{m.name}</p>
                              <p className="text-xs text-gray-500">{m.generic_name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="table-cell text-gray-600">{m.category || '-'}</td>
                        <td className="table-cell">
                          <div className="flex items-center gap-2">
                            <Package className="h-3.5 w-3.5 text-gray-400" />
                            <span className={m.stock_quantity <= m.reorder_level ? 'text-red-600 font-medium' : 'text-gray-700'}>
                              {m.stock_quantity}
                            </span>
                            {m.stock_quantity <= m.reorder_level && <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />}
                          </div>
                        </td>
                        <td className="table-cell">{formatCurrency(m.unit_price)}</td>
                        <td className="table-cell">{m.expiry_date ? formatDate(m.expiry_date) : '-'}</td>
                        <td className="table-cell text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isPharmacist() && m.stock_quantity > 0 && (
                              <button onClick={() => { setSelectedMedicine(m); setDispenseQty('1'); setShowDispenseModal(true); }} className="text-xs bg-medical-50 text-medical-700 px-2 py-1 rounded hover:bg-medical-100">
                                Dispense
                              </button>
                            )}
                            {isPharmacist() && (
                              <>
                                <button onClick={() => openModal(m)} className="p-1 text-gray-400 hover:text-blue-600">
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button onClick={() => handleDeleteClick(m)} className="p-1 text-gray-400 hover:text-red-600">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="card">
          <div className="mb-4 flex gap-2">
            <button onClick={() => setOrderSubTab('pending')} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${orderSubTab === 'pending' ? 'bg-primary-50 text-primary-700' : 'text-gray-500 hover:bg-gray-50'}`}>
              Pending ({pendingOrders.length})
            </button>
            <button onClick={() => setOrderSubTab('dispensed')} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${orderSubTab === 'dispensed' ? 'bg-primary-50 text-primary-700' : 'text-gray-500 hover:bg-gray-50'}`}>
              Dispensed ({dispensedOrders.length})
            </button>
          </div>
          {ordersLoading ? <div className="py-12 text-center">Loading...</div> :
          visibleOrders.length === 0 ? <EmptyState title={`No ${orderSubTab} orders`} /> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Medicine</th>
                    <th className="table-header">Qty</th>
                    <th className="table-header">Patient</th>
                    <th className="table-header">Invoice</th>
                    <th className="table-header">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.map(o => (
                    <tr key={o.id} className="hover:bg-gray-50">
                      <td className="table-cell font-medium text-gray-900">{o.description}</td>
                      <td className="table-cell text-gray-600">{o.quantity ?? '-'}</td>
                      <td className="table-cell text-gray-600">{o.invoice?.patient?.full_name || '-'}</td>
                      <td className="table-cell text-gray-600">{o.invoice?.invoice_number || '-'}</td>
                      <td className="table-cell text-gray-500">{formatDate(o.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingMedicine ? 'Edit Medicine' : 'Add Medicine'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label className="label">Name *</label><input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input" /></div>
            <div><label className="label">Generic Name</label><input value={form.generic_name} onChange={e => setForm({...form, generic_name: e.target.value})} className="input" /></div>
            <div><label className="label">Category</label><input value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="input" /></div>
            <div><label className="label">Manufacturer</label><input value={form.manufacturer} onChange={e => setForm({...form, manufacturer: e.target.value})} className="input" /></div>
            <div><label className="label">Stock Quantity *</label><input type="number" required value={form.stock_quantity} onChange={e => setForm({...form, stock_quantity: e.target.value})} className="input" /></div>
            <div><label className="label">Reorder Level</label><input type="number" value={form.reorder_level} onChange={e => setForm({...form, reorder_level: e.target.value})} className="input" /></div>
            <div><label className="label">Unit Price (₹)</label><input type="number" step="0.01" value={form.unit_price} onChange={e => setForm({...form, unit_price: e.target.value})} className="input" /></div>
            <div><label className="label">Expiry Date</label><input type="date" value={form.expiry_date} onChange={e => setForm({...form, expiry_date: e.target.value})} className="input" /></div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{editingMedicine ? 'Update' : 'Add'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showDispenseModal} onClose={() => setShowDispenseModal(false)} title="Dispense Medicine" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Dispensing <strong>{selectedMedicine?.name}</strong></p>
          <p className="text-xs text-gray-500">Available stock: {selectedMedicine?.stock_quantity}</p>
          <div>
            <label className="label">Quantity</label>
            <input type="number" min="1" max={selectedMedicine?.stock_quantity} value={dispenseQty} onChange={e => setDispenseQty(e.target.value)} className="input" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowDispenseModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleDispense} className="btn-primary">Dispense</button>
          </div>
        </div>
      </Modal>

      {deleteError && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 shadow-lg">{deleteError}</div>
      )}

      <Modal isOpen={!!deleteBlockedInfo} onClose={() => setDeleteBlockedInfo(null)} title="Can't Delete Medicine" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {deleteBlockedInfo?.medicine.name} is referenced by existing records:
          </p>
          <ul className="space-y-1 text-sm">
            {deleteBlockedInfo && Object.entries(deleteBlockedInfo.counts).filter(([, c]) => c > 0).map(([label, c]) => (
              <li key={label} className="flex justify-between rounded bg-gray-50 px-3 py-1.5">
                <span className="text-gray-700">{label}</span><span className="font-medium text-gray-900">{c}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500">Deleting would either erase that history or leave those records pointing at nothing.</p>
          <button onClick={() => setDeleteBlockedInfo(null)} className="btn-primary w-full">Understood</button>
        </div>
      </Modal>

      <ReauthModal
        isOpen={showReauth}
        onClose={() => { setShowReauth(false); setDeleteTarget(null); }}
        onVerified={handleConfirmedDelete}
        email={user?.email || ''}
        title="Confirm Medicine Deletion"
        message={`This will permanently delete ${deleteTarget?.name}. Re-enter your password to confirm.`}
      />
    </div>
  );
}
