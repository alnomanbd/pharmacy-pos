import { Schema, model } from 'mongoose';

/**
 * What the public website says about how to reach us — kept here, not in the
 * site's build, so the owner can change the WhatsApp number from the console
 * and the website follows within a minute, without a rebuild or a deploy.
 *
 * One document. The defaults are the numbers in use when this was written.
 */
const schema = new Schema(
  {
    key: { type: String, default: 'site', unique: true },
    /** Digits only, with the country code: 8801XXXXXXXXX. Empty hides WhatsApp; the button opens the contact page. */
    whatsapp: { type: String, default: '8801731686489', trim: true, maxlength: 20 },
  },
  { timestamps: true },
);

const SiteSettingsModel = model('SiteSettings', schema);

export interface SiteSettings {
  whatsapp: string;
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const doc =
    (await SiteSettingsModel.findOne({ key: 'site' }).lean()) ??
    (await SiteSettingsModel.create({ key: 'site' })).toObject();
  return { whatsapp: doc.whatsapp ?? '' };
}

export async function updateSiteSettings(input: Partial<SiteSettings>): Promise<SiteSettings> {
  const patch: Record<string, string> = {};
  if (input.whatsapp !== undefined) patch.whatsapp = input.whatsapp.replace(/\D/g, '');
  await SiteSettingsModel.updateOne({ key: 'site' }, { $set: patch }, { upsert: true });
  return getSiteSettings();
}
