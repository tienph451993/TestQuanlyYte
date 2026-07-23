import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import { fmtNumber } from '../utils/format.js';

const EMPTY = {
  code: '', name: '', category: 'Thuốc', unit: 'Viên',
  min_stock_unit: 0, shelf_life_days: 730, description: ''
};

export default function Medicines() {
  const qc = useQueryClient();
  const isCA = useAuth((s) => s.isCompanyAdmin());
  const [editing, setEditing] = useState(null); // null | 'new' | row
  const [q, setQ] = useState('');

  const { data = [], isLoading } = useQuery({
    queryKey: ['medicines'],
    queryFn: async () => {
      const { data, error } = await supabase.from('medicines').select('*').order('code');
      if (error) throw error;
      return data;
    }
  });

  const saveMut = useMutation({
    mutationFn: async (row) => {
      const payload = { ...row };
      payload.min_stock_unit = Number(payload.min_stock_unit) || 0;
      payload.shelf_life_days = Number(payload.shelf_life_days) || null;
      if (row.id) {
        const { error } = await supabase.from('medicines').update(payload).eq('id', row.id);
        if (error) throw error;
      } else {
        delete payload.id;
        const { error } = await supabase.from('medicines').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['medicines'] }); setEditing(null); }
  });

  const toggleMut = useMutation({
    mutationFn: async (row) => {
      const { error } = await supabase.from('medicines').update({ is_active: !row.is_active }).eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['medicines'] })
  });

  const filtered = data.filter((m) =>
    !q || m.name.toLowerCase().includes(q.toLowerCase()) || m.code.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <div className="page-header">
        <div className="page-title">Danh mục thuốc & vật tư</div>
        {isCA && <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}>+ Thêm mới</button>}
      </div>

      <div className="card">
        <div className="row mb-3">
          <input className="input" placeholder="Tìm theo mã hoặc tên…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
          <div className="flex-1 text-right text-sub text-sm" style={{ alignSelf: 'center' }}>{filtered.length} loại</div>
        </div>
        {isLoading ? (
          <div className="empty-state">Đang tải…</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl tbl-hover">
              <thead>
                <tr>
                  <th>Mã</th><th>Tên</th><th>Loại</th><th>Đơn vị</th>
                  <th className="text-right">Tồn tối thiểu</th>
                  <th className="text-right">HSD (ngày)</th>
                  <th>Trạng thái</th>
                  {isCA && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td className="num">{m.code}</td>
                    <td>{m.name}</td>
                    <td>{m.category}</td>
                    <td>{m.unit}</td>
                    <td className="num text-right">{fmtNumber(m.min_stock_unit)}</td>
                    <td className="num text-right">{fmtNumber(m.shelf_life_days)}</td>
                    <td>
                      <span className={`badge ${m.is_active ? 'badge-success' : 'badge-danger'}`}>
                        {m.is_active ? 'Đang dùng' : 'Ngưng'}
                      </span>
                    </td>
                    {isCA && (
                      <td className="text-right">
                        <button className="btn btn-sm" onClick={() => setEditing(m)}>Sửa</button>{' '}
                        <button className="btn btn-sm" onClick={() => toggleMut.mutate(m)}>{m.is_active ? 'Ngưng' : 'Bật'}</button>
                      </td>
                    )}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="empty-state">Không có dữ liệu</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <MedicineModal row={editing} onClose={() => setEditing(null)} onSave={(r) => saveMut.mutate(r)} saving={saveMut.isPending} />}
    </>
  );
}

function MedicineModal({ row, onClose, onSave, saving }) {
  const [form, setForm] = useState(row);
  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="card-title">{row.id ? 'Sửa thuốc' : 'Thêm thuốc mới'}</div>
          <button className="btn btn-ghost" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div className="field"><label>Mã</label><input className="input" value={form.code} onChange={(e) => update('code', e.target.value)} /></div>
            <div className="field"><label>Tên</label><input className="input" value={form.name} onChange={(e) => update('name', e.target.value)} /></div>
            <div className="field">
              <label>Loại</label>
              <select className="select" value={form.category} onChange={(e) => update('category', e.target.value)}>
                <option>Thuốc</option><option>Vật tư băng bó</option><option>Dụng cụ</option>
              </select>
            </div>
            <div className="field"><label>Đơn vị</label><input className="input" value={form.unit} onChange={(e) => update('unit', e.target.value)} /></div>
            <div className="field"><label>Tồn kho tối thiểu</label><input className="input" type="number" value={form.min_stock_unit} onChange={(e) => update('min_stock_unit', e.target.value)} /></div>
            <div className="field"><label>HSD (ngày)</label><input className="input" type="number" value={form.shelf_life_days || ''} onChange={(e) => update('shelf_life_days', e.target.value)} /></div>
          </div>
          <div className="field">
            <label>Mô tả</label>
            <textarea className="textarea" rows={2} value={form.description || ''} onChange={(e) => update('description', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Huỷ</button>
          <button className="btn btn-primary" disabled={saving} onClick={() => onSave(form)}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  );
}
