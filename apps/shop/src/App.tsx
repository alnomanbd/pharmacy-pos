import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import { useBanglaKeyboard } from '@dawai/shared/store/banglaKeyboard.store';
import { BanglaKeyboard } from '@dawai/shared/components/BanglaKeyboard';
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
import Help from './pages/Help';
import Branches from './pages/Branches';
import Transfers from './pages/Transfers';
import Dashboard from './pages/Dashboard';
import OnlineOrders from './pages/OnlineOrders';
import OrderPage from './pages/OrderPage';
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
import Import from './pages/Import';
import SupportClaim from './pages/SupportClaim';
import SupportViewBanner from './components/SupportViewBanner';
import AnnouncementBar from './components/AnnouncementBar';

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

/** The on-screen Bangla keyboard, opened from the till's or the back room's top bar. */
function KeyboardHost() {
  const { open, close } = useBanglaKeyboard();
  return open ? <BanglaKeyboard onClose={close} /> : null;
}

export default function App() {
  return (
    <>
    <KeyboardHost />
    {/* Above every screen, the till included, for as long as a support view lasts. */}
    <SupportViewBanner />
    {/* The team's announcements, also above every screen. */}
    <AnnouncementBar />
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Where the console hands over a read-only support view. Outside the
          gate: the code in the URL is the credential. */}
      <Route path="/support/claim" element={<SupportClaim />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      {/* A shop's public order page — the link it shares. No sign-in. */}
      <Route path="/o/:code" element={<OrderPage />} />

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
        <Route path="dashboard" element={<BackRoom perm="reports.view"><Dashboard /></BackRoom>} />
        <Route path="sales" element={<Sales />} />
        <Route path="online-orders" element={<BackRoom perm="online_orders.manage"><OnlineOrders /></BackRoom>} />
        <Route path="customers" element={<Customers />} />
        <Route path="counters" element={<BackRoom perm="settings.manage"><Counters /></BackRoom>} />
        {/* Reached from the profile menu in the bar, not from the rail: it is
            about the person, and everybody has one. */}
        <Route path="profile" element={<Profile />} />
        {/* Every role, and while read-only: see shopSupport.routes.ts on the API. */}
        <Route path="support" element={<Support />} />
        <Route path="help" element={<Help />} />
        <Route path="help/:slug" element={<Help />} />
        <Route path="trash" element={<BackRoom perm="audit.view"><Trash /></BackRoom>} />
        <Route path="stock" element={<BackRoom perm="stock.view"><Stock /></BackRoom>} />
        <Route path="import" element={<BackRoom perm={['stock.manage', 'customers.manage']}><Import /></BackRoom>} />
        <Route path="count" element={<BackRoom perm="stock.manage"><CountStock /></BackRoom>} />
        <Route path="transfers" element={<BackRoom perm="transfers.manage"><Transfers /></BackRoom>} />
        <Route path="racks" element={<BackRoom perm="stock.view"><Racks /></BackRoom>} />
        <Route path="labels" element={<BackRoom perm="stock.view"><Labels /></BackRoom>} />
        <Route path="expiry" element={<BackRoom perm="stock.view"><Expiry /></BackRoom>} />
        <Route path="purchases" element={<BackRoom perm="purchases.manage"><Purchases /></BackRoom>} />
        <Route path="orders" element={<BackRoom perm="purchases.manage"><Orders /></BackRoom>} />
        <Route path="suppliers" element={<BackRoom perm="purchases.manage"><Suppliers /></BackRoom>} />
        <Route path="reports" element={<ShopReports />} />
        {/* The expenses are a tab of Accounts now; the old address still lands there. */}
        <Route path="expenses" element={<Navigate to="/accounts?tab=expenses" replace />} />
        <Route path="activity" element={<BackRoom perm="audit.view"><Activity /></BackRoom>} />
        <Route path="accounts" element={<BackRoom perm="accounts.view"><Accounts /></BackRoom>} />
        {/* Hiring, switching somebody off and setting a password are the
            owner's; the server refuses a salesman anyway. */}
        <Route path="staff" element={<BackRoom perm="staff.manage"><Staff /></BackRoom>} />
        <Route path="settings" element={<BackRoom perm="settings.manage"><Settings /></BackRoom>} />
        <Route path="subscription" element={<BackRoom ownerOnly><Subscription /></BackRoom>} />
        <Route path="branches" element={<BackRoom perm="branches.manage"><Branches /></BackRoom>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
