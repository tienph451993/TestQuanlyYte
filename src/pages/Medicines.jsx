import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import { fmtDate } from '../utils/format.js';

const EMPTY = { code: '', name: '', category: 'Thuốc', unit: 'Vỉ', pack_size: '', base_unit: 'Viên' };

// Danh mục thuốc = master catalog cố định.
// Mã (barcode), Tên, Phân loại, Đơn vị (Vỉ/Hộp/Lọ…), Vỉ có bao nhiêu viên, Đơn vị gốc, Ngày tạo.
export default function Medicines() {
  const qc = useQueryClient();
  const isCA = useAuth((s) => s.isCompanyAdmin());
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');

  const { data = [], isLoading } = useQuery({
    queryKey: ['medicines'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('medicines')
        .select('id, code, name, category, unit, pack_size, base_unit, is_active, created_at')
        .order('code');
      if (error) throw error;
      return data;
    }
  });

  const saveMut = useMutation({
    mutationFn: async (row) => {
      const payload = {
        code: row.code.trim(),
        name: row.name.trim(),
        category: row.category?.trim() || null,
        unit: row.unit?.trim() || null,
        pack_size: row.pack_size ? Number(row.pack_size) : null,
        base_unit: row.base_unit?.trim() || null
      };
      if (row.id) {
        const { error } = await supabase.from('medicines').update(payload).eq('id', row.id);
        if (error) throw error;
      } else {
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
        <div>
          <div className="page-title">Danh mục thuốc & vật tư</div>
          <div className="text-sub text-sm">Cột "1 Vỉ = ? Viên" chỉ dùng cho thuốc dạng vỉ, để trống với vật tư (băng, lọ…).</div>
        </div>
        {isCA && <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}>+ Thêm mới</button>}
      </div>

      <div className="card">
        <div className="row mb-3">
          <input className="input" placeholder="Tìm theo mã (barcode) hoặc tên…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
          <div className="flex-1 text-right text-sub text-sm" style={{ alignSelf: 'center' }}>{filtered.length} loại</div>
        </div>
        {isLoading ? <div className="empty-state">Đang tải…</div> : (
          <div className="tbl-wrap">
            <table className="tbl tbl-hover">
              <thead>
                <tr>
                  <th>Mã (barcode)</th><th>Tên</th><th>Phân loại</th>
                  <th>Đơn vị</th><th className="text-right">1 đơn vị =</th>
                  <th>Ngày tạo</th><th>Trạng thái</th>{isCA && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td className="num">{m.code}</td>
                    <td>{m.name}</td>
                    <td>{m.category || '—'}</td>
                    <td>{m.unit || '—'}</td>
                    <td className="num text-right">
                      {m.pack_size && m.base_unit ? `${m.pack_size} ${m.base_unit}` : '—'}
                    </td>
                    <td className="text-sub text-sm">{fmtDate(m.created_at)}</td>
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
                {filtered.length === 0 && <tr><td colSpan={isCA ? 8 : 7} className="empty-state">Không có dữ liệu</td></tr>}
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
          <div className="card-title">{row.id ? 'Sửa danh mục thuốc' : 'Thêm thuốc mới'}</div>
          <button className="btn btn-ghost" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="field"><label>Mã (barcode)</label><input className="input" value={form.code} onChange={(e) => update('code', e.target.value)} /></div>
          <div className="field"><label>Tên</label><input className="input" value={form.name} onChange={(e) => update('name', e.target.value)} /></div>
          <div className="grid-2">
            <div className="field">
              <label>Phân loại</label>
              <select className="select" value={form.category || ''} onChange={(e) => update('category', e.target.value)}>
                <option>Thuốc</option>
                <option>Vật tư băng bó</option>
                <option>Dụng cụ</option>
                <option>Khác</option>
              </select>
            </div>
            <div className="field">
              <label>Đơn vị xuất/nhập</label>
              <select className="select" value={form.unit || ''} onChange={(e) => update('unit', e.target.value)}>
                <option>Vỉ</option><option>Hộp</option><option>Lọ</option>
                <option>Cuộn</option><option>Gói</option><option>Cái</option>
                <option>Chai</option><option>Đôi</option>
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label>1 {form.unit || 'Đơn vị'} có bao nhiêu?</label>
              <input className="input num" type="number" min="1" placeholder="Bỏ trống với vật tư (băng, lọ…)" value={form.pack_size || ''} onChange={(e) => update('pack_size', e.target.value)} />
            </div>
            <div className="field">
              <label>Đơn vị gốc</label>
              <input className="input" placeholder="Viên / mL…" value={form.base_unit || ''} onChange={(e) => update('base_unit', e.target.value)} />
            </div>
          </div>
          <div className="text-sub text-xs">
            Ví dụ: Paracetamol → Đơn vị = <b>Vỉ</b>, 1 Vỉ = <b>10 Viên</b>. Băng cuộn → Đơn vị = <b>Cuộn</b>, để trống 2 ô sau.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Huỷ</button>
          <button className="btn btn-primary" disabled={saving || !form.code || !form.name} onClick={() => onSave(form)}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  );
}
