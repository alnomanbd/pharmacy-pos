import { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, Download, Loader2, PackageX, Send, Share, ShoppingBag, Smartphone, TrendingUp } from 'lucide-react';
import { useToast } from '@dawai/shared/components/Toast';
import { pushApi, pushSupported, useInstall, type PushKind, type PushState } from '../pwa';
import { useT } from '../i18n/ui';

const KINDS: { key: PushKind; label: string; hint: string; icon: typeof TrendingUp }[] = [
  { key: 'takings', label: 'Today’s takings', hint: 'Every evening at 9 — what the day came to, against yesterday.', icon: TrendingUp },
  { key: 'stock', label: 'Stock each morning', hint: 'At 9 — what has expired, what is about to, and what has run out.', icon: PackageX },
  { key: 'orders', label: 'New online orders', hint: 'The moment a customer orders through your link.', icon: ShoppingBag },
];

/**
 * The shop on the owner's phone: installing it, and the alerts it can send.
 *
 * Both live on one card because one needs the other on an iPhone — Safari
 * only allows alerts for an app on the home screen — and because "how do I
 * get this on my phone" is one question to the person asking it.
 */
export default function PhoneAlertsCard({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const { toast } = useToast();
  const install = useInstall();
  const supported = pushSupported();
  const [state, setState] = useState<PushState | null>(null);
  const [picked, setPicked] = useState<PushKind[]>(['takings', 'stock', 'orders']);
  const [busy, setBusy] = useState<'' | 'on' | 'off' | 'test' | 'install'>('');

  useEffect(() => {
    if (!supported) return;
    pushApi
      .state()
      .then((s) => {
        setState(s);
        if (s.subscribed) setPicked(s.kinds);
      })
      .catch(() => setState({ subscribed: false, kinds: [], phones: 0 }));
  }, [supported]);

  const blocked = supported && typeof Notification !== 'undefined' && Notification.permission === 'denied';

  const turnOn = async () => {
    setBusy('on');
    try {
      const s = await pushApi.enable(picked.length ? picked : ['takings', 'stock', 'orders']);
      setState(s);
      toast(t('Alerts are on for this phone.'));
    } catch (e) {
      toast((e as Error).message === 'denied' ? t('The phone said no. Allow notifications for this site, then try again.') : t('Could not turn alerts on.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const turnOff = async () => {
    setBusy('off');
    await pushApi.disable();
    setState((s) => ({ subscribed: false, kinds: [], phones: Math.max(0, (s?.phones ?? 1) - 1) }));
    setBusy('');
  };

  const toggleKind = async (k: PushKind) => {
    const next = picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k];
    setPicked(next);
    if (state?.subscribed) setState(await pushApi.kinds(next).catch(() => state));
  };

  const test = async () => {
    setBusy('test');
    try {
      await pushApi.test();
      toast(t('Sent — it should appear in a few seconds.'));
    } catch (e: unknown) {
      toast((e as { response?: { data?: { message?: string } } }).response?.data?.message || t('Could not send it.'), 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <section id="set-alerts" className="card mb-0 scroll-mt-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Smartphone className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="mb-0">{t('Dawai on your phone')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('Put the shop on your home screen, and let it tell you what matters — even with the app closed.')}
          </p>
        </div>
      </div>

      {/* ---- the home screen ---- */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
        {install.installed ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> {t('Installed on this device')}
          </p>
        ) : install.canPrompt ? (
          <>
            <p className="min-w-0 flex-1 text-sm">{t('Opens like an app, full screen, from its own icon.')}</p>
            <button
              type="button"
              className="btn h-10"
              disabled={busy === 'install'}
              onClick={async () => {
                setBusy('install');
                await install.install();
                setBusy('');
              }}
            >
              <Download className="h-4 w-4" /> {t('Install the app')}
            </button>
          </>
        ) : install.ios ? (
          <p className="flex flex-wrap items-center gap-1.5 text-sm">
            {t('On iPhone: tap')} <Share className="inline h-4 w-4 text-sky-600" /> <strong>{t('Share')}</strong> {t('in Safari, then')}{' '}
            <strong>{t('Add to Home Screen')}</strong>.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('Open this page on your phone, in Chrome or Safari, to put it on the home screen.')}
          </p>
        )}
      </div>

      {/* ---- the alerts ---- */}
      {!supported ? (
        <p className="mt-3 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          {install.ios
            ? t('On iPhone, alerts work once the app is on the home screen. Add it, open it from there, and come back here.')
            : t('This browser cannot show alerts. Use Chrome, Edge, Firefox or Safari.')}
        </p>
      ) : (
        <div className="mt-4">
          {!compact && (
            <div className="grid gap-2">
              {KINDS.map(({ key, label, hint, icon: Icon }) => (
                <label
                  key={key}
                  className={`flex cursor-pointer gap-2.5 rounded-xl border p-3 text-sm transition-colors ${
                    picked.includes(key) ? 'border-primary/50 bg-primary/[0.04]' : 'border-border'
                  }`}
                >
                  <input type="checkbox" className="mt-0.5 h-4 w-4" checked={picked.includes(key)} onChange={() => void toggleKind(key)} />
                  <span>
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Icon className="h-4 w-4 text-primary" /> {t(label)}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{t(hint)}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {state?.subscribed
                ? `${t('Alerts are on for this phone.')}${state.phones > 1 ? ` · ${state.phones} ${t('devices in this shop')}` : ''}`
                : blocked
                  ? t('Notifications are blocked for this site — allow them in the browser’s settings first.')
                  : t('Alerts are off on this phone.')}
            </p>
            <div className="flex gap-2">
              {state?.subscribed ? (
                <>
                  <button type="button" className="btn btn-ghost h-10 border border-border" disabled={!!busy} onClick={() => void test()}>
                    {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t('Send a test')}
                  </button>
                  <button type="button" className="btn btn-ghost h-10 border border-border" disabled={!!busy} onClick={() => void turnOff()}>
                    {t('Turn off')}
                  </button>
                </>
              ) : (
                <button type="button" className="btn h-10" disabled={!!busy || blocked || !state} onClick={() => void turnOn()}>
                  {busy === 'on' ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} {t('Turn on alerts')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const NUDGE_KEY = 'dawai.phoneNudge.dismissed';

/**
 * One line on the dashboard for an owner who has not set the phone up yet:
 * not installed, or alerts not on. Gone for good once dismissed on this device.
 */
export function PhoneNudge() {
  const t = useT();
  const install = useInstall();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(NUDGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!pushSupported()) return setOn(false);
    pushApi
      .state()
      .then((s) => setOn(s.subscribed))
      .catch(() => setOn(false));
  }, []);
  if (hidden || on === null || (on && install.installed)) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(NUDGE_KEY, '1');
    } catch {
      /* private mode: it comes back next time, which is fine */
    }
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/[0.08] to-transparent px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
        <BellRing className="h-4 w-4" />
      </span>
      <p className="min-w-0 flex-1 text-sm">
        <strong>{t('Get the day’s takings on your phone.')}</strong>{' '}
        <span className="text-muted-foreground">{t('And a word when stock runs low or an order comes in.')}</span>
      </p>
      <a href="/settings#set-alerts" className="btn h-9">
        {t('Set it up')}
      </a>
      <button type="button" onClick={dismiss} className="text-xs text-muted-foreground hover:text-foreground">
        {t('Not now')}
      </button>
    </div>
  );
}
