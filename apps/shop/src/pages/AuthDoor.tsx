import type { ReactNode } from 'react';
import AuthScene from '../components/AuthScene';

/**
 * The shop's smaller doors — forgot password, reset, confirm email.
 *
 * The same scene as sign-in, with slower traffic: somebody locked out of their
 * counter wants the form, not a show. The way back from every one of them is
 * to sign-in, so none of them is a dead end.
 *
 * `heroTitle` and `heroText` are kept for the pages that pass them; the card
 * carries its own heading now, so they are not drawn.
 */
export default function AuthDoor({
  children,
}: {
  heroTitle?: ReactNode;
  heroText?: string;
  children: ReactNode;
}) {
  return (
    <AuthScene calm backToSignIn>
      {children}
    </AuthScene>
  );
}
