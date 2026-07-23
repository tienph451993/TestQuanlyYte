import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';

const TYPE_LABELS = { warehouse: 'Kho tổng hợp', cabinet: 'Tủ thuốc', first_aid_kit: 'Hộp sơ cứu' };
const DEFAULT_CYCLE = { warehouse: 'quarterly', cabinet: 'monthly', first_aid_kit: 'monthly' };

export default function Locations() {
  const qc = useQueryClient();
  const { profile, isCompany, isAdmin } = useAuth();
  const canWrite = isAdmin();

  const [editing, setEditing] = useState(null);

  const { data: locs = [], isLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_locations')
        .select('*, organization:organizations(id, code, name, type)')
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  const saveMut = useMutation({
    mutationFn: async (row) => {
      const payload = { ...row };
      delete payload.organization;
      if (row.id) {
        const { error } = await supabase.from('stock_locations').update(payload).eq('id', row.id);
        if (error) throw error;
      } else {
        delete payload.id;
        const { error } = await supabase.from('stock_locations').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['locations'] }); setEditing(null); }
  });

  // Company chỉ thấy vị trí của org Cty; Unit chỉ thấy vị trí org mình
  const filteredLocs = useMemo(() => {
    if (isCompany()) return locs.filter((l) => l.organization?.type === 'company');
    return locs.filter((l) => l.organization_id === profile?.organization_id);
  }, [locs, isCompany, profile]);

  const startNew = () => {
    setEditing({
      name: '', type: 'cabinet', check_cycle: 'monthly', location_desc: '',
      organization_id: profile?.organization_id, is_active: true
    });
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Vị trí kho / tủ / hộp sơ cứu</div>
          <div className="text-sub text-sm">
            {isCompany() ? 'Vị trí thuộc Công ty (chỉ kho Cty)' : 'Vị trí thuộc đơn vị bạn'}
          </div>
        </div>
        {canWrite && <button className="btn btn-primary" onClick={startNew}>+ Thêm vị trí</button>}
      </div>

      <div className="card">
        {isLoading ? <div className="empty-state">Đang tải…</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl tbl-hover">
              <thead>
                <tr>
                  <th>Tên</th><th>Loại</th><th>Chu kỳ kiểm kê</th><th>Mô tả</th><th>Trạng thái</th>
                  {canWrite && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filteredLocs.map((l) => (
                  <tr key={l.id}>
                    <td>{l.name}</td>
                    <td>{TYPE_LABELS[l.type]}</td>
                    <td>{l.check_cycle === 'monthly' ? 'Hàng tháng' : 'Hàng quý'}</td>
                    <td className="text-sub">{l.location_desc || '—'}</td>
                    <td><span className={`badge ${l.is_active ? 'badge-success' : 'badge-danger'}`}>{l.is_active ? 'Đang dùng' : 'Ngưng'}</span></td>
                    {canWrite && <td className="text-right"><button className="btn btn-sm" onClick={() => setEditing(l)}>Sửa</button></td>}
                  </tr>
                ))}
                {filteredLocs.length === 0 && <tr><td colSpan={6} className="empty-state">Chưa có vị trí nào</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <LocationModal
          row={editing}
          isCompany={isCompany()}
          onClose={() => setEditing(null)}
          onSave={(r) => saveMut.mutate(r)}
          saving={saveMut.isPending}
        />
      )}
    </>
  );
}

function LocationModal({ row, isCompany, onClose, onSave, saving }) {
  const [form, setForm] = useState(row);
  const update = (k, v) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'type') next.check_cycle = DEFAULT_CYCLE[v] || 'monthly';
      return next;
    });
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="card-title">{row.id ? 'Sửa vị trí' : 'Thêm vị trí'}</div>
          <button className="btn btn-ghost" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div className="field"><label>Tên</label><input className="input" value={form.name} onChange={(e) => update('name', e.target.value)} /></div>
            <div className="field">
              <label>Loại</label>
              <select className="select" value={form.type} onChange={(e) => update('type', e.target.value)}>
                <option value="warehouse">Kho tổng hợp</option>
                {!isCompany && <option value="cabinet">Tủ thuốc</option>}
                {!isCompany && <option value="first_aid_kit">Hộp sơ cứu</option>}
              </select>
            </div>
            <div className="field">
              <label>Chu kỳ kiểm kê</label>
              <select className="select" value={form.check_cycle} onChange={(e) => update('check_cycle', e.target.value)}>
                <option value="monthly">Hàng tháng</option>
                <option value="quarterly">Hàng quý</option>
              </select>
            </div>
            <div className="field"><label>Mô tả vị trí</label><input className="input" value={form.location_desc || ''} onChange={(e) => update('location_desc', e.target.value)} /></div>
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
