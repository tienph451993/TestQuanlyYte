import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../stores/auth.js';

export default function AppShell({ children }) {
  const { profile, signOut, isCompany } = useAuth();
  const role = profile?.role;

  // Badge: số phiếu phân phối chờ nhận (unit) hoặc chờ ĐL xác nhận (company)
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['pending-distributions', profile?.organization_id, isCompany()],
    enabled: !!profile,
    refetchInterval: 30_000,
    queryFn: async () => {
      let q = supabase.from('distributions').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      if (!isCompany()) q = q.eq('to_org_id', profile.organization_id);
      const { count } = await q;
      return count ?? 0;
    }
  });

  const items = [
    { to: '/', label: 'Dashboard' },
    isCompany() && { to: '/company/stock', label: 'Kho Công ty' },
    isCompany() && { to: '/company/import', label: '↳ Nhập từ Excel' },
    { to: '/distributions', label: 'Phân phối', badge: pendingCount || null },
    !isCompany() && { to: '/inventory', label: 'Tồn kho ĐL' },
    !isCompany() && { to: '/inventory/replenish', label: '↳ Bổ sung tủ (FEFO)' },
    { to: '/locations', label: 'Vị trí kho/tủ' },
    { to: '/medicines', label: 'Danh mục thuốc' }
  ].filter(Boolean);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">🩺 MedStock</div>
        <nav className="sidebar-nav">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge ? <span className="badge badge-danger">{item.badge}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div style={{ fontWeight: 500, color: 'var(--c-text-main)' }}>{profile?.full_name || '—'}</div>
          <div>{roleLabel(role)}</div>
          <div style={{ marginTop: 4 }}>{profile?.organization?.name || '—'}</div>
          <button className="btn btn-ghost btn-sm mt-2" onClick={signOut}>Đăng xuất</button>
        </div>
      </aside>
      <div className="main-area">
        <div className="topbar">
          <div className="text-sub text-sm">Phiên bản 2.0 – Phase 1</div>
          <div className="text-sub text-sm">{profile?.organization?.name}</div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

function roleLabel(role) {
  switch (role) {
    case 'company_admin': return 'Company Admin';
    case 'company_user':  return 'Company User';
    case 'unit_admin':    return 'Unit Admin';
    case 'unit_user':     return 'Unit User';
    default: return '—';
  }
}
