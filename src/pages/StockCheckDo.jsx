import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import { fmtDate, fmtNumber, fmtQty } from '../utils/format.js';
import ExpiryBadge from '../components/shared/ExpiryBadge.jsx';

export default function StockCheckDo() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [drafts, setDrafts] = useState({});
  const [err, setErr] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['stock-check', id],
    queryFn: async () => {
      const [{ data: check }, { data: items }, { data: batches }] = await Promise.all([
        supabase.from('stock_checks').select('*, location:stock_locations(name, type, check_cycle)').eq('id', id).single(),
        supabase.from('stock_check_items').select('*, medicine:medicines(id, code, name, unit, pack_size, base_unit), batch:stock_batches(id, batch_number, expiry_date)').eq('check_id', id),
        supabase.from('stock_batches').select('*, medicine:medicines(id, unit, pack_size, base_unit)').eq('id',
          // placeholder; replace after
          '00000000-0000-0000-0000-000000000000')
      ]);
      // Query batches theo location của check
      const { data: locBatches } = check
        ? await supabase.from('stock_batches')
          .select('id, medicine_id, quantity, batch_number, expiry_date, medicine:medicines(id, code, name, unit, pack_size, base_unit)')
          .eq('location_id', check.location_id)
          .gt('quantity', 0)
          .order('expiry_date')
        : { data: [] };
      return { check, items: items || [], batches: locBatches || [] };
    }
  });

  const finalizeMut = useMutation({
    mutationFn: async () => {
      // Lưu draft xuống stock_check_items rồi gọi RPC
      const patches = [];
      for (const it of data.items) {
        const v = drafts[it.id];
        if (v !== undefined && v !== '') patches.push({ id: it.id, actual_quantity: Number(v) });
      }
      for (const p of patches) {
        const { error } = await supabase.from('stock_check_items').update({ actual_quantity: p.actual_quantity }).eq('id', p.id);
        if (error) throw error;
      }
      const fn = data.check.check_type === 'quarterly' ? 'finalize_stock_check_quarterly' : 'finalize_stock_check_monthly';
      const { error } = await supabase.rpc(fn, { p_check_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-check', id] });
      qc.invalidateQueries({ queryKey: ['stock-checks'] });
      qc.invalidateQueries({ queryKey: ['batches'] });
      nav('/stock-checks');
    },
    onError: (e) => setErr(e.message)
  });

  if (isLoading || !data?.check) return <div className="empty-state">Đang tải…</div>;

  const isDone = data.check.status === 'completed';
  const isQuarterly = data.check.check_type === 'quarterly';

  // Với monthly: gom batches theo medicine để hiển thị breakdown chi tiết
  const batchesByMed = useMemo(() => {
    const m = new Map();
    for (const b of data.batches) {
      if (!m.has(b.medicine_id)) m.set(b.medicine_id, []);
      m.get(b.medicine_id).push(b);
    }
    return m;
  }, [data.batches]);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Kiểm kê · {data.check.location?.name}</div>
          <div className="text-sub text-sm">
            {isQuarterly ? 'Quý – theo lô' : 'Tháng – theo tổng'} · {fmtDate(data.check.check_date)}
          </div>
        </div>
        <span className={`badge ${isDone ? 'badge-success' : 'badge-warning'}`}>
          {isDone ? 'Đã hoàn thành' : 'Đang kiểm'}
        </span>
      </div>

      {err && <div className="alert alert-danger">{err}</div>}
      {isDone && <div className="alert alert-info">Phiếu đã hoàn thành — chỉ xem kết quả.</div>}

      {isQuarterly ? (
        <QuarterlyTable data={data} drafts={drafts} setDrafts={setDrafts} isDone={isDone} />
      ) : (
        <MonthlyTable data={data} batchesByMed={batchesByMed} drafts={drafts} setDrafts={setDrafts} isDone={isDone} />
      )}

      {!isDone && (
        <div className="card mt-3 text-right">
          <button className="btn" onClick={() => nav(-1)}>Quay lại</button>{' '}
          <button className="btn btn-primary btn-lg" disabled={finalizeMut.isPending} onClick={() => finalizeMut.mutate()}>
            {finalizeMut.isPending ? 'Đang xử lý…' : '✅ Hoàn thành kiểm kê'}
          </button>
        </div>
      )}
    </>
  );
}

function MonthlyTable({ data, batchesByMed, drafts, setDrafts, isDone }) {
  const items = data.items;
  return (
    <div className="card">
      <div className="card-header"><div className="card-title">Nhập tổng thực tế mỗi loại</div></div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Thuốc</th>
              <th className="text-right">Sổ sách</th>
              <th style={{ width: 140 }}>Thực tế</th>
              <th className="text-right">Chênh</th>
              <th>Chi tiết lô</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const draft = drafts[it.id] ?? it.actual_quantity ?? '';
              const actual = Number(draft);
              const diff = Number.isFinite(actual) ? actual - it.system_quantity : null;
              const bList = batchesByMed.get(it.medicine_id) || [];
              return (
                <tr key={it.id}>
                  <td><b>{it.medicine?.name}</b><div className="text-xs text-sub num">{it.medicine?.code}</div></td>
                  <td className="num text-right">{fmtQty(it.system_quantity, it.medicine)}</td>
                  <td>
                    <input className="input num" type="number" min="0" disabled={isDone}
                      value={draft}
                      onChange={(e) => setDrafts({ ...drafts, [it.id]: e.target.value })} />
                  </td>
                  <td className={`num text-right ${diff === null ? '' : diff === 0 ? 'text-success' : diff > 0 ? 'text-warning' : 'text-danger'}`}>
                    {diff === null ? '—' : diff > 0 ? `+${diff}` : diff}
                  </td>
                  <td className="text-xs">
                    {bList.map((b, i) => (
                      <div key={b.id}>
                        {b.batch_number || 'Không mã'}: <span className="num">{b.quantity}</span> <ExpiryBadge date={b.expiry_date} />
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={5} className="empty-state">Vị trí không có tồn – không cần kiểm.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="alert alert-info mt-3">
        Hệ thống sẽ tự phân bổ chênh lệch âm (tiêu hao) từ lô HSD gần nhất theo FEFO, và ghi vào usage_logs.
      </div>
    </div>
  );
}

function QuarterlyTable({ data, drafts, setDrafts, isDone }) {
  const items = data.items;
  return (
    <div className="card">
      <div className="card-header"><div className="card-title">Nhập thực tế TỪNG LÔ</div></div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Thuốc / Lô</th><th>HSD</th>
              <th className="text-right">Sổ sách</th>
              <th style={{ width: 140 }}>Thực tế</th>
              <th className="text-right">Chênh</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const draft = drafts[it.id] ?? it.actual_quantity ?? '';
              const actual = Number(draft);
              const diff = Number.isFinite(actual) ? actual - it.system_quantity : null;
              return (
                <tr key={it.id}>
                  <td>
                    <b>{it.medicine?.name}</b>
                    <div className="text-xs text-sub num">Lô {it.batch?.batch_number || 'Không mã'}</div>
                  </td>
                  <td><ExpiryBadge date={it.batch?.expiry_date} withDate /></td>
                  <td className="num text-right">{fmtQty(it.system_quantity, it.medicine)}</td>
                  <td>
                    <input className="input num" type="number" min="0" disabled={isDone}
                      value={draft}
                      onChange={(e) => setDrafts({ ...drafts, [it.id]: e.target.value })} />
                  </td>
                  <td className={`num text-right ${diff === null ? '' : diff === 0 ? 'text-success' : diff > 0 ? 'text-warning' : 'text-danger'}`}>
                    {diff === null ? '—' : diff > 0 ? `+${diff}` : diff}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={5} className="empty-state">Kho trống.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
