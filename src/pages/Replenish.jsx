import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import { getFefoOrder, getStatusFromDays, daysUntil } from '../lib/fefo.js';
import ExpiryBadge from '../components/shared/ExpiryBadge.jsx';
import { fmtNumber, fmtDate } from '../utils/format.js';

// Bổ sung tủ / hộp sơ cứu từ kho tổng hợp – hiển thị FEFO order.
export default function Replenish() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { profile, isCompany } = useAuth();

  const [orgId, setOrgId] = useState(isCompany() ? '' : profile?.organization_id || '');
  const [toLocId, setToLocId] = useState('');
  const [medicineId, setMedicineId] = useState('');
  const [qtyNeeded, setQtyNeeded] = useState(0);
  const [customQtys, setCustomQtys] = useState({});
  const [err, setErr] = useState(null);

  const { data: orgs = [] } = useQuery({
    queryKey: ['orgs-units'],
    queryFn: async () => (await supabase.from('organizations').select('*').eq('type','unit').order('code')).data || []
  });

  const { data: locs = [] } = useQuery({
    queryKey: ['locations-of', orgId],
    enabled: !!orgId,
    queryFn: async () => (await supabase.from('stock_locations').select('*').eq('organization_id', orgId).eq('is_active', true)).data || []
  });

  const warehouse = locs.find((l) => l.type === 'warehouse');
  const destinations = locs.filter((l) => l.type !== 'warehouse');

  const { data: medicines = [] } = useQuery({
    queryKey: ['medicines-active'],
    queryFn: async () => (await supabase.from('medicines').select('*').eq('is_active', true).order('name')).data || []
  });

  const { data: batches = [] } = useQuery({
    queryKey: ['warehouse-batches', warehouse?.id, medicineId],
    enabled: !!warehouse?.id && !!medicineId,
    queryFn: async () => {
      const { data } = await supabase
        .from('stock_batches')
        .select('*')
        .eq('location_id', warehouse.id)
        .eq('medicine_id', medicineId)
        .gt('quantity', 0)
        .order('expiry_date');
      return data || [];
    }
  });

  const fefo = useMemo(() => getFefoOrder(batches, Number(qtyNeeded) || 0), [batches, qtyNeeded]);
  const totalPlanned = fefo.batches.reduce((sum, b) => sum + Number(customQtys[b.id] ?? b.suggested_quantity ?? 0), 0);

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!toLocId) throw new Error('Chọn tủ / hộp cần bổ sung');
      if (fefo.batches.length === 0) throw new Error('Không có lô để bổ sung');

      for (const b of fefo.batches) {
        const take = Number(customQtys[b.id] ?? b.suggested_quantity ?? 0);
        if (take <= 0) continue;
        if (take > b.quantity) throw new Error(`Lô ${b.batch_number || 'không mã'}: chỉ còn ${b.quantity}, không thể bổ sung ${take}`);

        // 1) trừ kho
        const { error: u1 } = await supabase
          .from('stock_batches').update({ quantity: b.quantity - take }).eq('id', b.id);
        if (u1) throw u1;

        // 2) tăng ở đích: tìm lô cùng medicine+batch_number+expiry ở đích, cộng dồn; nếu chưa có thì tạo mới
        const days = daysUntil(b.expiry_date);
        const { data: existing } = await supabase
          .from('stock_batches')
          .select('*')
          .eq('location_id', toLocId)
          .eq('medicine_id', b.medicine_id)
          .eq('expiry_date', b.expiry_date)
          .maybeSingle();

        let destBatchId;
        if (existing) {
          const { error: u2 } = await supabase.from('stock_batches')
            .update({ quantity: existing.quantity + take, expiry_status: getStatusFromDays(days) })
            .eq('id', existing.id);
          if (u2) throw u2;
          destBatchId = existing.id;
        } else {
          const { data: created, error: iErr } = await supabase.from('stock_batches').insert({
            medicine_id: b.medicine_id,
            location_id: toLocId,
            organization_id: orgId,
            batch_number: b.batch_number,
            quantity: take,
            initial_quantity: take,
            unit: b.unit,
            manufacture_date: b.manufacture_date,
            expiry_date: b.expiry_date,
            source_type: 'from_company',
            source_ref: b.id,
            expiry_status: getStatusFromDays(days),
            created_by: profile.id
          }).select().single();
          if (iErr) throw iErr;
          destBatchId = created.id;
        }

        // 3) transaction
        const { error: tErr } = await supabase.from('transactions').insert({
          type: 'replenish_location',
          batch_id: destBatchId,
          from_location: warehouse.id,
          to_location: toLocId,
          quantity: take,
          performed_by: profile.id,
          notes: `FEFO source batch ${b.id}`
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

  return (
    <>
      <div className="page-header"><div className="page-title">Bổ sung tủ / hộp sơ cứu (FEFO)</div></div>

      {err && <div className="alert alert-danger">{err}</div>}

      <div className="card mb-3">
        <div className="grid-3">
          {isCompany() && (
            <div className="field">
              <label>Đơn vị</label>
              <select className="select" value={orgId} onChange={(e) => { setOrgId(e.target.value); setToLocId(''); }}>
                <option value="">— Chọn —</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label>Bổ sung cho</label>
            <select className="select" value={toLocId} onChange={(e) => setToLocId(e.target.value)} disabled={!orgId}>
              <option value="">— Chọn tủ / hộp —</option>
              {destinations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Thuốc / vật tư</label>
            <select className="select" value={medicineId} onChange={(e) => { setMedicineId(e.target.value); setCustomQtys({}); }} disabled={!orgId}>
              <option value="">— Chọn —</option>
              {medicines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Số lượng cần bổ sung</label>
            <input className="input num" type="number" min="0" value={qtyNeeded} onChange={(e) => { setQtyNeeded(e.target.value); setCustomQtys({}); }} />
          </div>
        </div>
      </div>

      {medicineId && warehouse && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Lô trong kho – thứ tự xuất (FEFO)</div>
            <div className="text-sub text-sm">
              Kế hoạch: <b className="num">{fmtNumber(totalPlanned)}</b> / cần <b className="num">{fmtNumber(qtyNeeded || 0)}</b>
            </div>
          </div>

          {batches.length === 0 && <div className="empty-state">Kho không còn lô nào cho thuốc này</div>}

          <div className="stack">
            {fefo.batches.map((b, idx) => (
              <div key={b.id} className="card" style={{ borderLeft: idx === 0 ? '4px solid var(--c-danger)' : '4px solid var(--c-border)' }}>
                <div className="row items-center justify-between">
                  <div>
                    <div><ExpiryBadge date={b.expiry_date} withDate /> {idx === 0 && <span className="badge badge-primary" style={{ marginLeft: 6 }}>Dùng trước</span>}</div>
                    <div className="text-sub text-sm mt-1">Lô: <span className="num">{b.batch_number || '—'}</span> · Còn {fmtNumber(b.quantity)} trong kho</div>
                  </div>
                  <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
                    <label>Số lượng bổ sung</label>
                    <input
                      className="input num"
                      type="number"
                      min="0"
                      max={b.quantity}
                      value={customQtys[b.id] ?? b.suggested_quantity}
                      onChange={(e) => setCustomQtys({ ...customQtys, [b.id]: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {fefo.batches.length > 0 && (
            <div className="alert alert-warning mt-3">
              ⚠️ Hãy đặt lô HSD gần nhất (<b>{fmtDate(fefo.batches[0].expiry_date)}</b>) ra <b>phía trước tủ</b> để dùng trước.
            </div>
          )}

          {!fefo.is_fulfilled && qtyNeeded > 0 && (
            <div className="alert alert-danger">Kho không đủ – còn thiếu {fmtNumber(fefo.shortage)}</div>
          )}

          <div className="mt-4 text-right">
            <button className="btn" onClick={() => nav(-1)}>Huỷ</button>{' '}
            <button className="btn btn-primary" disabled={submitMut.isPending || totalPlanned <= 0} onClick={() => submitMut.mutate()}>
              {submitMut.isPending ? 'Đang xử lý…' : 'Xác nhận bổ sung'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
