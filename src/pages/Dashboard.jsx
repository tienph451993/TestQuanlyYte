import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import ExpiryBadge from '../components/shared/ExpiryBadge.jsx';
import { fmtNumber } from '../utils/format.js';

export default function Dashboard() {
  const { profile, isCompany } = useAuth();
  const orgLabel = isCompany() ? 'toàn hệ thống' : profile?.organization?.name;

  const { data: kpi } = useQuery({
    queryKey: ['dashboard-kpi', profile?.id],
    queryFn: async () => {
      const [{ data: batches }, { data: locs }] = await Promise.all([
        supabase.from('stock_batches').select('id, quantity, expiry_status').gt('quantity', 0),
        supabase.from('stock_locations').select('id, type').eq('is_active', true)
      ]);
      const total = (batches || []).reduce((s, b) => s + b.quantity, 0);
      const byStatus = {};
      for (const b of batches || []) byStatus[b.expiry_status] = (byStatus[b.expiry_status] || 0) + 1;
      const byLocType = {};
      for (const l of locs || []) byLocType[l.type] = (byLocType[l.type] || 0) + 1;
      return {
        total_qty: total,
        batch_count: batches?.length || 0,
        expiring_soon: (byStatus.watch || 0) + (byStatus.action_required || 0) + (byStatus.urgent || 0) + (byStatus.final_check || 0),
        expired: byStatus.expired || 0,
        loc_count: locs?.length || 0,
        loc_by_type: byLocType
      };
    }
  });

  const { data: soonBatches = [] } = useQuery({
    queryKey: ['soon-batches'],
    queryFn: async () => {
      const in90 = new Date();
      in90.setDate(in90.getDate() + 90);
      const { data } = await supabase
        .from('stock_batches')
        .select('*, medicine:medicines(name, unit), location:stock_locations(name), organization:organizations(name)')
        .gt('quantity', 0)
        .lte('expiry_date', in90.toISOString().slice(0, 10))
        .order('expiry_date')
        .limit(10);
      return data || [];
    }
  });

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Xin chào, {profile?.full_name || 'bạn'}</div>
          <div className="text-sub text-sm">Tổng quan {orgLabel}</div>
        </div>
      </div>

      <div className="grid-4 mb-4">
        <Kpi label="Số lô đang có tồn" value={fmtNumber(kpi?.batch_count)} />
        <Kpi label="Tổng số lượng tồn" value={fmtNumber(kpi?.total_qty)} />
        <Kpi label="Lô sắp hết hạn (≤90 ngày)" value={fmtNumber(kpi?.expiring_soon)} tone="warning" />
        <Kpi label="Lô đã hết hạn" value={fmtNumber(kpi?.expired)} tone="danger" />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Lô sắp hết hạn (top 10)</div>
            <Link className="btn btn-sm" to="/inventory">Xem tồn kho</Link>
          </div>
          {soonBatches.length === 0 && <div className="empty-state">Chưa có lô nào sắp hết hạn 🎉</div>}
          {soonBatches.length > 0 && (
            <table className="tbl">
              <thead>
                <tr>
                  {isCompany() && <th>Đơn vị</th>}
                  <th>Vị trí</th><th>Thuốc</th><th>HSD</th><th className="text-right">Số lượng</th>
                </tr>
              </thead>
              <tbody>
                {soonBatches.map((b) => (
                  <tr key={b.id}>
                    {isCompany() && <td>{b.organization?.name}</td>}
                    <td>{b.location?.name}</td>
                    <td>{b.medicine?.name}</td>
                    <td><ExpiryBadge date={b.expiry_date} withDate /></td>
                    <td className="num text-right">{fmtNumber(b.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Vị trí kho / tủ / hộp</div>
            <Link className="btn btn-sm" to="/locations">Quản lý</Link>
          </div>
          <div className="stack">
            <RowStat label="Kho tổng hợp" value={kpi?.loc_by_type?.warehouse ?? 0} />
            <RowStat label="Tủ thuốc" value={kpi?.loc_by_type?.cabinet ?? 0} />
            <RowStat label="Hộp sơ cứu" value={kpi?.loc_by_type?.first_aid_kit ?? 0} />
          </div>
          <div className="alert alert-info mt-3">
            Phase 1: nhập kho từ Cty, bổ sung tủ theo FEFO, CRUD danh mục & vị trí. Kiểm kê + cảnh báo HSD sẽ có ở Phase 2.
          </div>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, tone }) {
  const cls = tone === 'warning' ? 'badge-warning' : tone === 'danger' ? 'badge-danger' : 'badge-primary';
  return (
    <div className="card">
      <div className="text-sub text-xs" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div className="num" style={{ fontSize: 30, fontWeight: 600, marginTop: 4 }}>{value ?? '—'}</div>
      <span className={`badge ${cls} mt-2`}>{label.split(' ')[0]}</span>
    </div>
  );
}

function RowStat({ label, value }) {
  return (
    <div className="row items-center justify-between" style={{ padding: '8px 0', borderBottom: '1px dashed var(--c-border)' }}>
      <div>{label}</div>
      <div className="num" style={{ fontWeight: 600 }}>{fmtNumber(value)}</div>
    </div>
  );
}
