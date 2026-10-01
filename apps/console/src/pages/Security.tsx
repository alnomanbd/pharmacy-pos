import TwoFactorSetup from '@dawai/shared/components/TwoFactorSetup';
import SessionList from '@dawai/shared/components/SessionList';

/**
 * The operator's own account, rather than anything about a customer.
 *
 * Both panels are the shop app's, shared rather than rewritten: an operator
 * needs the same two things any other user does — a second factor, and a way to
 * end a session they do not recognise. The difference is that here the first is
 * compulsory, which `requireAuth` enforces and `TwoFactorGate` explains.
 */
export default function Security() {
  return (
    <div className="page">
      <h1 className="page-title">Your account</h1>
      <TwoFactorSetup />
      <SessionList />
    </div>
  );
}
