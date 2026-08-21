import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRole } from '@/hooks/useRole';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Medicine } from '@/types';
import { Plus, Pill, AlertTriangle, Package, Trash2, Edit } from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

export function PharmacyPage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDispenseModal, setShowDispenseModal] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [dispenseQty, setDispenseQty] = useState('1');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const { isPharmacist } = useRole();

  const [form, setForm] = useState({
    name: '', generic_name: '', category: '', manufacturer: '',
    stock_quantity: '', reorder_level: '', unit_price: '', expiry_date: ''
  });

  useEffect(() => { fetchData(); }, [debouncedSearch]);

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

  async function handleDelete() {
    if (!deleteId) return;
    await supabase.from('medicines').delete().eq('id', deleteId);
    setDeleteId(null);
    fetchData();
  }

  const lowStock = medicines.filter(m => m.stock_quantity <= m.reorder_level);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pharmacy</h1>
          <p className="text-gray-500">Manage medicines and inventory</p>
        </div>
        {isPharmacist() && (
          <button onClick={() => openModal()} className="btn-primary">
            <Plus className="h-4 w-4 mr-2" /> Add Medicine
          </button>
        )}
      </div>

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
                            <button onClick={() => setDeleteId(m.id)} className="p-1 text-gray-400 hover:text-red-600">
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

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Medicine" message="Are you sure?" isDanger />
    </div>
  );
}
