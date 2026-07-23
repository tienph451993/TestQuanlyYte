import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import { parseCompanyImportExcel } from '../utils/excel.js';
import { fmtNumber } from '../utils/format.js';

// 2 bước:
// 1. Upload Excel → danh sách dự kiến mua (planned)
// 2. Kiểm đếm bằng quét barcode → nhập số thực nhận (actual) → xác nhận
export default function CompanyImport() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { profile, isCompany } = useAuth();
  if (!isCompany()) return <div className="alert alert-danger">Chỉ Công ty nhập kho Cty.</div>;

  const [step, setStep] = useState(1);
  const [fileInfo, setFileInfo] = useState(null);
  const [rows, setRows] = useState([]);      // {row, code, name, category, unit, planned_quantity, matched, willCreate, actual_quantity, problem}
  const [err, setErr] = useState(null);
  const scanRef = useRef(null);
  const rowRefs = useRef({});                 // code → input DOM

  const onFile = async (e) => {
    setErr(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileInfo({ name: file.name });
    try {
      const parsed = await parseCompanyImportExcel(file);
      if (parsed.length === 0) throw new Error('Không đọc được dòng nào. Kiểm tra header: Mã thuốc | Tên thuốc | Phân loại | Đơn vị | Số lượng');

      const codes = parsed.map((r) => r.code).filter(Boolean);
      const { data: existing = [] } = codes.length
        ? await supabase.from('medicines').select('id, code, name, unit, category').in('code', codes)
        : { data: [] };
      const byCode = Object.fromEntries((existing || []).map((m) => [m.code, m]));

      const enriched = parsed.map((r) => {
        const m = byCode[r.code];
        const problem = !r.code ? 'Thiếu mã barcode' : !r.planned_quantity || r.planned_quantity <= 0 ? 'SL dự kiến ≤ 0' : null;
        return { ...r, matched: m || null, willCreate: !m && !!r.code, actual_quantity: '', problem };
      });
      setRows(enriched);
    } catch (e) {
      setErr(e.message);
    }
  };

  const goStep2 = () => {
    // Cần ít nhất 1 dòng hợp lệ và mã barcode có
    if (rows.filter((r) => !r.problem).length === 0) { setErr('Không có dòng hợp lệ'); return; }
    setErr(null);
    setStep(2);
    setTimeout(() => scanRef.current?.focus(), 100);
  };

  const onScan = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const code = (e.target.value || '').trim();
    if (!code) return;
    const found = rows.findIndex((r) => r.code === code);
    if (found === -1) {
      setErr(`Không có barcode "${code}" trong danh sách nhập kho`);
      e.target.select();
      return;
    }
    setErr(null);
    e.target.value = '';
    // Focus vào ô số lượng thực nhận của dòng đó
    setTimeout(() => rowRefs.current[code]?.focus(), 0);
  };

  const setActual = (code, v) =>
    setRows((prev) => prev.map((r) => (r.code === code ? { ...r, actual_quantity: v } : r)));

  const stats = useMemo(() => {
    let planned = 0, actual = 0, entered = 0;
    for (const r of rows) {
      if (r.problem) continue;
      planned += Number(r.planned_quantity) || 0;
      const a = Number(r.actual_quantity);
      if (a > 0) { actual += a; entered += 1; }
    }
    return { planned, actual, entered, total: rows.filter((r) => !r.problem).length };
  }, [rows]);

  const importMut = useMutation({
    mutationFn: async () => {
      const usable = rows.filter((r) => !r.problem && Number(r.actual_quantity) > 0);
      if (usable.length === 0) throw new Error('Chưa nhập số lượng thực nhận cho dòng nào');

      // 1) Tạo medicines mới (auto)
      for (const r of usable) {
        if (r.matched) continue;
        const { data, error } = await supabase.from('medicines').insert({
          code: r.code,
          name: r.name || r.code,
          category: r.category || 'Khác',
          unit: r.unit || 'Đơn vị',
          is_active: true,
          created_by: profile.id
        }).select().single();
        if (error) throw error;
        r.matched = data;
      }

      // 2) Cộng company_stock theo actual + log movement
      for (const r of usable) {
        const qty = Number(r.actual_quantity);
        const { data: exist } = await supabase.from('company_stock').select('quantity').eq('medicine_id', r.matched.id).maybeSingle();
        if (exist) {
          const { error } = await supabase.from('company_stock')
            .update({ quantity: exist.quantity + qty, updated_at: new Date().toISOString() })
            .eq('medicine_id', r.matched.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('company_stock').insert({ medicine_id: r.matched.id, quantity: qty });
          if (error) throw error;
        }
        const { error: movErr } = await supabase.from('company_stock_movements').insert({
          medicine_id: r.matched.id,
          quantity: qty,
          type: 'import_external',
          performed_by: profile.id,
          notes: `${fileInfo?.name || 'Excel'} · Dự kiến ${r.planned_quantity}, thực nhận ${qty}`
        });
        if (movErr) throw movErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-stock'] });
      qc.invalidateQueries({ queryKey: ['medicines'] });
      nav('/company/stock');
    },
    onError: (e) => setErr(e.message)
  });

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Nhập kho Công ty</div>
          <div className="text-sub text-sm">Bước {step}/2 · {step === 1 ? 'Upload danh sách mua' : 'Kiểm đếm thực nhận'}</div>
        </div>
      </div>

      {err && <div className="alert alert-danger">{err}</div>}

      {step === 1 && (
        <>
          <div className="card mb-3">
            <div className="field">
              <label>File Excel danh sách mua</label>
              <input type="file" accept=".xlsx,.xls" onChange={onFile} className="input" />
              <div className="text-sub text-xs mt-1">
                Cột: <b>Mã thuốc (barcode)</b> · <b>Tên thuốc</b> · <b>Phân loại</b> · <b>Đơn vị</b> · <b>Số lượng</b>. Barcode chưa có trong danh mục sẽ được tạo tự động.
              </div>
            </div>
          </div>

          {rows.length > 0 && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">Xem trước {rows.length} dòng</div>
                <div className="text-sub text-sm">
                  Hợp lệ: <b>{rows.filter((r) => !r.problem).length}</b> · Tạo mới danh mục: <b>{rows.filter((r) => !r.problem && r.willCreate).length}</b>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Dòng</th><th>Barcode</th><th>Tên</th><th>Phân loại</th><th>Đơn vị</th>
                      <th className="text-right">SL dự kiến</th><th>Kết quả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.row}>
                        <td className="num">{r.row}</td>
                        <td className="num">{r.code || '—'}</td>
                        <td>{r.name || '—'}</td>
                        <td>{r.category || '—'}</td>
                        <td>{r.unit || (r.matched?.unit) || '—'}</td>
                        <td className="num text-right">{fmtNumber(r.planned_quantity)}</td>
                        <td>
                          {r.problem
                            ? <span className="badge badge-danger">{r.problem}</span>
                            : r.willCreate
                              ? <span className="badge badge-warning">Sẽ tạo mới trong danh mục</span>
                              : <span className="badge badge-success">Có trong danh mục</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-right">
                <button className="btn" onClick={() => nav(-1)}>Huỷ</button>{' '}
                <button className="btn btn-primary" onClick={goStep2}>Tiếp: Kiểm đếm thực nhận →</button>
              </div>
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <div className="card mb-3">
            <div className="field">
              <label>Quét mã barcode để nhảy tới dòng cần nhập</label>
              <input
                ref={scanRef}
                className="input"
                placeholder="Máy quét sẽ tự gửi Enter…"
                onKeyDown={onScan}
                autoFocus
              />
              <div className="text-sub text-xs mt-1">Có thể gõ tay + Enter. Sau khi nhập số → Tab quay lại đây để quét tiếp.</div>
            </div>
          </div>

          <div className="grid-4 mb-3">
            <MiniKpi label="Dòng cần nhập" value={stats.total} />
            <MiniKpi label="Đã nhập" value={stats.entered} tone={stats.entered === stats.total ? 'success' : 'warning'} />
            <MiniKpi label="Dự kiến (tổng SL)" value={fmtNumber(stats.planned)} />
            <MiniKpi label="Thực nhận (tổng SL)" value={fmtNumber(stats.actual)} tone={stats.actual !== stats.planned ? 'warning' : 'success'} />
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">Danh sách kiểm đếm</div></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Barcode</th><th>Tên</th><th>Đơn vị</th>
                    <th className="text-right">Dự kiến</th>
                    <th style={{ width: 140 }}>Thực nhận</th>
                    <th className="text-right">Chênh lệch</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.filter((r) => !r.problem).map((r) => {
                    const a = Number(r.actual_quantity) || 0;
                    const d = a - Number(r.planned_quantity);
                    const dCls = a === 0 ? '' : d === 0 ? 'text-success' : 'text-warning';
                    return (
                      <tr key={r.code}>
                        <td className="num">{r.code}</td>
                        <td>{r.name || r.matched?.name}</td>
                        <td>{r.unit || r.matched?.unit || '—'}</td>
                        <td className="num text-right">{fmtNumber(r.planned_quantity)}</td>
                        <td>
                          <input
                            ref={(el) => (rowRefs.current[r.code] = el)}
                            className="input num"
                            type="number"
                            min="0"
                            value={r.actual_quantity}
                            onChange={(e) => setActual(r.code, e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') scanRef.current?.focus(); }}
                          />
                        </td>
                        <td className={`num text-right ${dCls}`}>{a === 0 ? '—' : (d > 0 ? `+${d}` : d)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 text-right">
              <button className="btn" onClick={() => setStep(1)}>← Quay lại</button>{' '}
              <button
                className="btn btn-primary"
                disabled={importMut.isPending || stats.entered === 0}
                onClick={() => importMut.mutate()}
              >
                {importMut.isPending ? 'Đang nhập kho…' : `Xác nhận nhập ${stats.entered} dòng · ${fmtNumber(stats.actual)}`}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function MiniKpi({ label, value, tone }) {
  const cls = tone === 'warning' ? 'badge-warning' : tone === 'success' ? 'badge-success' : 'badge-primary';
  return (
    <div className="card">
      <div className="text-sub text-xs" style={{ textTransform: 'uppercase' }}>{label}</div>
      <div className="num" style={{ fontSize: 24, fontWeight: 600, marginTop: 4 }}>{value}</div>
      <span className={`badge ${cls} mt-1`}>&nbsp;</span>
    </div>
  );
}
