import { Schema, model } from 'mongoose';

/**
 * Everything the public website shows that is a business decision rather
 * than code — kept here, so the platform owner changes it from the console
 * (Website) and the site follows within a minute, without a rebuild.
 *
 * One document. The defaults are what was decided when each was added.
 */
const schema = new Schema(
  {
    key: { type: String, default: 'site', unique: true },
    /** Digits only, with the country code. Empty: the chat bubble opens the contact page. */
    whatsapp: { type: String, default: '8801731686489', trim: true, maxlength: 20 },
    /**
     * Months free for every twelve paid at once. 2 means a year costs ten
     * months. 0 turns the yearly offer off everywhere — site and checkout.
     */
    yearlyFreeMonths: { type: Number, default: 2, min: 0, max: 6 },
    /** The band of live counts on the home page: shops, bills today, medicines. */
    showLiveStats: { type: Boolean, default: true },
    /** Counts below this are not shown — a site that says "3 shops" is worse than one that says nothing. */
    liveStatsMinShops: { type: Number, default: 0, min: 0 },
    /** The savings calculator's assumptions, stated on the page beside it. */
    calculator: {
      /** Share of stock that expires on the shelf, without batch and expiry tracking. */
      expiryLossPercent: { type: Number, default: 2, min: 0, max: 20 },
      /** How much of that tracking prevents. */
      expirySavedPercent: { type: Number, default: 70, min: 0, max: 100 },
      /** Baki that is never collected, as a share of monthly sales, on paper. */
      bakiLossPercent: { type: Number, default: 1, min: 0, max: 20 },
      /** Minutes a counter spends closing the day by hand, and with Dawai. */
      closeMinutesPaper: { type: Number, default: 45, min: 0, max: 300 },
      closeMinutesDawai: { type: Number, default: 2, min: 0, max: 300 },
    },
    /**
     * Real shops' own words, shown on the home page only once there is at
     * least one — the site never shows made-up quotes.
     */
    stories: {
      type: [
        new Schema(
          {
            name: { type: String, trim: true, maxlength: 80 },
            shop: { type: String, trim: true, maxlength: 120 },
            area: { type: String, trim: true, maxlength: 120 },
            quote: { type: String, trim: true, maxlength: 400 },
            quoteBn: { type: String, trim: true, maxlength: 400, default: '' },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    /** A YouTube link: "Watch the 1-minute tour" beside the hero's buttons. Empty hides it. */
    videoUrl: { type: String, default: '', trim: true, maxlength: 300 },
    /** Measurement on the website. Empty: nothing is loaded. */
    analytics: {
      gaId: { type: String, default: '', trim: true, maxlength: 40 },
      fbPixelId: { type: String, default: '', trim: true, maxlength: 40 },
    },
    /** The published help articles, readable on the website as Guides. */
    guidesOnWebsite: { type: Boolean, default: true },
    /** "Try the demo": a shop anyone can open, read-only, from the website. */
    demo: {
      enabled: { type: Boolean, default: true },
      /** The account the demo signs in as — its shop is what visitors see. */
      email: { type: String, default: 'owner@dawai.demo', trim: true, lowercase: true },
    },
  },
  { timestamps: true },
);

const SiteSettingsModel = model('SiteSettings', schema);

export interface SiteSettings {
  whatsapp: string;
  yearlyFreeMonths: number;
  showLiveStats: boolean;
  liveStatsMinShops: number;
  calculator: {
    expiryLossPercent: number;
    expirySavedPercent: number;
    bakiLossPercent: number;
    closeMinutesPaper: number;
    closeMinutesDawai: number;
  };
  demo: { enabled: boolean; email: string };
  stories: { name: string; shop: string; area: string; quote: string; quoteBn: string }[];
  videoUrl: string;
  analytics: { gaId: string; fbPixelId: string };
  guidesOnWebsite: boolean;
}

const DEFAULTS: SiteSettings = {
  whatsapp: '8801731686489',
  yearlyFreeMonths: 2,
  showLiveStats: true,
  liveStatsMinShops: 0,
  calculator: { expiryLossPercent: 2, expirySavedPercent: 70, bakiLossPercent: 1, closeMinutesPaper: 45, closeMinutesDawai: 2 },
  demo: { enabled: true, email: 'owner@dawai.demo' },
  stories: [],
  videoUrl: '',
  analytics: { gaId: '', fbPixelId: '' },
  guidesOnWebsite: true,
};

/* Read on every checkout and every pricing quote; a minute is fresh enough. */
let cached: { at: number; value: SiteSettings } | null = null;

export async function getSiteSettings(): Promise<SiteSettings> {
  if (cached && Date.now() - cached.at < 30_000) return cached.value;
  const doc =
    (await SiteSettingsModel.findOne({ key: 'site' }).lean()) ??
    (await SiteSettingsModel.create({ key: 'site' })).toObject();
  const d = doc as Partial<SiteSettings>;
  const value: SiteSettings = {
    whatsapp: d.whatsapp ?? DEFAULTS.whatsapp,
    yearlyFreeMonths: d.yearlyFreeMonths ?? DEFAULTS.yearlyFreeMonths,
    showLiveStats: d.showLiveStats ?? DEFAULTS.showLiveStats,
    liveStatsMinShops: d.liveStatsMinShops ?? DEFAULTS.liveStatsMinShops,
    calculator: { ...DEFAULTS.calculator, ...(d.calculator ?? {}) },
    demo: { ...DEFAULTS.demo, ...(d.demo ?? {}) },
    stories: (d.stories ?? []).map((x) => ({ name: x.name ?? '', shop: x.shop ?? '', area: x.area ?? '', quote: x.quote ?? '', quoteBn: x.quoteBn ?? '' })),
    videoUrl: d.videoUrl ?? '',
    analytics: { ...DEFAULTS.analytics, ...(d.analytics ?? {}) },
    guidesOnWebsite: d.guidesOnWebsite ?? DEFAULTS.guidesOnWebsite,
  };
  cached = { at: Date.now(), value };
  return value;
}

/** What the public website may read — the demo account's address stays private. */
export async function publicSiteSettings() {
  const s = await getSiteSettings();
  return {
    whatsapp: s.whatsapp,
    yearlyFreeMonths: s.yearlyFreeMonths,
    showLiveStats: s.showLiveStats,
    calculator: s.calculator,
    demo: { enabled: s.demo.enabled },
    stories: s.stories.filter((x) => x.quote.trim()),
    videoUrl: s.videoUrl,
    analytics: s.analytics,
    guidesOnWebsite: s.guidesOnWebsite,
  };
}

type Patch = Partial<Omit<SiteSettings, 'calculator' | 'demo' | 'analytics'>> & {
  calculator?: Partial<SiteSettings['calculator']>;
  demo?: Partial<SiteSettings['demo']>;
  analytics?: Partial<SiteSettings['analytics']>;
};

export async function updateSiteSettings(input: Patch): Promise<SiteSettings> {
  const set: Record<string, unknown> = {};
  if (input.whatsapp !== undefined) set.whatsapp = input.whatsapp.replace(/\D/g, '');
  for (const k of ['yearlyFreeMonths', 'showLiveStats', 'liveStatsMinShops', 'stories', 'videoUrl', 'guidesOnWebsite'] as const) {
    if (input[k] !== undefined) set[k] = input[k];
  }
  for (const [k, v] of Object.entries(input.calculator ?? {})) if (v !== undefined) set[`calculator.${k}`] = v;
  for (const [k, v] of Object.entries(input.demo ?? {})) if (v !== undefined) set[`demo.${k}`] = v;
  for (const [k, v] of Object.entries(input.analytics ?? {})) if (v !== undefined) set[`analytics.${k}`] = v;
  await SiteSettingsModel.updateOne({ key: 'site' }, { $set: set }, { upsert: true });
  cached = null;
  return getSiteSettings();
}

/**
 * The months that are charged for, when `months` are bought at once.
 *
 * Twelve or more earn `free` months off for every full twelve: with 2 free, a
 * year is charged as ten and two years as twenty. The subscription still runs
 * the full `months` — the free ones are time, not money back.
 */
export function chargedMonths(months: number, free: number): number {
  if (months < 12 || free <= 0) return months;
  return Math.max(1, months - Math.floor(months / 12) * free);
}

/* ------------------------------------------------------------------ */
/* Live numbers                                                        */
/* ------------------------------------------------------------------ */

let statsCache: { at: number; value: LiveStats | null } | null = null;

export interface LiveStats {
  shops: number;
  /** Every bill ever rung up on Dawai — a figure that only grows, unlike today's, which is 0 at dawn. */
  bills: number;
  medicines: number;
}

/**
 * The home page's live band: shops on Dawai, bills rung up across all of
 * them, medicines in the shared list. Totals only — never a shop's own figure —
 * and nothing at all when the console has turned it off or there are fewer
 * shops than it asked for. Counted once a minute at most.
 */
export async function liveStats(): Promise<LiveStats | null> {
  if (statsCache && Date.now() - statsCache.at < 60_000) return statsCache.value;
  const s = await getSiteSettings();
  let value: LiveStats | null = null;
  if (s.showLiveStats) {
    const { OrganizationModel, SaleModel, MedicineModel } = await import('../models/index.js');
    const [shops, bills, medicines] = await Promise.all([
      OrganizationModel.countDocuments({ status: 'active' }),
      SaleModel.countDocuments({ deletedAt: null, status: { $ne: 'void' } }),
      MedicineModel.estimatedDocumentCount(),
    ]);
    if (shops >= s.liveStatsMinShops) value = { shops, bills, medicines };
  }
  statsCache = { at: Date.now(), value };
  return value;
}
