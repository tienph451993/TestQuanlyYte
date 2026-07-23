import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import ExpiryBadge from '../components/shared/ExpiryBadge.jsx';
import { fmtNumber } from '../utils/format.js';

export default function Dashboard() {
  const { profile, isCompany } = useAuth();
  return isCompany() ? <CompanyDashboard profile={profile} /> : <UnitDashboard profile={profile} />;
}

function CompanyDashboard({ profile }) {
  const { data: companyStock = [] } = useQuery({
    queryKey: ['dash-company-stock'],
    queryFn: async () => (await supabase.from('company_stock').select('quantity, medicine:medicines(name)')).data || []
  });

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['dash-pending'],
    queryFn: async () => {
      const { count } = await supabase.from('distributions').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      return count ?? 0;
    }
  });

  const { data: byOrg = [] } = useQuery({
    queryKey: ['dash-by-org'],
    queryFn: async () => {
      const { data } = await supabase
        .from('stock_batches')
        .select('quantity, expiry_status, organization:organizations(name)')
        .gt('quantity', 0);
      const map = {};
      for (const b of data || []) {
        const name = b.organization?.name || '—';
        map[name] = map[name] || { name, qty: 0, expiring: 0 };
        map[name].qty += b.quantity;
        if (['watch','action_required','urgent','final_check'].includes(b.expiry_status)) map[name].expiring += 1;
      }
      return Object.values(map).sort((a, b) => b.expiring - a.expiring);
    }
  });

  const totalCompanyQty = companyStock.reduce((s, r) => s + r.quantity, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Xin chào, {profile?.full_name || 'bạn'}</div>
          <div className="text-sub text-sm">Dashboard Công ty – tổng hợp toàn hệ thống</div>
        </div>
      </div>

      <div className="grid-4 mb-4">
        <Kpi label="Loại thuốc trong kho Cty" value={fmtNumber(companyStock.length)} />
        <Kpi label="Tổng tồn kho Cty" value={fmtNumber(totalCompanyQty)} />
        <Kpi label="Phiếu phân phối chờ nhận" value={fmtNumber(pendingCount)} tone="warning" />
        <Kpi label="Số ĐL có dữ liệu" value={fmtNumber(byOrg.length)} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Tồn kho theo Điện lực</div>
            <Link className="btn btn-sm" to="/distributions">Xem phân phối</Link>
          </div>
          {byOrg.length === 0 ? <div className="empty-state">Chưa ĐL nào có dữ liệu</div> : (
            <table className="tbl">
              <thead><tr><th>Điện lực</th><th className="text-right">Tổng SL</th><th className="text-right">Lô sắp HSD</th></tr></thead>
              <tbody>
                {byOrg.map((o) => (
                  <tr key={o.name}>
                    <td>{o.name}</td>
                    <td className="num text-right">{fmtNumber(o.qty)}</td>
                    <td className="num text-right">{o.expiring > 0 ? <span className="badge badge-warning">{o.expiring}</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Công việc Công ty</div></div>
          <div className="stack">
            <Link className="btn btn-primary btn-lg" to="/company/import">📥 Nhập kho Công ty (Excel)</Link>
            <Link className="btn btn-lg" to="/distributions/new">📤 Tạo phiếu phân phối về ĐL</Link>
            <Link className="btn btn-lg" to="/medicines">🩺 Quản lý danh mục thuốc</Link>
          </div>
          <div className="alert alert-info mt-3">
            Cty không tự vào kho ĐL — chỉ xem báo cáo tổng hợp. ĐL tự quản lý kho/tủ và nhận hàng phân phối.
          </div>
        </div>
      </div>
    </>
  );
}

function UnitDashboard({ profile }) {
  const { data: batches = [] } = useQuery({
    queryKey: ['unit-batches'],
    queryFn: async () => (await supabase
      .from('stock_batches')
      .select('id, quantity, expiry_status').gt('quantity', 0)).data || []
  });

  const { data: pendingDist = 0 } = useQuery({
    queryKey: ['unit-pending-dist', profile?.organization_id],
    enabled: !!profile,
    queryFn: async () => {
      const { count } = await supabase
        .from('distributions').select('id', { count: 'exact', head: true })
        .eq('status', 'pending').eq('to_org_id', profile.organization_id);
      return count ?? 0;
    }
  });

  const { data: soonBatches = [] } = useQuery({
    queryKey: ['unit-soon'],
    queryFn: async () => {
      const in90 = new Date(); in90.setDate(in90.getDate() + 90);
      const { data } = await supabase
        .from('stock_batches')
        .select('*, medicine:medicines(name, unit), location:stock_locations(name)')
        .gt('quantity', 0)
        .lte('expiry_date', in90.toISOString().slice(0, 10))
        .order('expiry_date').limit(10);
      return data || [];
    }
  });

  const total = batches.reduce((s, b) => s + b.quantity, 0);
  const byStatus = batches.reduce((m, b) => (m[b.expiry_status] = (m[b.expiry_status] || 0) + 1, m), {});
  const expiring = (byStatus.watch || 0) + (byStatus.action_required || 0) + (byStatus.urgent || 0) + (byStatus.final_check || 0);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Xin chào, {profile?.full_name || 'bạn'}</div>
          <div className="text-sub text-sm">{profile?.organization?.name}</div>
        </div>
      </div>

      <div className="grid-4 mb-4">
        <Kpi label="Số lô đang có tồn" value={fmtNumber(batches.length)} />
        <Kpi label="Tổng tồn kho ĐL" value={fmtNumber(total)} />
        <Kpi label="Lô sắp HSD (≤90 ngày)" value={fmtNumber(expiring)} tone="warning" />
        <Kpi label="Phiếu Cty chờ nhận" value={fmtNumber(pendingDist)} tone={pendingDist > 0 ? 'warning' : undefined} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Lô sắp hết hạn (top 10)</div>
            <Link className="btn btn-sm" to="/inventory">Xem tồn kho</Link>
          </div>
          {soonBatches.length === 0 ? <div className="empty-state">Chưa có lô sắp HSD 🎉</div> : (
            <table className="tbl">
              <thead><tr><th>Vị trí</th><th>Thuốc</th><th>HSD</th><th className="text-right">SL</th></tr></thead>
              <tbody>
                {soonBatches.map((b) => (
                  <tr key={b.id}>
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
          <div className="card-header"><div className="card-title">Việc cần làm</div></div>
          <div className="stack">
            {pendingDist > 0 && <Link className="btn btn-primary btn-lg" to="/distributions">🚚 Nhận {pendingDist} phiếu từ Cty</Link>}
            <Link className="btn btn-lg" to="/inventory/replenish">📤 Bổ sung tủ / hộp (FEFO)</Link>
            <Link className="btn btn-lg" to="/locations">🏢 Quản lý vị trí kho/tủ</Link>
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
      <span className={`badge ${cls} mt-2`}>Cập nhật realtime</span>
    </div>
  );
}
