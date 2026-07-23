import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './stores/auth.js';
import Login from './pages/Login.jsx';
import AppShell from './components/layout/AppShell.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Medicines from './pages/Medicines.jsx';
import Locations from './pages/Locations.jsx';
import Inventory from './pages/Inventory.jsx';
import Replenish from './pages/Replenish.jsx';
import CompanyImport from './pages/CompanyImport.jsx';
import CompanyStock from './pages/CompanyStock.jsx';
import Distributions from './pages/Distributions.jsx';
import DistributionNew from './pages/DistributionNew.jsx';
import DistributionReceive from './pages/DistributionReceive.jsx';

function Protected({ children }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="auth-shell">Đang tải…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const init = useAuth((s) => s.init);
  useEffect(() => { init(); }, [init]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <Protected>
            <AppShell>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/medicines" element={<Medicines />} />
                <Route path="/locations" element={<Locations />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/inventory/replenish" element={<Replenish />} />
                <Route path="/company/stock" element={<CompanyStock />} />
                <Route path="/company/import" element={<CompanyImport />} />
                <Route path="/distributions" element={<Distributions />} />
                <Route path="/distributions/new" element={<DistributionNew />} />
                <Route path="/distributions/:id" element={<DistributionReceive />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          </Protected>
        }
      />
    </Routes>
  );
}
