import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import ShopLayout from './pages/ShopLayout';
import Till from './pages/Till';
import Sales from './pages/Sales';
import Customers from './pages/Customers';
import Counters from './pages/Counters';
import Profile from './pages/Profile';
import Support from './pages/Support';
import Trash from './pages/Trash';
import Stock from './pages/Stock';
import CountStock from './pages/CountStock';
import Purchases from './pages/Purchases';
import Orders from './pages/Orders';
import Labels from './pages/Labels';
import Suppliers from './pages/Suppliers';
import ShopReports from './pages/ShopReports';
import Staff from './pages/Staff';
import Racks from './pages/Racks';
import Settings from './pages/Settings';
import Subscription from './pages/Subscription';
import Expiry from './pages/Expiry';
import Accounts from './pages/Accounts';
import Activity from './pages/Activity';
import BackRoom from './components/BackRoom';

/**
 * Who may be here, and on what.
 *
 * The person must be somebody the shop lets in: an operator from the console
 * is refused here for the same reason a shop credential is refused at the
 * console's own door. Each door opens for its own people, so nobody reaches a
 * screen whose every request would be refused.
 */
const PLATFORM_ROLES = ['platformAdmin', 'platformStaff'];

function Hydrating() {
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <span className="sr-only">Restoring your session…</span>
    </div>
  );
}

/**
 * The account bought the shop, and this person is allowed into it.
 *
 * Nothing decides either until the start-up refresh has been tried: the access
 * token lives in memory, so a reload starts with none and the session comes
 * back from the httpOnly cookie a moment later. Without the gate, every refresh
 * would flash the sign-in screen and replace the URL the user was on.
 */
function Protected({ children }: { children: JSX.Element }) {
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);

  if (!hydrated) return <Hydrating />;
  if (!accessToken) return <Navigate to="/login" replace />;
  if (role && PLATFORM_ROLES.includes(role)) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />

      {/*
        The counter has no shell.

        A till is its own machine — full bleed, no rail, no top bar — so it
        hangs off the root rather than inside the app's layout. Everything else
        in the shop is an ordinary page and keeps the rail. See pages/Till.tsx.
      */}
      <Route
        path="/"
        element={
          <Protected>
            <Till />
          </Protected>
        }
      />

      <Route
        path="/"
        element={
          <Protected>
            <ShopLayout />
          </Protected>
        }
      >
        <Route path="sales" element={<Sales />} />
        <Route path="customers" element={<Customers />} />
        <Route path="counters" element={<BackRoom><Counters /></BackRoom>} />
        {/* Reached from the profile menu in the bar, not from the rail: it is
            about the person, and everybody has one. */}
        <Route path="profile" element={<Profile />} />
        {/* Every role, and while read-only: see shopSupport.routes.ts on the API. */}
        <Route path="support" element={<Support />} />
        <Route path="trash" element={<BackRoom><Trash /></BackRoom>} />
        <Route path="stock" element={<BackRoom><Stock /></BackRoom>} />
        <Route path="count" element={<BackRoom><CountStock /></BackRoom>} />
        <Route path="racks" element={<BackRoom><Racks /></BackRoom>} />
        <Route path="labels" element={<BackRoom><Labels /></BackRoom>} />
        <Route path="expiry" element={<BackRoom><Expiry /></BackRoom>} />
        <Route path="purchases" element={<BackRoom><Purchases /></BackRoom>} />
        <Route path="orders" element={<BackRoom><Orders /></BackRoom>} />
        <Route path="suppliers" element={<BackRoom><Suppliers /></BackRoom>} />
        <Route path="reports" element={<ShopReports />} />
        {/* The expenses are a tab of Accounts now; the old address still lands there. */}
        <Route path="expenses" element={<Navigate to="/accounts?tab=expenses" replace />} />
        <Route path="activity" element={<Activity />} />
        <Route path="accounts" element={<BackRoom><Accounts /></BackRoom>} />
        {/* Hiring, switching somebody off and setting a password are the
            owner's; the server refuses a salesman anyway. */}
        <Route path="staff" element={<BackRoom><Staff /></BackRoom>} />
        <Route path="settings" element={<BackRoom><Settings /></BackRoom>} />
        <Route path="subscription" element={<BackRoom><Subscription /></BackRoom>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
