import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import { fmtDate, fmtNumber } from '../utils/format.js';

const STATUS = {
  pending:   ['badge-warning', 'Chờ xuất'],
  confirmed: ['badge-primary', 'Đã xuất, chờ nhận'],
  completed: ['badge-success', 'Hoàn thành'],
  cancelled: ['badge-danger', 'Đã huỷ']
};

export default function Transfers() {
  const { profile, isCompany } = useAuth();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['transfers'],
    queryFn: async () => (await supabase
      .from('transfer_requests')
      .select('*, from_org:organizations!from_org_id(name), to_org:organizations!to_org_id(name), medicine:medicines(name, unit)')
      .order('created_at', { ascending: false })).data || []
  });

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Điều chuyển liên Điện lực</div>
          <div className="text-sub text-sm">ĐL tự tạo, tự xác nhận – Công ty chỉ xem lịch sử.</div>
        </div>
        <div className="row">
          {!isCompany() && <Link className="btn" to="/transfers/suggest">💡 Gợi ý điều chuyển</Link>}
          {!isCompany() && <Link className="btn btn-primary" to="/transfers/new">+ Tạo điều chuyển</Link>}
        </div>
      </div>

      <div className="card">
        {isLoading ? <div className="empty-state">Đang tải…</div> : (
          <div className="tbl-wrap">
            <table className="tbl tbl-hover">
              <thead>
                <tr>
                  <th>Mã</th><th>Ngày</th><th>Từ</th><th>Đến</th><th>Thuốc</th>
                  <th className="text-right">SL yêu cầu</th><th className="text-right">Thực chuyển</th>
                  <th>Trạng thái</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const [cls, label] = STATUS[r.status] || ['badge', r.status];
                  const iAmSender = r.from_org_id === profile?.organization_id;
                  const iAmReceiver = r.to_org_id === profile?.organization_id;
                  return (
                    <tr key={r.id}>
                      <td className="num">{r.code}</td>
                      <td>{fmtDate(r.created_at)}</td>
                      <td>{r.from_org?.name}{iAmSender && ' (bạn)'}</td>
                      <td>{r.to_org?.name}{iAmReceiver && ' (bạn)'}</td>
                      <td>{r.medicine?.name}</td>
                      <td className="num text-right">{fmtNumber(r.quantity_requested)} {r.medicine?.unit}</td>
                      <td className="num text-right">{r.actual_quantity ? `${fmtNumber(r.actual_quantity)} ${r.medicine?.unit}` : '—'}</td>
                      <td><span className={`badge ${cls}`}>{label}</span></td>
                      <td className="text-right"><Link className="btn btn-sm" to={`/transfers/${r.id}`}>Chi tiết</Link></td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={9} className="empty-state">Chưa có phiếu điều chuyển</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
