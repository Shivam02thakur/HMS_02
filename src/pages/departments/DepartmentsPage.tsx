import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRole } from '@/hooks/useRole';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Department } from '@/types';
import { Plus, Building2, Edit, Power } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

export function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Department | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const { isAdmin } = useRole();

  const [form, setForm] = useState({ name: '', description: '' });

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const { data } = await supabase.from('departments').select('*').order('name');
    setDepartments((data || []) as unknown as Department[]);
    setLoading(false);
  }

  function openModal(dept?: Department) {
    if (dept) {
      setEditingDept(dept);
      setForm({ name: dept.name, description: dept.description || '' });
    } else {
      setEditingDept(null);
      setForm({ name: '', description: '' });
    }
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingDept) {
      await supabase.from('departments').update(form).eq('id', editingDept.id);
    } else {
      await supabase.from('departments').insert(form);
    }
    setShowModal(false);
    fetchData();
  }

  async function handleToggleActive() {
    if (!toggleTarget) return;
    await supabase.from('departments').update({ is_active: !toggleTarget.is_active }).eq('id', toggleTarget.id);
    setToggleTarget(null);
    fetchData();
  }

  const filteredDepartments = departments.filter(d =>
    !debouncedSearch || d.name.toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
          <p className="text-gray-500">Manage hospital departments</p>
        </div>
        {isAdmin() && (
          <button onClick={() => openModal()} className="btn-primary">
            <Plus className="h-4 w-4 mr-2" /> Add Department
          </button>
        )}
      </div>

      <div className="card">
        <div className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search departments..." />
        </div>

        {loading ? <div className="py-12 text-center">Loading...</div> :
        departments.length === 0 ? <EmptyState title="No departments found" description="Add a department first." /> :
        filteredDepartments.length === 0 ? <EmptyState title="No departments match your search" /> : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredDepartments.map((d) => (
              <div key={d.id} className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100">
                    <Building2 className="h-6 w-6 text-primary-600" />
                  </div>
                  {isAdmin() && (
                    <div className="flex gap-1">
                      <button onClick={() => openModal(d)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-gray-50">
                        <Edit className="h-4 w-4" />
                      </button>
                      <button onClick={() => setToggleTarget(d)} className={`p-1.5 rounded-lg hover:bg-gray-50 ${d.is_active ? 'text-gray-400 hover:text-red-600' : 'text-gray-400 hover:text-green-600'}`} title={d.is_active ? 'Deactivate' : 'Activate'}>
                        <Power className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                <h3 className="mt-3 text-lg font-semibold text-gray-900">{d.name}</h3>
                {d.description && <p className="mt-1 text-sm text-gray-500">{d.description}</p>}
                <span className={`mt-3 inline-block badge ${d.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {d.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingDept ? 'Edit Department' : 'Add Department'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Name *</label>
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input" placeholder="e.g. Cardiology" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input" rows={3} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{editingDept ? 'Update' : 'Add'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        onConfirm={handleToggleActive}
        title={toggleTarget?.is_active ? 'Deactivate Department' : 'Activate Department'}
        message={toggleTarget?.is_active
          ? `Deactivate "${toggleTarget?.name}"? Existing doctors keep their link to it, but it'll be flagged inactive everywhere it's listed.`
          : `Activate "${toggleTarget?.name}" again?`}
        confirmText={toggleTarget?.is_active ? 'Deactivate' : 'Activate'}
        isDanger={toggleTarget?.is_active}
      />
    </div>
  );
}
