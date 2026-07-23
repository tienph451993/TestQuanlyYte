import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import { todayISO } from '../utils/format.js';
import { getStatusFromDays, daysUntil } from '../lib/fefo.js';

// Nhập kho từ Công ty phát về ĐL. Chỉ company_admin / company_user.
export default function ImportFromCompany() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { profile, isCompany } = useAuth();

  const [orgId, setOrgId] = useState('');
  const [lines, setLines] = useState([blankLine()]);
  const [err, setErr] = useState(null);

  const { data: orgs = [] } = useQuery({
    queryKey: ['orgs-units'],
    queryFn: async () => (await supabase.from('organizations').select('*').eq('type','unit').order('code')).data || []
  });
  const { data: medicines = [] } = useQuery({
    queryKey: ['medicines-active'],
    queryFn: async () => (await supabase.from('medicines').select('*').eq('is_active', true).order('name')).data || []
  });
  const { data: locs = [] } = useQuery({
    queryKey: ['warehouse', orgId],
    enabled: !!orgId,
    queryFn: async () => (await supabase
      .from('stock_locations')
      .select('*')
      .eq('organization_id', orgId)
      .eq('type', 'warehouse')
      .eq('is_active', true)).data || []
  });

  const warehouse = locs[0];

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('Chọn Điện lực nhận');
      if (!warehouse) throw new Error('Đơn vị chưa có kho tổng hợp – hãy tạo trong Vị trí kho/tủ');

      for (const ln of lines) {
        if (!ln.medicine_id || !ln.quantity || !ln.expiry_date) {
          throw new Error('Điền đầy đủ thuốc / số lượng / HSD cho mọi dòng');
        }
      }

      for (const ln of lines) {
        const qty = Number(ln.quantity);
        const days = daysUntil(ln.expiry_date);
        const status = getStatusFromDays(days);

        const { data: batch, error: bErr } = await supabase.from('stock_batches').insert({
          medicine_id: ln.medicine_id,
          location_id: warehouse.id,
          organization_id: orgId,
          batch_number: ln.batch_number || null,
          quantity: qty,
          initial_quantity: qty,
          unit: medicines.find((m) => m.id === ln.medicine_id)?.unit,
          manufacture_date: ln.manufacture_date || null,
          expiry_date: ln.expiry_date,
          source_type: 'from_company',
          expiry_status: status,
          created_by: profile.id
        }).select().single();
        if (bErr) throw bErr;

        const { error: tErr } = await supabase.from('transactions').insert({
          type: 'import_from_company',
          batch_id: batch.id,
          to_location: warehouse.id,
          quantity: qty,
          performed_by: profile.id
        });
        if (tErr) throw tErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['batches'] });
      nav('/inventory');
    },
    onError: (e) => setErr(e.message)
  });

  if (!isCompany()) return <div className="alert alert-danger">Chỉ Công ty được phát thuốc về Điện lực.</div>;

  return (
    <>
      <div className="page-header">
        <div className="page-title">Nhập kho từ Công ty phát về Điện lực</div>
      </div>

      {err && <div className="alert alert-danger">{err}</div>}

      <div className="card mb-3">
        <div className="grid-2">
          <div className="field">
            <label>Điện lực nhận</label>
            <select className="select" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              <option value="">— Chọn Điện lực —</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Kho nhận</label>
            <input className="input" value={warehouse?.name || (orgId ? 'Đơn vị chưa có kho tổng hợp' : '—')} disabled />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Danh sách thuốc phát</div>
          <button className="btn" onClick={() => setLines([...lines, blankLine()])}>+ Thêm dòng</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Thuốc</th><th>Số lô</th><th>NSX</th><th>HSD</th>
                <th style={{ width: 120 }}>Số lượng</th><th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((ln, i) => (
                <tr key={i}>
                  <td>
                    <select className="select" value={ln.medicine_id} onChange={(e) => updateLine(setLines, i, 'medicine_id', e.target.value)}>
                      <option value="">— Chọn —</option>
                      {medicines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </td>
                  <td><input className="input" value={ln.batch_number} onChange={(e) => updateLine(setLines, i, 'batch_number', e.target.value)} /></td>
                  <td><input className="input" type="date" value={ln.manufacture_date} onChange={(e) => updateLine(setLines, i, 'manufacture_date', e.target.value)} /></td>
                  <td><input className="input" type="date" value={ln.expiry_date} onChange={(e) => updateLine(setLines, i, 'expiry_date', e.target.value)} /></td>
                  <td><input className="input num" type="number" min="1" value={ln.quantity} onChange={(e) => updateLine(setLines, i, 'quantity', e.target.value)} /></td>
                  <td className="text-right">
                    <button className="btn btn-sm" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-right">
          <button className="btn" onClick={() => nav(-1)}>Huỷ</button>{' '}
          <button className="btn btn-primary" disabled={submitMut.isPending} onClick={() => submitMut.mutate()}>
            {submitMut.isPending ? 'Đang xử lý…' : 'Xác nhận phát thuốc'}
          </button>
        </div>
      </div>
    </>
  );
}

function blankLine() {
  return { medicine_id: '', batch_number: '', manufacture_date: '', expiry_date: '', quantity: '' };
}
function updateLine(setLines, i, k, v) {
  setLines((prev) => prev.map((ln, idx) => idx === i ? { ...ln, [k]: v } : ln));
}
