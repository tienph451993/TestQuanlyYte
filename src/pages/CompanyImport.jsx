import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import { parseCompanyImportExcel } from '../utils/excel.js';
import { fmtNumber } from '../utils/format.js';

export default function CompanyImport() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { profile, isCompany } = useAuth();
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);

  if (!isCompany()) return <div className="alert alert-danger">Chỉ Công ty được nhập kho Cty.</div>;

  const onFile = async (e) => {
    setErr(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileInfo({ name: file.name, size: file.size });
    try {
      const parsed = await parseCompanyImportExcel(file);
      if (parsed.length === 0) throw new Error('Không đọc được dòng nào. Kiểm tra header: Mã thuốc | Tên thuốc | Số lượng | Phân loại');

      // Resolve theo code hoặc name
      const codes = parsed.map((r) => r.code).filter(Boolean);
      const names = parsed.map((r) => r.name).filter(Boolean);
      const { data: existing = [] } = await supabase
        .from('medicines')
        .select('id, code, name, unit, category')
        .or(`code.in.(${codes.map((c) => JSON.stringify(c)).join(',') || 'NULL'}),name.in.(${names.map((n) => JSON.stringify(n)).join(',') || 'NULL'})`);

      const byCode = Object.fromEntries((existing || []).map((m) => [m.code.toLowerCase(), m]));
      const byName = Object.fromEntries((existing || []).map((m) => [m.name.toLowerCase(), m]));

      const enriched = parsed.map((r) => {
        const m = byCode[r.code.toLowerCase()] || byName[r.name.toLowerCase()];
        const problem =
          !r.quantity || r.quantity <= 0 ? 'Số lượng không hợp lệ'
          : !r.code && !r.name ? 'Thiếu mã và tên'
          : null;
        return { ...r, matched: m || null, willCreate: !m, problem };
      });
      setRows(enriched);
    } catch (e) {
      setErr(e.message);
    }
  };

  const importMut = useMutation({
    mutationFn: async () => {
      const usable = rows.filter((r) => !r.problem);
      if (usable.length === 0) throw new Error('Không có dòng hợp lệ để nhập');

      // 1) Tạo medicines mới (dùng chung code)
      for (const r of usable) {
        if (r.matched) continue;
        // Tự sinh code nếu Excel không cung cấp
        const code = r.code || 'AUTO-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        const { data, error } = await supabase.from('medicines').insert({
          code,
          name: r.name || code,
          category: r.category || 'Khác',
          unit: 'Đơn vị',
          is_active: true,
          created_by: profile.id
        }).select().single();
        if (error) throw error;
        r.matched = data;
      }

      // 2) Cộng company_stock (upsert)
      for (const r of usable) {
        const qty = Number(r.quantity);
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
          notes: fileInfo?.name
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

  const goodCount = rows.filter((r) => !r.problem).length;
  const newCount = rows.filter((r) => !r.problem && r.willCreate).length;

  return (
    <>
      <div className="page-header">
        <div className="page-title">Nhập kho Công ty (Excel)</div>
      </div>

      {err && <div className="alert alert-danger">{err}</div>}

      <div className="card mb-3">
        <div className="field">
          <label>Chọn file Excel</label>
          <input type="file" accept=".xlsx,.xls" onChange={onFile} className="input" />
          <div className="text-sub text-xs mt-1">
            Header: <b>Mã thuốc</b> | <b>Tên thuốc</b> | <b>Số lượng</b> | <b>Phân loại</b> — mã thuốc chưa có sẽ tự tạo trong Danh mục.
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Xem trước {rows.length} dòng</div>
            <div className="text-sub text-sm">
              Hợp lệ: <b>{goodCount}</b> · Sẽ tạo mới: <b>{newCount}</b>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Dòng</th><th>Mã</th><th>Tên</th><th>Phân loại</th>
                  <th className="text-right">Số lượng</th><th>Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="num">{r.row}</td>
                    <td className="num">{r.code || '—'}</td>
                    <td>{r.name || '—'}</td>
                    <td>{r.category || '—'}</td>
                    <td className="num text-right">{fmtNumber(r.quantity)}</td>
                    <td>
                      {r.problem
                        ? <span className="badge badge-danger">{r.problem}</span>
                        : r.willCreate
                          ? <span className="badge badge-warning">Tạo mới danh mục</span>
                          : <span className="badge badge-success">Khớp: {r.matched?.name}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-right">
            <button className="btn" onClick={() => nav(-1)}>Huỷ</button>{' '}
            <button className="btn btn-primary" disabled={importMut.isPending || goodCount === 0} onClick={() => importMut.mutate()}>
              {importMut.isPending ? 'Đang nhập…' : `Xác nhận nhập ${goodCount} dòng`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
