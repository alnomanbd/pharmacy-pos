import { useCallback, useEffect, useState } from 'react';
import { Building2, Database, EyeOff, FlaskConical, MapPin, Pill, RefreshCw, TrendingDown, TrendingUp, X } from 'lucide-react';
import { platformApi, type MedicineInsights as Insights } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { Rise, useSeen } from '@dawai/shared/components/motion';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import { BTN_OUTLINE, errorMessage } from '../lib/ui';
import { useRange, RangeBar, Hero, CompareTile, rangeLine, num, taka, downloadCsv } from '../components/Stretch';

/**
 * Which medicines people are buying, and where.
 *
 * Read from the nightly demand tables — every shop that has not switched
 * itself out, counted together, never named. Every figure carries how many
 * shops it rests on; under the threshold it is marked "not shareable": seen
 * here by Dawai's own team, never sent anywhere that leaves.
 *
 * Click a generic or a district to narrow everything to it; inside a generic,
 * each brand's share of it.
 */
export default function MedicineInsights() {
  const { toast } = useToast();
  const r = useRange('30');
  const [district, setDistrict] = useState('');
  const [generic, setGeneric] = useState<{ id: string; name: string } | null>(null);
  const [data, setData] = useState<Insights | null>(null);
  const [filters, setFilters] = useState<{ districts: string[]; generics: { id: string; name: string }[] }>({ districts: [], generics: [] });
  const [busy, setBusy] = useState(false);
  const perms = useAuthStore((s) => (s.user as { permissions?: string[] } | null)?.permissions ?? []);
  const canRebuild = perms.length === 0 || perms.includes('system.view');

  const load = useCallback(() => {
    setData(null);
    platformApi
      .medicineInsights({ ...r.range, ...(district ? { district } : {}), ...(generic ? { generic: generic.id } : {}) })
      .then(setData)
      .catch((e) => toast(errorMessage(e, 'Could not load the medicine figures.'), 'error'));
  }, [r.range, district, generic, toast]);

  useEffect(load, [load]);
  useEffect(() => {
    platformApi
      .medicineInsightFilters()
      .then(setFilters)
      .catch(() => undefined);
  }, []);

  const rebuild = async () => {
    setBusy(true);
    try {
      await platformApi.rebuildMedicineInsights();
      toast('The last seven days are counted again.');
      load();
    } catch (e) {
      toast(errorMessage(e, 'Could not rebuild.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const q = data?.quality;
  const matchedShare = q && q.matchedPieces + q.unmatchedPieces > 0 ? Math.round((q.matchedPieces / (q.matchedPieces + q.unmatchedPieces)) * 1000) / 10 : 0;

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <Pill className="h-5 w-5" /> Medicine insights
          </h1>
          <p className="text-sm text-muted-foreground">Which medicines people are buying, and where — every counted shop together, none named.</p>
        </div>
        {canRebuild && (
          <button className={BTN_OUTLINE} disabled={busy} onClick={() => void rebuild()} title="Count the last seven days again">
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> Rebuild
          </button>
        )}
      </div>

      <RangeBar
        r={r}
        right={
          <>
            <select className="input h-9 w-auto" value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="District">
              <option value="">Every district</option>
              {filters.districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              className="input h-9 w-auto max-w-[14rem]"
              value={generic?.id ?? ''}
              onChange={(e) => setGeneric(filters.generics.find((g) => g.id === e.target.value) ?? null)}
              aria-label="Generic"
            >
              <option value="">Every generic</option>
              {filters.generics.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </>
        }
      />
      {data && (
        <div className="-mt-2 mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{rangeLine({ from: data.range.from, to: data.range.to, prevFrom: data.range.prevFrom, prevTo: data.range.prevTo, days: data.range.days })}</span>
          {district && <Chip label={district} onClear={() => setDistrict('')} />}
          {generic && <Chip label={generic.name} onClear={() => setGeneric(null)} />}
        </div>
      )}

      {!data ? (
        <LoadingBlock />
      ) : (
        <>
          <Hero
            icon={Pill}
            label={generic ? `${generic.name} sold` : 'Pieces sold'}
            now={data.totals.pieces.now}
            before={data.totals.pieces.before}
            format={num}
            line={data.series.map((p) => p.count)}
            sub={`${taka(data.totals.value.now)} at the counter · ${data.totals.medicines.now} different medicines · ${data.totals.districts} district${data.totals.districts === 1 ? '' : 's'}`}
          />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <CompareTile icon={Pill} tone="bg-primary/10 text-primary" label="Value at the counter" now={data.totals.value.now} before={data.totals.value.before} format={taka} />
            <CompareTile icon={FlaskConical} tone="bg-violet-500/10 text-violet-600 dark:text-violet-400" label="Different medicines" now={data.totals.medicines.now} before={data.totals.medicines.before} delay={60} />
            <Rise delay={120} className="stat flex h-full min-h-[128px] flex-col">
              <span className="label !mt-0">Shops counted</span>
              <div className="value mt-1 tabular-nums">{q?.shopsCounted ?? 0}</div>
              <span className="mt-auto text-[11px] text-muted-foreground">most on any one day · none named</span>
            </Rise>
            <Rise delay={180} className="stat flex h-full min-h-[128px] flex-col">
              <span className="label !mt-0 flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5" /> Matched to the catalogue
              </span>
              <div className="value mt-1 tabular-nums">{matchedShare}%</div>
              <span className="mt-auto text-[11px] text-muted-foreground">
                {num(q?.unmatchedPieces ?? 0)} pieces not linked · built {q?.lastBuilt ? new Date(q.lastBuilt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
              </span>
            </Rise>
          </div>

          <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            A figure from fewer than {data.minShops} shops is marked <span className="pill !py-0 text-[10px]">not shareable</span> — shown to the team here, never sent to the data API or anyone outside Dawai.
          </p>

          {/* ---- inside one generic: each brand's share ---- */}
          {generic && data.brands.length > 0 && (
            <ShareCard
              icon={FlaskConical}
              title={`Brands within ${generic.name}`}
              rows={data.brands.map((b) => ({ key: b.id, name: `${b.brand} ${b.strength}`.trim(), sub: b.company, value: b.pieces, share: b.share, shareable: b.shareable }))}
            />
          )}

          <TopTable data={data} />

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <MoverCard title="Rising" up rows={data.rising} />
            <MoverCard title="Falling" up={false} rows={data.falling} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            {!generic && (
              <ShareCard
                icon={FlaskConical}
                title="By generic"
                note="Click one to see its brands."
                rows={data.byGeneric.map((g) => ({ key: g.id, name: g.name, sub: `${g.medicines} brands`, value: g.pieces, share: g.share, shareable: g.shareable, change: g.change }))}
                onPick={(k, name) => !k.startsWith('name:') && setGeneric({ id: k, name })}
              />
            )}
            <ShareCard
              icon={Building2}
              title="By company"
              rows={data.byCompany.map((c) => ({ key: c.id, name: c.name, sub: `${c.medicines} medicines`, value: c.pieces, share: c.share, shareable: c.shareable, change: c.change }))}
            />
            <ShareCard
              icon={MapPin}
              title="By district"
              note={district ? undefined : 'Click one to narrow everything to it.'}
              rows={data.districts.map((d) => ({ key: d.district, name: d.district, sub: `${d.medicines} medicines`, value: d.pieces, share: Math.round((d.pieces / Math.max(1, data.totals.pieces.now)) * 1000) / 10 }))}
              onPick={(k) => setDistrict(k)}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
      {label}
      <button type="button" aria-label={`Clear ${label}`} onClick={onClear}>
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function Shareable({ ok, shops }: { ok: boolean; shops?: number }) {
  return ok ? (
    <span className="pill success !py-0 text-[10px]">{shops ? `${shops} shops` : 'shareable'}</span>
  ) : (
    <span className="pill !py-0 text-[10px]" title="From fewer shops than the privacy rule allows to share">
      not shareable
    </span>
  );
}

function Change({ v }: { v: number | null }) {
  if (v === null) return <span className="text-[11px] text-muted-foreground">new</span>;
  return <span className={`pill ${v >= 0 ? 'success' : 'danger'} !py-0 text-[11px] tabular-nums`}>{`${v >= 0 ? '+' : '−'}${Math.abs(v)}%`}</span>;
}

function TopTable({ data }: { data: Insights }) {
  return (
    <Rise className="card mt-4 !mb-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="mb-0 flex items-center gap-2">
          <Pill className="h-4 w-4 text-primary" /> Most bought
        </h3>
        <button
          type="button"
          className={BTN_OUTLINE}
          onClick={() =>
            downloadCsv(
              `dawai-medicines-${data.range.from}-${data.range.to}.csv`,
              ['Brand', 'Strength', 'Form', 'Generic', 'Company', 'Pieces', 'Pieces before', 'Change %', 'Shops', 'Shareable'],
              data.top.map((m) => [m.brand, m.strength, m.form, m.generic, m.company, m.pieces, m.piecesBefore, m.change ?? '', m.shops, m.shareable ? 'yes' : 'no']),
            )
          }
        >
          CSV
        </button>
      </div>
      {data.top.length === 0 ? (
        <div className="empty py-8">Nothing counted in this stretch yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full text-sm">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>Medicine</th>
                <th>Generic</th>
                <th>Company</th>
                <th className="text-right">Pieces</th>
                <th className="text-right">Change</th>
                <th className="text-right">Rests on</th>
              </tr>
            </thead>
            <tbody>
              {data.top.map((m, i) => (
                <tr key={m.id}>
                  <td className="tabular-nums text-muted-foreground">{i + 1}</td>
                  <td>
                    <span className="font-semibold">{m.brand}</span> <span className="text-muted-foreground">{m.strength}</span>
                    <span className="block text-[11px] text-muted-foreground">{m.form}</span>
                  </td>
                  <td className="max-w-[12rem] truncate" title={m.generic}>
                    {m.generic}
                  </td>
                  <td className="max-w-[12rem] truncate text-muted-foreground" title={m.company}>
                    {m.company}
                  </td>
                  <td className="text-right font-semibold tabular-nums">{num(m.pieces)}</td>
                  <td className="text-right">
                    <Change v={m.change} />
                  </td>
                  <td className="text-right">
                    <Shareable ok={m.shareable} shops={m.shops} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Rise>
  );
}

function MoverCard({ title, up, rows }: { title: string; up: boolean; rows: Insights['rising'] }) {
  const [ref, seen] = useSeen<HTMLUListElement>();
  const top = Math.max(1, ...rows.flatMap((r) => [r.pieces, r.piecesBefore]));
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <Rise className="card !mb-0 min-w-0">
      <h3 className={`flex items-center gap-2 ${up ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>
        <Icon className="h-4 w-4" /> {title}
      </h3>
      {rows.length === 0 ? (
        <div className="empty py-6">Nothing moved noticeably.</div>
      ) : (
        <ul ref={ref} className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <li key={r.id}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{r.brand}</span> <span className="text-muted-foreground">{r.strength}</span>
                </span>
                <Change v={r.change} />
              </div>
              {[
                { v: r.pieces, cls: up ? 'bg-emerald-500' : 'bg-destructive/70' },
                { v: r.piecesBefore, cls: 'bg-muted-foreground/30' },
              ].map((b, j) => (
                <div key={j} className="mt-0.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${b.cls} ${seen ? 'motion-grow-x' : 'scale-x-0'}`} style={{ width: `${(b.v / top) * 100}%`, animationDelay: `${i * 60 + j * 40}ms` }} />
                  </div>
                  <span className="w-12 text-right text-[10px] tabular-nums text-muted-foreground">{num(b.v)}</span>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </Rise>
  );
}

function ShareCard({
  icon: Icon,
  title,
  note,
  rows,
  onPick,
}: {
  icon: typeof Pill;
  title: string;
  note?: string;
  rows: { key: string; name: string; sub?: string; value: number; share: number; shareable?: boolean; change?: number | null }[];
  onPick?: (key: string, name: string) => void;
}) {
  const [ref, seen] = useSeen<HTMLUListElement>();
  const top = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Rise className="card mt-4 !mb-0 min-w-0 xl:mt-0">
      <h3 className="mb-0 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h3>
      {note && <p className="mb-2 text-xs text-muted-foreground">{note}</p>}
      {rows.length === 0 ? (
        <div className="empty py-6">Nothing counted yet.</div>
      ) : (
        <ul ref={ref} className="mt-2 flex flex-col gap-2.5">
          {rows.map((r, i) => (
            <li key={r.key}>
              <Row onPick={onPick ? () => onPick(r.key, r.name) : undefined}>
                <div className="flex items-baseline gap-2 text-sm">
                  <span className={`min-w-0 flex-1 truncate font-medium ${onPick ? 'hover:text-primary' : ''}`} title={r.name}>
                    {r.name}
                  </span>
                  {r.change !== undefined && <Change v={r.change ?? null} />}
                  <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{r.share}%</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full bg-gradient-to-r from-primary/70 to-primary ${seen ? 'motion-grow-x' : 'scale-x-0'}`} style={{ width: `${(r.value / top) * 100}%`, animationDelay: `${i * 50}ms` }} />
                  </div>
                  <span className="w-14 text-right text-[10px] tabular-nums text-muted-foreground">{num(r.value)}</span>
                </div>
                {(r.sub || r.shareable !== undefined) && (
                  <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-muted-foreground">
                    {r.sub}
                    {r.shareable !== undefined && <Shareable ok={r.shareable} />}
                  </div>
                )}
              </Row>
            </li>
          ))}
        </ul>
      )}
    </Rise>
  );
}

/** A row that is a button only when there is somewhere to go — a disabled button reads as switched off. */
function Row({ onPick, children }: { onPick?: () => void; children: React.ReactNode }) {
  return onPick ? (
    <button type="button" onClick={onPick} className="w-full text-left">
      {children}
    </button>
  ) : (
    <div>{children}</div>
  );
}
