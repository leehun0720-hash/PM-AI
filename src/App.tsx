import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import Accounting from './pages/Accounting';
import Admin from './pages/Admin';
import Approvals from './pages/Approvals';
import Ask from './pages/Ask';
import Association from './pages/Association';
import AuditLog from './pages/AuditLog';
import Charges from './pages/Charges';
import Dashboard from './pages/Dashboard';
import DueDiligence from './pages/DueDiligence';
import Inventory from './pages/Inventory';
import Leases from './pages/Leases';
import Legal from './pages/Legal';
import Services from './pages/Services';
import Settings from './pages/Settings';
import Utilities from './pages/Utilities';
import Vendors from './pages/Vendors';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="charges" element={<Charges />} />
          <Route path="leases" element={<Leases />} />
          <Route path="utilities" element={<Utilities />} />
          <Route path="association" element={<Association />} />
          <Route path="admin" element={<Admin />} />
          <Route path="legal" element={<Legal />} />
          <Route path="vendors" element={<Vendors />} />
          <Route path="accounting" element={<Accounting />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="ask" element={<Ask />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="services" element={<Services />} />
          <Route path="due-diligence" element={<DueDiligence />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
