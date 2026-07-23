import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import ExpiryBadge from '../components/shared/ExpiryBadge.jsx';
import { fmtNumber } from '../utils/format.js';

export default function Inventory() {
  const { profile, isCompany } = useAuth();
  const [locFilter, setLocFilter] = useState('all');
  const [orgFilter, setOrgFilter] = useState('all');

  const { data: orgs = [] } = useQuery({
    queryKey: ['orgs'],
    queryFn: async () => (await supabase.from('organizations').select('*').order('code')).data || []
  });

  const { data: locs = [] } = useQuery({
    queryKey: ['locations-all'],
    queryFn: async () => {
      const { data } = await supabase.from('stock_locations').select('*, organization:organizations(name)');
      return data || [];
    }
  });

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_batches')
        .select('*, medicine:medicines(code, name, unit), location:stock_locations(name, type), organization:organizations(name)')
        .gt('quantity', 0)
        .order('expiry_date');
      if (error) throw error;
      return data;
    }
  });

  const filtered = useMemo(() => {
    return batches.filter((b) => {
      if (locFilter !== 'all' && b.location_id !== locFilter) return false;
      if (orgFilter !== 'all' && b.organization_id !== orgFilter) return false;
      return true;
    });
  }, [batches, locFilter, orgFilter]);

  return (
    <>
      <div className="page-header">
        <div className="page-title">Tồn kho theo lô</div>
        <div className="row">
          {!isCompany() && <Link className="btn btn-primary" to="/inventory/replenish">📤 Bổ sung tủ (FEFO)</Link>}
        </div>
      </div>

      <div className="card mb-3">
        <div className="row">
          {isCompany() && (
            <div className="field" style={{ minWidth: 220 }}>
              <label>Đơn vị</label>
              <select className="select" value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
                <option value="all">Tất cả</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <div className="field" style={{ minWidth: 220 }}>
            <label>Vị trí</label>
            <select className="select" value={locFilter} onChange={(e) => setLocFilter(e.target.value)}>
              <option value="all">Tất cả</option>
              {locs
                .filter((l) => orgFilter === 'all' || l.organization_id === orgFilter)
                .map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        {isLoading ? <div className="empty-state">Đang tải…</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl tbl-hover">
              <thead>
                <tr>
                  {isCompany() && <th>Đơn vị</th>}
                  <th>Vị trí</th><th>Thuốc</th><th>Lô</th><th>HSD</th>
                  <th className="text-right">Số lượng</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id}>
                    {isCompany() && <td>{b.organization?.name}</td>}
                    <td>{b.location?.name}</td>
                    <td>{b.medicine?.name}</td>
                    <td className="num">{b.batch_number || '—'}</td>
                    <td><ExpiryBadge date={b.expiry_date} withDate /></td>
                    <td className="num text-right">{fmtNumber(b.quantity)} {b.unit || b.medicine?.unit}</td>
                    <td><StatusBadge status={b.expiry_status} /></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={isCompany() ? 7 : 6} className="empty-state">Không có tồn kho khớp bộ lọc</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function StatusBadge({ status }) {
  const map = {
    ok: ['badge-success', 'Còn hạn'],
    watch: ['badge-caution', 'Theo dõi'],
    action_required: ['badge-warning', 'Cần xác nhận'],
    urgent: ['badge-danger', 'Khẩn'],
    final_check: ['badge-danger', 'Kiểm tra ngay'],
    expired: ['badge-danger', 'Hết hạn'],
    disposed: ['badge', 'Đã tiêu huỷ']
  };
  const [cls, label] = map[status] || ['badge', status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
