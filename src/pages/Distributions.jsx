import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import { fmtDate } from '../utils/format.js';

const STATUS_LABEL = {
  pending: ['badge-warning', 'Chờ nhận'],
  completed: ['badge-success', 'Đã nhận'],
  cancelled: ['badge-danger', 'Đã huỷ']
};

export default function Distributions() {
  const { profile, isCompany } = useAuth();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['distributions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('distributions')
        .select('*, to_org:organizations!to_org_id(name), items:distribution_items(id, quantity)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  return (
    <>
      <div className="page-header">
        <div className="page-title">Phân phối Công ty → Điện lực</div>
        {isCompany() && <Link className="btn btn-primary" to="/distributions/new">+ Phiếu mới</Link>}
      </div>

      <div className="card">
        {isLoading ? <div className="empty-state">Đang tải…</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl tbl-hover">
              <thead>
                <tr>
                  <th>Mã phiếu</th><th>Ngày tạo</th><th>Điện lực nhận</th>
                  <th className="text-right">Số dòng</th><th className="text-right">Tổng SL</th>
                  <th>Trạng thái</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const [cls, label] = STATUS_LABEL[r.status] || ['badge', r.status];
                  const totalQty = (r.items || []).reduce((s, i) => s + i.quantity, 0);
                  const canReceive = r.status === 'pending' && (isCompany() || r.to_org_id === profile?.organization_id);
                  return (
                    <tr key={r.id}>
                      <td className="num">{r.code}</td>
                      <td>{fmtDate(r.created_at)}</td>
                      <td>{r.to_org?.name}</td>
                      <td className="num text-right">{r.items?.length || 0}</td>
                      <td className="num text-right">{totalQty}</td>
                      <td><span className={`badge ${cls}`}>{label}</span></td>
                      <td className="text-right">
                        <Link className="btn btn-sm" to={`/distributions/${r.id}`}>
                          {canReceive && !isCompany() ? 'Nhận hàng' : 'Chi tiết'}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={7} className="empty-state">Chưa có phiếu nào</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
