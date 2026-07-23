import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import { fmtDate, fmtNumber } from '../utils/format.js';

export default function DistributionReceive() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { profile, isCompany } = useAuth();
  const [err, setErr] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['distribution', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('distributions')
        .select('*, to_org:organizations!to_org_id(id, name), items:distribution_items(*, medicine:medicines(code, name, unit))')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    }
  });

  const [drafts, setDrafts] = useState({});   // itemId -> { batch_number, expiry_date, manufacture_date }

  const isReceiver = data && (data.to_org_id === profile?.organization_id);
  const isPending = data?.status === 'pending';
  const canEdit = isPending && isReceiver;

  const updateItemMut = useMutation({
    mutationFn: async ({ itemId, patch }) => {
      const { error } = await supabase.from('distribution_items').update(patch).eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['distribution', id] })
  });

  const confirmMut = useMutation({
    mutationFn: async () => {
      const { data: res, error } = await supabase.rpc('receive_distribution', { p_distribution_id: id });
      if (error) throw error;
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['distributions'] });
      qc.invalidateQueries({ queryKey: ['batches'] });
      nav('/distributions');
    },
    onError: (e) => setErr(e.message)
  });

  if (isLoading || !data) return <div className="empty-state">Đang tải…</div>;

  const allLocked = data.items.length > 0 && data.items.every((i) => i.locked);

  const toggleLock = async (item) => {
    if (item.locked) {
      await updateItemMut.mutateAsync({ itemId: item.id, patch: { locked: false, locked_at: null, locked_by: null } });
    } else {
      const d = drafts[item.id] || {};
      const patch = {
        batch_number: d.batch_number ?? item.batch_number,
        expiry_date: d.expiry_date ?? item.expiry_date,
        manufacture_date: d.manufacture_date ?? item.manufacture_date,
        locked: true, locked_at: new Date().toISOString(), locked_by: profile.id
      };
      if (!patch.expiry_date) { setErr('Nhập HSD trước khi khoá dòng'); return; }
      setErr(null);
      await updateItemMut.mutateAsync({ itemId: item.id, patch });
    }
  };

  const draftField = (itemId, key, def) => drafts[itemId]?.[key] ?? def ?? '';
  const setDraft = (itemId, key, v) => setDrafts((d) => ({ ...d, [itemId]: { ...d[itemId], [key]: v } }));

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Phiếu {data.code}</div>
          <div className="text-sub text-sm">Cty phát cho <b>{data.to_org?.name}</b> · {fmtDate(data.created_at)}</div>
        </div>
        <StatusBadge status={data.status} />
      </div>

      {err && <div className="alert alert-danger">{err}</div>}
      {!isPending && (
        <div className="alert alert-info">Phiếu đã {data.status === 'completed' ? 'nhận' : 'huỷ'} — chỉ xem.</div>
      )}
      {isPending && !isReceiver && !isCompany() && (
        <div className="alert alert-warning">Phiếu không phải của đơn vị bạn.</div>
      )}

      <div className="card">
        <div className="card-header">
          <div className="card-title">Danh sách thuốc</div>
          <div className="text-sub text-sm">Kiểm hàng thực tế, điền lô & HSD, bấm khoá từng dòng.</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Thuốc</th>
                <th className="text-right">SL</th>
                <th style={{ width: 140 }}>Số lô</th>
                <th style={{ width: 160 }}>NSX</th>
                <th style={{ width: 160 }}>HSD</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.id} style={{ background: it.locked ? 'var(--c-success-lt)' : undefined }}>
                  <td>{it.medicine.name}</td>
                  <td className="num text-right">{fmtNumber(it.quantity)} {it.medicine.unit}</td>
                  <td>
                    <input className="input" disabled={it.locked || !canEdit}
                      value={draftField(it.id, 'batch_number', it.batch_number)}
                      onChange={(e) => setDraft(it.id, 'batch_number', e.target.value)} />
                  </td>
                  <td>
                    <input className="input" type="date" disabled={it.locked || !canEdit}
                      value={draftField(it.id, 'manufacture_date', it.manufacture_date)}
                      onChange={(e) => setDraft(it.id, 'manufacture_date', e.target.value)} />
                  </td>
                  <td>
                    <input className="input" type="date" disabled={it.locked || !canEdit}
                      value={draftField(it.id, 'expiry_date', it.expiry_date)}
                      onChange={(e) => setDraft(it.id, 'expiry_date', e.target.value)} />
                  </td>
                  <td className="text-right">
                    {canEdit && (
                      <button className={`btn btn-sm ${it.locked ? '' : 'btn-primary'}`} onClick={() => toggleLock(it)}>
                        {it.locked ? '🔓 Mở' : '🔒 Khoá'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canEdit && (
          <div className="mt-4 text-right">
            <button className="btn" onClick={() => nav(-1)}>Quay lại</button>{' '}
            <button
              className="btn btn-primary"
              disabled={!allLocked || confirmMut.isPending}
              title={!allLocked ? 'Khoá tất cả dòng trước' : ''}
              onClick={() => confirmMut.mutate()}
            >
              {confirmMut.isPending ? 'Đang xác nhận…' : '✅ Xác nhận nhận hàng'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending: ['badge-warning', 'Chờ nhận'],
    completed: ['badge-success', 'Đã nhận'],
    cancelled: ['badge-danger', 'Đã huỷ']
  };
  const [cls, label] = map[status] || ['badge', status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
