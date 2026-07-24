import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import { fmtDate, fmtNumber } from '../utils/format.js';
import ExpiryBadge from '../components/shared/ExpiryBadge.jsx';

export default function TransferNew() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { profile, isCompany } = useAuth();
  if (isCompany()) return <div className="alert alert-danger">Cty không tạo điều chuyển. Đây là nghiệp vụ giữa các ĐL.</div>;

  const orgId = profile?.organization_id;
  const [batchId, setBatchId] = useState(sp.get('batch') || '');
  const [toOrgId, setToOrgId] = useState(sp.get('to') || '');
  const [qty, setQty] = useState(sp.get('qty') || '');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null);

  const { data: warehouse } = useQuery({
    queryKey: ['wh-of', orgId],
    enabled: !!orgId,
    queryFn: async () => (await supabase.from('stock_locations').select('id').eq('organization_id', orgId).eq('type', 'warehouse').maybeSingle()).data
  });

  const { data: batches = [] } = useQuery({
    queryKey: ['transfer-batches', warehouse?.id],
    enabled: !!warehouse?.id,
    queryFn: async () => (await supabase
      .from('stock_batches')
      .select('*, medicine:medicines(id, code, name, unit, pack_size, base_unit)')
      .eq('location_id', warehouse.id)
      .gt('quantity', 0)
      .order('expiry_date')).data || []
  });

  const { data: orgs = [] } = useQuery({
    queryKey: ['other-units', orgId],
    enabled: !!orgId,
    queryFn: async () => (await supabase.from('organizations').select('id, name, code').eq('type', 'unit').neq('id', orgId).order('name')).data || []
  });

  const selectedBatch = batches.find((b) => b.id === batchId);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!batchId) throw new Error('Chọn lô muốn xuất');
      if (!toOrgId) throw new Error('Chọn ĐL nhận');
      const n = Number(qty);
      if (!n || n <= 0) throw new Error('Nhập số lượng > 0');
      if (n > selectedBatch.quantity) throw new Error(`Lô chỉ còn ${selectedBatch.quantity}`);

      const { data, error } = await supabase.from('transfer_requests').insert({
        from_org_id: orgId,
        to_org_id: toOrgId,
        medicine_id: selectedBatch.medicine_id,
        batch_id: batchId,
        quantity_requested: n,
        reason,
        initiated_by: profile.id
      }).select().single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => nav(`/transfers/${id}`),
    onError: (e) => setErr(e.message)
  });

  return (
    <>
      <div className="page-header"><div className="page-title">Tạo phiếu điều chuyển</div></div>
      {err && <div className="alert alert-danger">{err}</div>}

      <div className="card mb-3">
        <div className="grid-2">
          <div className="field">
            <label>Lô muốn xuất (từ kho tổng hợp)</label>
            <select className="select" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              <option value="">— Chọn lô —</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.medicine?.name} · Lô {b.batch_number || '—'} · HSD {fmtDate(b.expiry_date)} · Còn {b.quantity} {b.medicine?.unit}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>ĐL nhận</label>
            <select className="select" value={toOrgId} onChange={(e) => setToOrgId(e.target.value)}>
              <option value="">— Chọn ĐL —</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        </div>

        {selectedBatch && (
          <div className="alert alert-info">
            <b>{selectedBatch.medicine?.name}</b> · <ExpiryBadge date={selectedBatch.expiry_date} withDate /> · Còn {fmtNumber(selectedBatch.quantity)} {selectedBatch.medicine?.unit}
          </div>
        )}

        <div className="grid-2">
          <div className="field">
            <label>Số lượng yêu cầu ({selectedBatch?.medicine?.unit || '—'})</label>
            <input className="input num" type="number" min="1" max={selectedBatch?.quantity || undefined} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="field">
            <label>Lý do (VD: HSD gần, cần giải phóng)</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>

        <div className="alert alert-warning">
          Sau khi tạo phiếu, hai ĐL <b>liên hệ ngoài app</b> để thống nhất. ĐL xuất bấm "Xác nhận đã xuất" khi giao hàng thực tế. ĐL nhận bấm "Xác nhận đã nhận" khi nhận đủ.
        </div>

        <div className="text-right">
          <button className="btn" onClick={() => nav(-1)}>Huỷ</button>{' '}
          <button className="btn btn-primary" disabled={createMut.isPending} onClick={() => createMut.mutate()}>
            {createMut.isPending ? 'Đang tạo…' : 'Tạo phiếu'}
          </button>
        </div>
      </div>
    </>
  );
}
