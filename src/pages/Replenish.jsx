import { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import { getFefoOrder, getStatusFromDays, daysUntil, getExpiryStatus } from '../lib/fefo.js';
import ExpiryBadge from '../components/shared/ExpiryBadge.jsx';
import BarcodeScanner from '../components/shared/BarcodeScanner.jsx';
import { fmtDate, fmtNumber, fmtQty, fmtQtyByLocation } from '../utils/format.js';

// Bổ sung tủ / hộp sơ cứu từ kho tổng hợp ĐL – có giỏ bổ sung nhiều dòng.
export default function Replenish() {
  const qc = useQueryClient();
  const { profile, isCompany } = useAuth();
  if (isCompany()) return <div className="alert alert-danger">Cty không bổ sung tủ.</div>;

  const orgId = profile?.organization_id;
  const [toLocId, setToLocId] = useState('');
  const [medicineId, setMedicineId] = useState('');
  const [qtyNeeded, setQtyNeeded] = useState('');
  const [cart, setCart] = useState([]); // {medicine, breakdown, take_total, current_in_dest, new_total}
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const scanRef = useRef(null);
  const qtyRef = useRef(null);

  // Locations của ĐL
  const { data: locs = [] } = useQuery({
    queryKey: ['locations-of', orgId],
    enabled: !!orgId,
    queryFn: async () => (await supabase.from('stock_locations').select('*').eq('organization_id', orgId).eq('is_active', true)).data || []
  });
  const warehouse = locs.find((l) => l.type === 'warehouse');
  const destinations = locs.filter((l) => l.type !== 'warehouse');

  // Tất cả lô đang có trong kho tổng hợp
  const { data: warehouseBatches = [] } = useQuery({
    queryKey: ['wh-batches', warehouse?.id],
    enabled: !!warehouse?.id,
    queryFn: async () => (await supabase
      .from('stock_batches')
      .select('*, medicine:medicines(id, code, name, unit, pack_size, base_unit)')
      .eq('location_id', warehouse.id)
      .gt('quantity', 0)
      .order('expiry_date')).data || []
  });

  // Gom theo medicine để làm dropdown "thuốc còn trong kho"
  const medicinesInStock = useMemo(() => {
    const map = new Map();
    for (const b of warehouseBatches) {
      const m = b.medicine;
      if (!m) continue;
      if (!map.has(m.id)) {
        map.set(m.id, { medicine: m, batches: [], total: 0, earliest: b.expiry_date });
      }
      const g = map.get(m.id);
      g.batches.push(b);
      g.total += b.quantity;
      if (new Date(b.expiry_date) < new Date(g.earliest)) g.earliest = b.expiry_date;
    }
    return Array.from(map.values()).sort((a, b) => a.medicine.name.localeCompare(b.medicine.name));
  }, [warehouseBatches]);

  // Tồn hiện tại của tủ đích, gom theo medicine
  const { data: destBatches = [] } = useQuery({
    queryKey: ['dest-batches', toLocId],
    enabled: !!toLocId,
    queryFn: async () => (await supabase
      .from('stock_batches')
      .select('medicine_id, quantity')
      .eq('location_id', toLocId)
      .gt('quantity', 0)).data || []
  });
  const currentInDestByMed = useMemo(() => {
    const m = {};
    for (const b of destBatches) m[b.medicine_id] = (m[b.medicine_id] || 0) + b.quantity;
    return m;
  }, [destBatches]);

  // Nhóm đang được chọn
  const selectedGroup = medicinesInStock.find((g) => g.medicine.id === medicineId);
  // Trừ đi phần đã có trong giỏ để không bổ sung quá tồn kho thực
  const alreadyInCart = (medId, batchId) => {
    let sum = 0;
    for (const item of cart) if (item.medicine.id === medId) {
      for (const b of item.breakdown) if (b.batch_id === batchId) sum += b.take;
    }
    return sum;
  };
  const availableBatches = useMemo(() => {
    if (!selectedGroup) return [];
    return selectedGroup.batches.map((b) => ({ ...b, quantity: b.quantity - alreadyInCart(selectedGroup.medicine.id, b.id) }));
  }, [selectedGroup, cart]);

  const fefo = useMemo(() => getFefoOrder(availableBatches, Number(qtyNeeded) || 0), [availableBatches, qtyNeeded]);

  const handleCode = (raw) => {
    const code = String(raw || '').trim();
    if (!code) return;
    const g = medicinesInStock.find((x) => x.medicine.code === code);
    if (!g) { setErr(`Kho ĐL không có thuốc mã "${code}"`); return; }
    setErr(null);
    setMedicineId(g.medicine.id);
    setTimeout(() => qtyRef.current?.focus(), 50);
  };

  const addToCart = () => {
    setErr(null);
    if (!toLocId) { setErr('Chọn tủ đích trước'); return; }
    if (!selectedGroup) { setErr('Chọn thuốc'); return; }
    const needed = Number(qtyNeeded);
    if (!needed || needed <= 0) { setErr('Nhập số lượng > 0'); return; }
    if (!fefo.is_fulfilled) { setErr(`Kho không đủ – còn thiếu ${fefo.shortage}`); return; }

    // Nếu đã có trong giỏ → cộng dồn
    const existingIdx = cart.findIndex((c) => c.medicine.id === selectedGroup.medicine.id);
    const breakdown = fefo.batches.map((b) => ({
      batch_id: b.id,
      batch_number: b.batch_number,
      expiry_date: b.expiry_date,
      manufacture_date: b.manufacture_date,
      unit: b.unit,
      take: b.suggested_quantity
    }));

    const m = selectedGroup.medicine;
    const pack = m.pack_size || 1;
    const take_in_base = needed * pack;   // Số Viên/base_unit sẽ đưa vào tủ
    const item = {
      medicine: m,
      breakdown,                            // theo Vỉ
      take_total: needed,                   // Vỉ user nhập
      take_in_base,                         // Viên tương ứng
      current_in_dest: currentInDestByMed[m.id] || 0  // Viên
    };
    item.new_total = item.current_in_dest + take_in_base;

    if (existingIdx >= 0) {
      const merged = { ...cart[existingIdx] };
      merged.take_total += needed;
      merged.take_in_base = merged.take_total * pack;
      const bMap = new Map(merged.breakdown.map((x) => [x.batch_id, { ...x }]));
      for (const nb of breakdown) {
        if (bMap.has(nb.batch_id)) bMap.get(nb.batch_id).take += nb.take;
        else bMap.set(nb.batch_id, { ...nb });
      }
      merged.breakdown = Array.from(bMap.values()).sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));
      merged.new_total = merged.current_in_dest + merged.take_in_base;
      setCart(cart.map((c, i) => (i === existingIdx ? merged : c)));
    } else {
      setCart([...cart, item]);
    }

    setMedicineId('');
    setQtyNeeded('');
  };

  const removeFromCart = (medId) => setCart(cart.filter((c) => c.medicine.id !== medId));

  const totalItems = cart.length;
  const totalQty = cart.reduce((s, c) => s + c.take_total, 0);

  const submitMut = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error('Giỏ trống');
      if (!toLocId) throw new Error('Chọn tủ đích');

      for (const item of cart) {
        const pack = item.medicine.pack_size || 1;
        for (const b of item.breakdown) {
          const takeInPack = b.take;                  // số Vỉ trừ khỏi kho
          const takeInBase = takeInPack * pack;       // số Viên cộng vào tủ

          // 1) trừ kho (theo Vỉ)
          const { data: source, error: sErr } = await supabase.from('stock_batches').select('quantity').eq('id', b.batch_id).single();
          if (sErr) throw sErr;
          const { error: u1 } = await supabase.from('stock_batches').update({ quantity: source.quantity - takeInPack }).eq('id', b.batch_id);
          if (u1) throw u1;

          const days = daysUntil(b.expiry_date);
          // 2) tăng ở đích (theo Viên nếu tủ + có pack_size)
          const { data: existing } = await supabase
            .from('stock_batches').select('*')
            .eq('location_id', toLocId)
            .eq('medicine_id', item.medicine.id)
            .eq('expiry_date', b.expiry_date)
            .maybeSingle();

          let destBatchId;
          if (existing) {
            const { error: u2 } = await supabase.from('stock_batches')
              .update({ quantity: existing.quantity + takeInBase, expiry_status: getStatusFromDays(days) })
              .eq('id', existing.id);
            if (u2) throw u2;
            destBatchId = existing.id;
          } else {
            const { data: created, error: iErr } = await supabase.from('stock_batches').insert({
              medicine_id: item.medicine.id, location_id: toLocId, organization_id: orgId,
              batch_number: b.batch_number, quantity: takeInBase, initial_quantity: takeInBase, unit: b.unit,
              manufacture_date: b.manufacture_date, expiry_date: b.expiry_date,
              source_type: 'from_company', source_ref: b.batch_id,
              expiry_status: getStatusFromDays(days), created_by: profile.id
            }).select().single();
            if (iErr) throw iErr;
            destBatchId = created.id;
          }

          const { error: tErr } = await supabase.from('transactions').insert({
            type: 'replenish_location', batch_id: destBatchId,
            from_location: warehouse.id, to_location: toLocId, quantity: takeInBase,
            performed_by: profile.id, notes: `FEFO source ${b.batch_id} · ${takeInPack} ${item.medicine.unit} → ${takeInBase} ${item.medicine.base_unit || item.medicine.unit}`
          });
          if (tErr) throw tErr;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['batches'] });
      qc.invalidateQueries({ queryKey: ['wh-batches', warehouse?.id] });
      qc.invalidateQueries({ queryKey: ['dest-batches', toLocId] });
      setOk(`Đã bổ sung ${totalItems} loại · ${totalQty} đơn vị vào ${destinations.find((d) => d.id === toLocId)?.name}`);
      setCart([]);
      setMedicineId('');
      setQtyNeeded('');
      setTimeout(() => setOk(null), 6000);
    },
    onError: (e) => setErr(e.message)
  });

  if (!warehouse && orgId) return <div className="alert alert-warning">Đơn vị chưa có kho tổng hợp. Vào <b>Vị trí kho/tủ</b> tạo trước.</div>;

  return (
    <>
      <div className="page-header"><div className="page-title">Bổ sung tủ / hộp sơ cứu (FEFO)</div></div>
      {err && <div className="alert alert-danger">{err}</div>}
      {ok && <div className="alert alert-success">✅ {ok}</div>}

      <div className="card mb-3">
        <div className="field">
          <label>Bổ sung cho</label>
          <select className="select" value={toLocId} onChange={(e) => { setToLocId(e.target.value); setCart([]); }}>
            <option value="">— Chọn tủ / hộp —</option>
            {destinations.map((l) => <option key={l.id} value={l.id}>{l.name} · {l.type === 'cabinet' ? 'Tủ thuốc' : 'Hộp sơ cứu'}</option>)}
          </select>
        </div>
      </div>

      {toLocId && (
        <div className="card mb-3">
          <div className="card-header"><div className="card-title">Thêm thuốc vào giỏ</div></div>

          <div className="field">
            <label>Quét barcode</label>
            <div className="row">
              <input
                ref={scanRef}
                className="input"
                placeholder="Máy quét USB / gõ tay + Enter…"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = e.target.value; e.target.value = ''; handleCode(v); } }}
                style={{ flex: 1, minWidth: 200 }}
              />
              <button className="btn btn-primary" onClick={() => setShowScanner(true)}>📷 Camera</button>
            </div>
          </div>

          <div className="row">
            <div className="field" style={{ flex: 2, minWidth: 240 }}>
              <label>Hoặc chọn từ kho (chỉ thuốc còn tồn)</label>
              <select className="select" value={medicineId} onChange={(e) => setMedicineId(e.target.value)}>
                <option value="">— Chọn thuốc —</option>
                {medicinesInStock.map((g) => {
                  const s = getExpiryStatus(g.earliest);
                  const emoji = s.status === 'expired' || s.status === 'urgent' || s.status === 'final_check' ? '🔴'
                    : s.status === 'action_required' ? '🟠'
                    : s.status === 'watch' ? '🟡' : '🟢';
                  return (
                    <option key={g.medicine.id} value={g.medicine.id}>
                      {g.medicine.name} · Còn {fmtQty(g.total, g.medicine, { compact: true })} · HSD {fmtDate(g.earliest)} {emoji}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>Số lượng cần</label>
              <input ref={qtyRef} className="input num" type="number" min="1" value={qtyNeeded} onChange={(e) => setQtyNeeded(e.target.value)} />
            </div>
            <div className="field" style={{ alignSelf: 'flex-end' }}>
              <button className="btn btn-primary" disabled={!medicineId || !qtyNeeded} onClick={addToCart}>+ Thêm vào giỏ</button>
            </div>
          </div>

          {selectedGroup && (
            <div className="alert alert-info" style={{ marginTop: 8 }}>
              <b>{selectedGroup.medicine.name}</b> — Kho còn {fmtQty(availableBatches.reduce((s, b) => s + b.quantity, 0), selectedGroup.medicine)} · Tủ đích đang có <b className="num">{currentInDestByMed[selectedGroup.medicine.id] || 0}</b> {selectedGroup.medicine.base_unit || selectedGroup.medicine.unit}
              {qtyNeeded > 0 && (
                <div className="text-sm mt-1">
                  <b>FEFO sẽ lấy:</b>{' '}
                  {fefo.batches.length === 0 ? '—' : fefo.batches.map((b, i) => (
                    <span key={b.id}>
                      {i > 0 && ' · '}
                      {b.suggested_quantity} từ lô {b.batch_number || 'không mã'} <ExpiryBadge date={b.expiry_date} />
                    </span>
                  ))}
                  {!fefo.is_fulfilled && <span className="text-danger"> (thiếu {fefo.shortage})</span>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {cart.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Giỏ bổ sung · {totalItems} loại · {totalQty} đơn vị</div>
            <button className="btn btn-sm" onClick={() => setCart([])}>Xoá giỏ</button>
          </div>
          <div className="stack">
            {cart.map((item) => (
              <div key={item.medicine.id} className="card" style={{ borderLeft: '4px solid var(--c-primary)' }}>
                <div className="row items-center justify-between">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{item.medicine.name}</div>
                    <div className="text-sm text-sub mt-1">
                      Tủ hiện có: <b className="num">{fmtNumber(item.current_in_dest)} {item.medicine.base_unit || item.medicine.unit}</b>
                      {' · '}Bổ sung: <b className="num text-success">+ {fmtNumber(item.take_total)} {item.medicine.unit}{item.medicine.pack_size ? ` (= ${fmtNumber(item.take_in_base)} ${item.medicine.base_unit})` : ''}</b>
                      {' · '}Sau bổ sung: <b className="num">{fmtNumber(item.new_total)} {item.medicine.base_unit || item.medicine.unit}</b>
                    </div>
                    <div className="text-xs text-sub mt-1">
                      Chi tiết lô:{' '}
                      {item.breakdown.map((b, i) => (
                        <span key={b.batch_id}>
                          {i > 0 && ' · '}
                          <b className="num">{b.take}</b> từ lô {b.batch_number || 'không mã'} <ExpiryBadge date={b.expiry_date} />
                        </span>
                      ))}
                    </div>
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={() => removeFromCart(item.medicine.id)}>🗑️</button>
                </div>
              </div>
            ))}
          </div>

          <div className="alert alert-warning mt-3">
            ⚠️ Nhớ đặt các lô có HSD gần nhất ra <b>phía trước tủ</b> để dùng trước.
          </div>

          <div className="mt-3 text-right">
            <button
              className="btn btn-primary btn-lg"
              disabled={submitMut.isPending}
              onClick={() => submitMut.mutate()}
            >
              {submitMut.isPending ? 'Đang xử lý…' : `✅ Xác nhận bổ sung ${totalItems} loại · ${totalQty} đơn vị`}
            </button>
          </div>
        </div>
      )}

      {showScanner && (
        <BarcodeScanner
          onDetect={(code) => { setShowScanner(false); handleCode(code); }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </>
  );
}
