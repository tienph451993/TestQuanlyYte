import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import { fmtDate, fmtNumber } from '../utils/format.js';
import ExpiryBadge from '../components/shared/ExpiryBadge.jsx';

const STATUS = {
  pending:   ['badge-warning', 'Chờ ĐL xuất xác nhận'],
  confirmed: ['badge-primary', 'Đã xuất, chờ ĐL nhận'],
  completed: ['badge-success', 'Hoàn thành'],
  cancelled: ['badge-danger', 'Đã huỷ']
};

export default function TransferDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [actualQty, setActualQty] = useState('');
  const [err, setErr] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['transfer', id],
    queryFn: async () => (await supabase
      .from('transfer_requests')
      .select('*, from_org:organizations!from_org_id(id, name), to_org:organizations!to_org_id(id, name), medicine:medicines(name, unit, pack_size, base_unit), batch:stock_batches(batch_number, expiry_date, manufacture_date)')
      .eq('id', id).single()).data
  });

  const exportMut = useMutation({
    mutationFn: async () => {
      const n = Number(actualQty || data.quantity_requested);
      const { error } = await supabase.rpc('confirm_transfer_export', { p_transfer_id: id, p_actual_quantity: n });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfer', id] }),
    onError: (e) => setErr(e.message)
  });

  const importMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('confirm_transfer_import', { p_transfer_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfer', id] });
      qc.invalidateQueries({ queryKey: ['batches'] });
    },
    onError: (e) => setErr(e.message)
  });

  const cancelMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('transfer_requests').update({ status: 'cancelled' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfer', id] }),
    onError: (e) => setErr(e.message)
  });

  if (isLoading || !data) return <div className="empty-state">Đang tải…</div>;

  const [cls, label] = STATUS[data.status] || ['badge', data.status];
  const iAmSender = data.from_org_id === profile?.organization_id;
  const iAmReceiver = data.to_org_id === profile?.organization_id;
  const canExport = data.status === 'pending' && iAmSender;
  const canImport = data.status === 'confirmed' && iAmReceiver;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Phiếu {data.code}</div>
          <div className="text-sub text-sm">Từ <b>{data.from_org?.name}</b> → <b>{data.to_org?.name}</b> · {fmtDate(data.created_at)}</div>
        </div>
        <span className={`badge ${cls}`}>{label}</span>
      </div>

      {err && <div className="alert alert-danger">{err}</div>}

      <div className="card mb-3">
        <div className="card-header"><div className="card-title">Nội dung</div></div>
        <table className="tbl">
          <tbody>
            <tr><td className="text-sub">Thuốc</td><td><b>{data.medicine?.name}</b></td></tr>
            <tr><td className="text-sub">Lô</td><td className="num">{data.batch?.batch_number || '—'}</td></tr>
            <tr><td className="text-sub">HSD</td><td><ExpiryBadge date={data.batch?.expiry_date} withDate /></td></tr>
            <tr><td className="text-sub">Số lượng yêu cầu</td><td className="num">{fmtNumber(data.quantity_requested)} {data.medicine?.unit}</td></tr>
            <tr><td className="text-sub">Số lượng thực chuyển</td><td className="num">{data.actual_quantity ? `${fmtNumber(data.actual_quantity)} ${data.medicine?.unit}` : '—'}</td></tr>
            <tr><td className="text-sub">Lý do</td><td>{data.reason || '—'}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card mb-3">
        <div className="card-header"><div className="card-title">Timeline</div></div>
        <div className="stack">
          <Step done label="Tạo phiếu" when={fmtDate(data.created_at)} />
          <Step done={!!data.export_confirmed_at} label="ĐL xuất xác nhận đã xuất hàng" when={data.export_confirmed_at ? fmtDate(data.export_confirmed_at) : '—'} />
          <Step done={!!data.import_confirmed_at} label="ĐL nhận xác nhận đã nhận hàng" when={data.import_confirmed_at ? fmtDate(data.import_confirmed_at) : '—'} />
        </div>
      </div>

      {canExport && (
        <div className="card">
          <div className="card-header"><div className="card-title">✋ Bạn là ĐL xuất – xác nhận</div></div>
          <div className="field">
            <label>Số lượng thực chuyển ({data.medicine?.unit}) — mặc định = số yêu cầu</label>
            <input className="input num" type="number" min="1" placeholder={String(data.quantity_requested)} value={actualQty} onChange={(e) => setActualQty(e.target.value)} />
          </div>
          <div className="text-right">
            <button className="btn btn-danger" disabled={cancelMut.isPending} onClick={() => cancelMut.mutate()}>Huỷ phiếu</button>{' '}
            <button className="btn btn-primary" disabled={exportMut.isPending} onClick={() => exportMut.mutate()}>
              {exportMut.isPending ? 'Đang xử lý…' : '✅ Xác nhận đã xuất hàng'}
            </button>
          </div>
        </div>
      )}

      {canImport && (
        <div className="card">
          <div className="card-header"><div className="card-title">📥 Bạn là ĐL nhận – xác nhận</div></div>
          <div className="alert alert-info">
            ĐL xuất đã confirm chuyển <b>{fmtNumber(data.actual_quantity)} {data.medicine?.unit}</b>. Kiểm tra hàng thực tế trước khi xác nhận.
          </div>
          <div className="text-right">
            <button className="btn btn-primary" disabled={importMut.isPending} onClick={() => importMut.mutate()}>
              {importMut.isPending ? 'Đang xử lý…' : '✅ Xác nhận đã nhận hàng'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Step({ done, label, when }) {
  return (
    <div className="row items-center" style={{ gap: 12 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: done ? 'var(--c-success-lt)' : 'var(--c-bg-soft)', color: done ? 'var(--c-success)' : 'var(--c-text-muted)',
        fontWeight: 700
      }}>{done ? '✓' : '·'}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: done ? 500 : 400, color: done ? 'var(--c-text-main)' : 'var(--c-text-sub)' }}>{label}</div>
        <div className="text-xs text-sub">{when}</div>
      </div>
    </div>
  );
}
