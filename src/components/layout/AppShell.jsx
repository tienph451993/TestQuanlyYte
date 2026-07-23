import { NavLink } from 'react-router-dom';
import { useAuth } from '../../stores/auth.js';

const nav = [
  { to: '/', label: 'Dashboard' },
  { to: '/inventory', label: 'Tồn kho' },
  { to: '/inventory/import', label: '↳ Nhập từ công ty', roles: ['company_admin','company_user'] },
  { to: '/inventory/replenish', label: '↳ Bổ sung tủ (FEFO)', roles: ['company_admin','company_user','unit_admin','unit_user'] },
  { to: '/locations', label: 'Vị trí kho/tủ' },
  { to: '/medicines', label: 'Danh mục thuốc' }
];

export default function AppShell({ children }) {
  const { profile, signOut } = useAuth();
  const role = profile?.role;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">🩺 MedStock</div>
        <nav className="sidebar-nav">
          {nav
            .filter((item) => !item.roles || item.roles.includes(role))
            .map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'}>
                {item.label}
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
