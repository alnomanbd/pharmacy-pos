import TwoFactorSetup from '@dawai/shared/components/TwoFactorSetup';
import SessionList from '@dawai/shared/components/SessionList';

/**
 * The operator's own account, rather than anything about a customer.
 *
 * Both panels are the shop app's, shared rather than rewritten: an operator
 * needs the same two things any other user does — a second factor, and a way to
 * end a session they do not recognise. Whether the first is compulsory is the
 * deployment's choice (`OPERATOR_2FA_REQUIRED`): when it is, `requireAuth`
 * enforces it, `TwoFactorGate` explains it, and the card offers "Move to a new
 * phone" instead of a plain turn-off.
 */
export default function Security() {
  return (
    <div className="page">
      <h1 className="page-title">Security</h1>
      <TwoFactorSetup />
      <SessionList />
    </div>
  );
}
