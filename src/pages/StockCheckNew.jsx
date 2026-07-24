import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import { todayISO } from '../utils/format.js';

export default function StockCheckNew() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const [locId, setLocId] = useState('');
  const [checkDate, setCheckDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState(null);

  const { data: locs = [] } = useQuery({
    queryKey: ['locations-of', profile?.organization_id],
    enabled: !!profile,
    queryFn: async () => (await supabase
      .from('stock_locations')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .eq('is_active', true)
      .order('name')).data || []
  });

  const selectedLoc = locs.find((l) => l.id === locId);
  const checkType = selectedLoc?.check_cycle === 'quarterly' ? 'quarterly' : selectedLoc?.check_cycle === 'monthly' ? 'monthly' : null;

  const createMut = useMutation({
    mutationFn: async () => {
      if (!locId) throw new Error('Chọn vị trí');
      if (!selectedLoc) throw new Error('Vị trí không hợp lệ');

      // 1) Tạo header
      const { data: check, error: cErr } = await supabase.from('stock_checks').insert({
        location_id: locId,
        organization_id: profile.organization_id,
        check_date: checkDate,
        check_type: checkType,
        status: 'in_progress',
        notes,
        checked_by: profile.id
      }).select().single();
      if (cErr) throw cErr;

      // 2) Sinh items từ tồn kho hiện tại
      const { data: batches } = await supabase
        .from('stock_batches')
        .select('id, medicine_id, quantity, expiry_date')
        .eq('location_id', locId)
        .gt('quantity', 0);

      if (checkType === 'quarterly') {
        // Kiểm theo LÔ
        const items = (batches || []).map((b) => ({
          check_id: check.id, medicine_id: b.medicine_id, batch_id: b.id,
          system_quantity: b.quantity, actual_quantity: b.quantity
        }));
        if (items.length > 0) {
          const { error: iErr } = await supabase.from('stock_check_items').insert(items);
          if (iErr) throw iErr;
        }
      } else {
        // Kiểm theo TỔNG mỗi medicine
        const byMed = new Map();
        for (const b of batches || []) byMed.set(b.medicine_id, (byMed.get(b.medicine_id) || 0) + b.quantity);
        const items = Array.from(byMed.entries()).map(([medicine_id, q]) => ({
          check_id: check.id, medicine_id, system_quantity: q, actual_quantity: q
        }));
        if (items.length > 0) {
          const { error: iErr } = await supabase.from('stock_check_items').insert(items);
          if (iErr) throw iErr;
        }
      }
      return check.id;
    },
    onSuccess: (id) => nav(`/stock-checks/${id}`),
    onError: (e) => setErr(e.message)
  });

  return (
    <>
      <div className="page-header"><div className="page-title">Tạo phiếu kiểm kê</div></div>
      {err && <div className="alert alert-danger">{err}</div>}

      <div className="card">
        <div className="grid-2">
          <div className="field">
            <label>Vị trí kiểm kê</label>
            <select className="select" value={locId} onChange={(e) => setLocId(e.target.value)}>
              <option value="">— Chọn vị trí —</option>
              {locs.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.type === 'warehouse' ? 'Kho' : l.type === 'cabinet' ? 'Tủ' : 'Hộp sơ cứu'}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Ngày kiểm</label>
            <input className="input" type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)} />
          </div>
        </div>

        {selectedLoc && (
          <div className="alert alert-info">
            <b>{selectedLoc.name}</b> — chu kỳ <b>{checkType === 'quarterly' ? 'quý' : 'tháng'}</b>.<br />
            {checkType === 'quarterly'
              ? 'Kiểm kê theo TỪNG LÔ (kho tổng hợp còn hộp nguyên, phân biệt được lô).'
              : 'Kiểm kê theo TỔNG SỐ mỗi loại. Hệ thống sẽ tự phân bổ FEFO ngược để trừ dần từ lô HSD gần nhất.'}
          </div>
        )}

        <div className="field">
          <label>Ghi chú</label>
          <textarea className="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="mt-3 text-right">
          <button className="btn" onClick={() => nav(-1)}>Huỷ</button>{' '}
          <button className="btn btn-primary" disabled={!locId || createMut.isPending} onClick={() => createMut.mutate()}>
            {createMut.isPending ? 'Đang tạo…' : 'Tạo phiếu & bắt đầu kiểm'}
          </button>
        </div>
      </div>
    </>
  );
}
