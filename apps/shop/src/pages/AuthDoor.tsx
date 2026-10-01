import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useT } from '../i18n/ui';
import { BRAND } from '../brand';

/**
 * The shop's smaller doors — forgot password, reset, confirm email.
 *
 * Same scene as the sign-in page (the green half and the paper half), without
 * the moving till: somebody locked out of their counter wants the form, not a
 * show. Every one of these pages has a way back to sign-in, so none of them is
 * a dead end.
 */
export function ShopMark({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="8.5" width="19" height="7" rx="3.5" />
      <path d="M12 8.5a3.5 3.5 0 0 0 0 7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function AuthDoor({
  heroTitle,
  heroText,
  children,
}: {
  heroTitle: ReactNode;
  heroText: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="shop-shell">
      <aside className="shop-hero">
        <div className="shop-hero-inner">
          <div className="shop-brand">
            <span className="shop-brand-mark">
              <ShopMark />
            </span>
            <div>
              <div className="shop-brand-name">{BRAND.name}</div>
              <div className="shop-brand-sub">{t('Pharmacy')}</div>
            </div>
            <Link className="shop-exit" to="/login">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{t('Back to sign in')}</span>
            </Link>
          </div>

          <div className="shop-hero-body">
            <h2 className="shop-hero-title">{heroTitle}</h2>
            <p className="shop-hero-text">{heroText}</p>
          </div>
        </div>
      </aside>

      <main className="shop-panel">
        <div className="shop-card">{children}</div>
      </main>
    </div>
  );
}
