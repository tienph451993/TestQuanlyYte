import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import { fmtDate, fmtNumber } from '../utils/format.js';
import ExpiryBadge from '../components/shared/ExpiryBadge.jsx';
import { daysUntil } from '../lib/fefo.js';

// Gợi ý: ĐL có lô sắp HH (≤60 ngày) ↔ ĐL đang thiếu (< min_stock)
// Chỉ tính theo tồn ở KHO tổng hợp (theo Vỉ).
export default function TransferSuggest() {
  const { profile, isCompany } = useAuth();

  const { data: batches = [] } = useQuery({
    queryKey: ['suggest-warehouse-batches'],
    queryFn: async () => (await supabase
      .from('stock_batches')
      .select('id, medicine_id, organization_id, quantity, expiry_date, batch_number, medicine:medicines(id, name, unit, min_stock_unit), organization:organizations(id, name), location:stock_locations!location_id(type)')
      .gt('quantity', 0)).data || []
  });

  const suggestions = useMemo(() => {
    const whBatches = batches.filter((b) => b.location?.type === 'warehouse');
    // ĐL có lô sắp HH (≤ 60 ngày)
    const donors = whBatches.filter((b) => {
      const d = daysUntil(b.expiry_date);
      return d > 0 && d <= 60;
    });
    // Tổng tồn theo (org, medicine) ở KHO
    const totals = new Map();
    for (const b of whBatches) {
      const key = `${b.organization_id}::${b.medicine_id}`;
      totals.set(key, (totals.get(key) || 0) + b.quantity);
    }
    // ĐL đang thiếu (dưới min_stock)
    const orgs = new Set(whBatches.map((b) => b.organization_id));
    const needs = [];
    for (const b of whBatches) {
      const min = b.medicine?.min_stock_unit || 0;
      const key = `${b.organization_id}::${b.medicine_id}`;
      const total = totals.get(key) || 0;
      if (min > 0 && total < min) {
        needs.push({ org_id: b.organization_id, org_name: b.organization?.name, medicine_id: b.medicine_id, medicine: b.medicine, total, need: min - total });
      }
    }
    // Ghép donor ↔ need cùng medicine, khác org
    const pairs = [];
    for (const d of donors) {
      for (const n of needs) {
        if (d.medicine_id !== n.medicine_id || d.organization_id === n.org_id) continue;
        pairs.push({
          donor_batch: d,
          donor_org: d.organization?.name,
          donor_org_id: d.organization_id,
          receiver_org: n.org_name,
          receiver_org_id: n.org_id,
          medicine: d.medicine,
          suggest_qty: Math.min(d.quantity, n.need),
          days_left: daysUntil(d.expiry_date),
          urgency: daysUntil(d.expiry_date) <= 30 ? 'high' : 'medium'
        });
      }
    }
    return pairs.sort((a, b) => a.days_left - b.days_left);
  }, [batches]);

  const scoped = isCompany() ? suggestions : suggestions.filter((s) => s.donor_org_id === profile?.organization_id || s.receiver_org_id === profile?.organization_id);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">💡 Gợi ý điều chuyển</div>
          <div className="text-sub text-sm">Ghép ĐL có lô sắp HH (≤60 ngày) ↔ ĐL đang thiếu (dưới tồn tối thiểu).</div>
        </div>
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl tbl-hover">
            <thead>
              <tr>
                <th>Thuốc</th><th>Từ (dư)</th><th>Đến (thiếu)</th>
                <th>HSD lô</th><th className="text-right">Còn</th><th className="text-right">Gợi ý</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {scoped.map((s, i) => {
                const iAmDonor = s.donor_org_id === profile?.organization_id;
                return (
                  <tr key={i}>
                    <td><b>{s.medicine?.name}</b></td>
                    <td>{s.donor_org}{iAmDonor && ' (bạn)'}</td>
                    <td>{s.receiver_org}</td>
                    <td><ExpiryBadge date={s.donor_batch.expiry_date} withDate /></td>
                    <td className="num text-right">{fmtNumber(s.donor_batch.quantity)} {s.medicine?.unit}</td>
                    <td className="num text-right">
                      <span className={`badge ${s.urgency === 'high' ? 'badge-danger' : 'badge-warning'}`}>
                        {fmtNumber(s.suggest_qty)} {s.medicine?.unit}
                      </span>
                    </td>
                    <td className="text-right">
                      {iAmDonor && (
                        <Link className="btn btn-sm btn-primary"
                          to={`/transfers/new?batch=${s.donor_batch.id}&to=${s.receiver_org_id}&qty=${s.suggest_qty}`}>
                          Tạo điều chuyển
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
              {scoped.length === 0 && <tr><td colSpan={7} className="empty-state">Chưa có gợi ý nào phù hợp.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
