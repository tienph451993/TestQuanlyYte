import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../stores/auth.js';
import { fmtNumber } from '../utils/format.js';

export default function CompanyStock() {
  const { isCompany } = useAuth();
  if (!isCompany()) return <div className="alert alert-danger">Chỉ Công ty xem được kho Cty.</div>;

  const { data: stock = [], isLoading } = useQuery({
    queryKey: ['company-stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_stock')
        .select('quantity, updated_at, medicine:medicines(id, code, name, category, unit)')
        .order('medicine(name)');
      if (error) throw error;
      return data;
    }
  });

  return (
    <>
      <div className="page-header">
        <div className="page-title">Kho Công ty</div>
        <div className="row">
          <Link className="btn" to="/company/import">📥 Nhập từ Excel</Link>
          <Link className="btn btn-primary" to="/distributions/new">📤 Phân phối về ĐL</Link>
        </div>
      </div>

      <div className="card">
        {isLoading ? <div className="empty-state">Đang tải…</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl tbl-hover">
              <thead>
                <tr><th>Mã</th><th>Tên</th><th>Phân loại</th><th className="text-right">Tồn kho Cty</th><th>Cập nhật</th></tr>
              </thead>
              <tbody>
                {stock.map((s) => (
                  <tr key={s.medicine.id}>
                    <td className="num">{s.medicine.code}</td>
                    <td>{s.medicine.name}</td>
                    <td>{s.medicine.category || '—'}</td>
                    <td className="num text-right">{fmtNumber(s.quantity)} {s.medicine.unit}</td>
                    <td className="text-sub text-sm">{new Date(s.updated_at).toLocaleString('vi-VN')}</td>
                  </tr>
                ))}
                {stock.length === 0 && <tr><td colSpan={5} className="empty-state">Chưa có tồn kho. Nhấn "Nhập từ Excel" để bắt đầu.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
