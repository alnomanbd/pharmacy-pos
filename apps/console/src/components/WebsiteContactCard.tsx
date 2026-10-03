import { useEffect, useState } from 'react';
import { Loader2, MessageCircle } from 'lucide-react';
import { platformApi } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { errorMessage, useAccess } from '../lib/ui';

/**
 * The public website's WhatsApp number — the green "Ask us" bubble on every
 * page opens a chat with it. Changed here, the website follows within a
 * minute; no rebuild. Empty: the bubble opens the contact page instead.
 * Only the platform owner can change it; everyone else sees it.
 */
export default function WebsiteContactCard() {
  const { toast } = useToast();
  const access = useAccess();
  const [saved, setSaved] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    platformApi
      .siteSettings()
      .then((s) => {
        const shown = s.whatsapp ? `+${s.whatsapp}` : '';
        setSaved(shown);
        setValue(shown);
      })
      .catch(() => setSaved(''));
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const s = await platformApi.saveSiteSettings({ whatsapp: value.trim() });
      const shown = s.whatsapp ? `+${s.whatsapp}` : '';
      setSaved(shown);
      setValue(shown);
      toast('Saved. The website shows it within a minute.');
    } catch (e) {
      toast(errorMessage(e, 'Could not save the number.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (saved === null) return null;
  const owner = !!access?.isOwner;
  const digits = value.replace(/\D/g, '');

  return (
    <div className="card">
      <h3 className="mb-1 flex items-center gap-2">
        <MessageCircle className="h-4 w-4" /> Website contact
      </h3>
      <p className="mb-3 text-sm text-muted-foreground">
        The WhatsApp number behind the “Ask us” bubble on every page of the website. Leave it empty and the bubble opens the contact page.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input h-10 w-64 font-mono"
          inputMode="tel"
          placeholder="+8801XXXXXXXXX"
          value={value}
          disabled={!owner}
          onChange={(e) => setValue(e.target.value)}
          aria-label="WhatsApp number"
        />
        {owner && (
          <button type="button" className="btn h-10" disabled={busy || value === saved} onClick={() => void save()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        )}
        {digits && (
          <a className="text-sm font-semibold text-primary hover:underline" href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer">
            Test it →
          </a>
        )}
      </div>
      {!owner && <p className="mt-2 text-xs text-muted-foreground">Only the platform owner can change it.</p>}
    </div>
  );
}
