import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import { fmtNumber, fmtQty } from '../utils/format.js';

const blankLine = () => ({ medicine_id: '', quantity: '' });

export default function DistributionNew() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { profile, isCompany } = useAuth();
  const [toOrg, setToOrg] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([blankLine()]);
  const [err, setErr] = useState(null);

  if (!isCompany()) return <div className="alert alert-danger">Chỉ Công ty được tạo phiếu phân phối.</div>;

  const { data: orgs = [] } = useQuery({
    queryKey: ['orgs-units'],
    queryFn: async () => (await supabase.from('organizations').select('*').eq('type', 'unit').order('code')).data || []
  });

  const { data: stock = [] } = useQuery({
    queryKey: ['company-stock-picker'],
    queryFn: async () => (await supabase
      .from('company_stock')
      .select('quantity, medicine:medicines(id, code, name, unit, pack_size, base_unit)')
      .gt('quantity', 0)).data || []
  });

  const stockByMed = Object.fromEntries(stock.map((s) => [s.medicine.id, s.quantity]));

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!toOrg) throw new Error('Chọn Điện lực nhận');
      const valid = lines.filter((l) => l.medicine_id && Number(l.quantity) > 0);
      if (valid.length === 0) throw new Error('Cần ít nhất 1 dòng');

      // Kiểm tra tồn kho Cty
      for (const l of valid) {
        const q = Number(l.quantity);
        if (q > (stockByMed[l.medicine_id] || 0)) {
          throw new Error('Kho Cty không đủ số lượng cho ít nhất 1 dòng');
        }
      }

      // Sinh code phiếu
      const { data: codeRow, error: codeErr } = await supabase.rpc('gen_distribution_code');
      if (codeErr) throw codeErr;

      const { data: dist, error: dErr } = await supabase.from('distributions').insert({
        code: codeRow,
        to_org_id: toOrg,
        notes,
        created_by: profile.id
      }).select().single();
      if (dErr) throw dErr;

      for (const l of valid) {
        const q = Number(l.quantity);
        const { error: iErr } = await supabase.from('distribution_items').insert({
          distribution_id: dist.id,
          medicine_id: l.medicine_id,
          quantity: q
        });
        if (iErr) throw iErr;

        // Trừ kho Cty ngay
        const cur = stockByMed[l.medicine_id];
        const { error: uErr } = await supabase.from('company_stock')
          .update({ quantity: cur - q, updated_at: new Date().toISOString() })
          .eq('medicine_id', l.medicine_id);
        if (uErr) throw uErr;

        const { error: mErr } = await supabase.from('company_stock_movements').insert({
          medicine_id: l.medicine_id,
          quantity: -q,
          type: 'distribute_to_unit',
          reference_id: dist.id,
          performed_by: profile.id
        });
        if (mErr) throw mErr;
      }
      return dist;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-stock'] });
      qc.invalidateQueries({ queryKey: ['distributions'] });
      nav('/distributions');
    },
    onError: (e) => setErr(e.message)
  });

  const update = (i, k, v) => setLines((prev) => prev.map((ln, idx) => idx === i ? { ...ln, [k]: v } : ln));

  return (
    <>
      <div className="page-header"><div className="page-title">Phân phối thuốc về Điện lực</div></div>
      {err && <div className="alert alert-danger">{err}</div>}

      <div className="card mb-3">
        <div className="grid-2">
          <div className="field">
            <label>Điện lực nhận</label>
            <select className="select" value={toOrg} onChange={(e) => setToOrg(e.target.value)}>
              <option value="">— Chọn —</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Ghi chú</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Đợt phát Q1/2026…" />
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
                <th>Thuốc</th>
                <th className="text-right">Tồn kho Cty</th>
                <th style={{ width: 150 }}>Số lượng phát</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((ln, i) => (
                <tr key={i}>
                  <td>
                    <select className="select" value={ln.medicine_id} onChange={(e) => update(i, 'medicine_id', e.target.value)}>
                      <option value="">— Chọn —</option>
                      {stock.map((s) => <option key={s.medicine.id} value={s.medicine.id}>{s.medicine.name} · Cty còn {fmtQty(s.quantity, s.medicine, { compact: true })}</option>)}
                    </select>
                  </td>
                  <td className="num text-right">{ln.medicine_id ? fmtNumber(stockByMed[ln.medicine_id]) : '—'}</td>
                  <td><input className="input num" type="number" min="1" value={ln.quantity} onChange={(e) => update(i, 'quantity', e.target.value)} /></td>
                  <td className="text-right">
                    <button className="btn btn-sm" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="alert alert-info mt-3">
          Số lô và HSD sẽ do Điện lực nhập khi họ kiểm và nhận hàng thực tế.
        </div>
        <div className="mt-3 text-right">
          <button className="btn" onClick={() => nav(-1)}>Huỷ</button>{' '}
          <button className="btn btn-primary" disabled={submitMut.isPending} onClick={() => submitMut.mutate()}>
            {submitMut.isPending ? 'Đang tạo…' : 'Tạo phiếu phân phối'}
          </button>
        </div>
      </div>
    </>
  );
}
