import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import type { Role } from '@dawai/shared/types';
import Login from './pages/Login';
import TwoFactorGate from './pages/TwoFactorGate';
import PlatformLayout from './pages/PlatformLayout';
import Shops from './pages/Shops';
import ShopDetail from './pages/ShopDetail';
import Payments from './pages/Payments';
import Revenue from './pages/Revenue';
import Plans from './pages/Plans';
import Team from './pages/Team';
import Leads from './pages/Leads';
import Support from './pages/Support';
import Renewals from './pages/Renewals';
import Messages from './pages/Messages';
import Announcements from './pages/Announcements';
import Audit from './pages/Audit';
import Medicines from './pages/Medicines';
import MedicineRequests from './pages/MedicineRequests';
import Security from './pages/Security';

/**
 * Who may be here at all. `admin` is a *shop owner* and is deliberately
 * absent - the two names invite exactly this mistake, and this is the one app
 * where getting it wrong hands a customer the controls for every other
 * customer.
 */
const PLATFORM_ROLES: Role[] = ['platformAdmin', 'platformStaff'];

/**
 * Nothing decides whether somebody is signed in until the start-up refresh has
 * been tried.
 *
 * The access token lives in memory, so a reload starts with none and the
 * session is restored from the httpOnly cookie a moment later. Without this
 * gate every refresh of the page would flash the login screen first — and worse,
 * would replace the URL the user was on.
 */
function Hydrating() {
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <span className="sr-only">Restoring your session…</span>
    </div>
  );
}

function Protected({ children }: { children: JSX.Element }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);
  const hydrated = useAuthStore((s) => s.hydrated);
  const twoFactorEnabled = useAuthStore((s) => s.user?.twoFactorEnabled);
  const twoFactorRequired = useAuthStore((s) => s.user?.twoFactorRequired);
  if (!hydrated) return <Hydrating />;
  if (!accessToken) return <Navigate to="/login" replace />;
  // A shop role cannot arrive here through this app's own login, but a
  // session already in storage could have been one when the tab was opened.
  if (!role || !PLATFORM_ROLES.includes(role)) return <Navigate to="/login" replace />;
  /*
   * An operator account without a second factor gets the enrolment screen and
   * nothing else. The API refuses every other call anyway (`requireAuth`), so
   * without this the console would render itself and then fail every request.
   *
   * Only while the deployment requires it (`OPERATOR_2FA_REQUIRED`). A session
   * from before the API sent `twoFactorRequired` reads as required, which is
   * the safe way to be wrong.
   */
  if (twoFactorEnabled === false && twoFactorRequired !== false) return <TwoFactorGate />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <PlatformLayout />
          </Protected>
        }
      >
        <Route index element={<Shops />} />
        {/* The emails link here (see notification.service on the API). */}
        <Route path="shops" element={<Navigate to="/" replace />} />
        <Route path="shops/:id" element={<ShopDetail />} />
        <Route path="payments" element={<Payments />} />
        <Route path="revenue" element={<Revenue />} />
        <Route path="plans" element={<Plans />} />
        <Route path="team" element={<Team />} />
        {/* The shared catalogue, and what shops asked to have added to it. */}
        <Route path="medicines" element={<Medicines />} />
        <Route path="requests" element={<MedicineRequests />} />
        {/* People who are not customers yet: the marketing site's contact form. */}
        <Route path="leads" element={<Leads />} />
        <Route path="support" element={<Support />} />
        <Route path="renewals" element={<Renewals />} />
        <Route path="messages" element={<Messages />} />
        <Route path="announcements" element={<Announcements />} />
        {/* What this team did to customer accounts. Read-only. */}
        <Route path="audit" element={<Audit />} />
        {/* The operator's own account: second factor, signed-in devices. */}
        <Route path="security" element={<Security />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
