import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import { fmtDate } from '../utils/format.js';

const TYPE_LABEL = { monthly: 'Tháng (tủ/hộp)', quarterly: 'Quý (kho)', adhoc: 'Đột xuất' };

export default function StockChecks() {
  const { isCompany } = useAuth();
  if (isCompany()) return <div className="alert alert-danger">Kiểm kê là nghiệp vụ của Điện lực.</div>;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['stock-checks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_checks')
        .select('*, location:stock_locations(name, type), checked_by_profile:profiles!checked_by(full_name)')
        .order('check_date', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Kiểm kê định kỳ</div>
          <div className="text-sub text-sm">Tủ/hộp: hàng tháng · Kho: hàng quý</div>
        </div>
        <Link className="btn btn-primary" to="/stock-checks/new">+ Tạo phiếu kiểm kê</Link>
      </div>

      <div className="card">
        {isLoading ? <div className="empty-state">Đang tải…</div> : (
          <div className="tbl-wrap">
            <table className="tbl tbl-hover">
              <thead>
                <tr>
                  <th>Ngày</th><th>Vị trí</th><th>Loại</th><th>Người kiểm</th><th>Trạng thái</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.check_date)}</td>
                    <td>{r.location?.name}</td>
                    <td>{TYPE_LABEL[r.check_type] || r.check_type}</td>
                    <td>{r.checked_by_profile?.full_name || '—'}</td>
                    <td>
                      <span className={`badge ${r.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>
                        {r.status === 'completed' ? 'Đã hoàn thành' : 'Đang kiểm'}
                      </span>
                    </td>
                    <td className="text-right">
                      <Link className="btn btn-sm" to={`/stock-checks/${r.id}`}>
                        {r.status === 'in_progress' ? 'Tiếp tục' : 'Xem'}
                      </Link>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="empty-state">Chưa có phiếu kiểm kê</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
