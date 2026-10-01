import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Somebody who wrote to us from the public site, before they are a customer.
 *
 * Deliberately **not** a `SupportThread`. A support thread belongs to an
 * organization and is opened by one of its signed-in users; a lead has neither
 * — that is the whole point of it. Reusing the thread model would have meant
 * either inventing a fake organization for every enquiry or making
 * `organization` optional on the model that every tenant-scoped query filters
 * by, which is exactly how cross-tenant leaks start.
 *
 * It is also the only writable collection in this app that an anonymous request
 * can reach, so the fields are short, capped, and the ones the sender does not
 * control (`ip`, `userAgent`, `source`) are recorded for triage.
 */
const schema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    /** Their shop's name, if they said. Not required — asking twice loses replies. */
    shop: { type: String, default: '', trim: true, maxlength: 160 },
    phone: { type: String, default: '', trim: true, maxlength: 40 },
    /**
     * Which of the site's topics they picked. Free text rather than an enum: the
     * list lives in the landing site's dictionary in two languages, and an enum
     * here would reject a perfectly good enquiry the day that copy changes.
     */
    topic: { type: String, default: '', trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 4000 },

    /** Which language they wrote from, so the reply goes back in it. */
    lang: { type: String, enum: ['en', 'bn'], default: 'en' },
    /** Where it came from — the landing site today, a partner page later. */
    source: { type: String, default: 'landing', trim: true, maxlength: 40 },

    /**
     * Triage state.
     *
     * `spam` rather than a deletion: a spam run is the thing you most want to
     * look back over when tuning the honeypot, and it keeps the operator's list
     * clean either way.
     */
    status: {
      type: String,
      /*
       * Five states and two endings. A longer funnel is a longer form to fill
       * in, and a stage nobody updates is worse than no stage at all.
       */
      enum: ['new', 'contacted', 'demo', 'trial', 'won', 'lost', 'replied', 'closed', 'spam'],
      default: 'new',
      index: true,
    },
    /** An operator's own note. Never shown to the sender. */
    note: { type: String, default: '', trim: true, maxlength: 2000 },
    handledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    handledAt: { type: Date, default: null },

    /** For rate-limit forensics and for spotting one person filing ten forms. */
    /**
     * Where this person came from.
     *
     * Stored on the lead rather than worked out later, because it cannot be
     * worked out later: by the time somebody signs up, the click that brought
     * them is weeks gone. `fbclid` is the only thing that survives the gap
     * between an ad and a subscription, so it is carried from here onto the
     * organization at signup — see `Organization.acquisition`.
     */
    utm: {
      source: { type: String, default: '', maxlength: 80 },
      medium: { type: String, default: '', maxlength: 80 },
      campaign: { type: String, default: '', maxlength: 120 },
      content: { type: String, default: '', maxlength: 120 },
      term: { type: String, default: '', maxlength: 120 },
    },
    fbclid: { type: String, default: '', maxlength: 300 },
    referrer: { type: String, default: '', maxlength: 300 },
    /** The campaign page they filled the form on, if it was one. */
    landingPage: { type: String, default: '', maxlength: 160 },

    /* ---- the sales side ---- */

    /** Who is working this lead. */
    owner: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /** When to ring them back. Shown as a due list in the console. */
    nextFollowUpAt: { type: Date, default: null },
    /** Dated call notes, newest appended. A pipeline is a record of calls. */
    notes: {
      type: [
        new Schema(
          {
            body: { type: String, required: true, trim: true, maxlength: 2000 },
            by: { type: Schema.Types.ObjectId, ref: 'User' },
            at: { type: Date, default: Date.now },
          },
          { _id: true },
        ),
      ],
      default: [],
    },
    /** The shop this lead became, once they signed up. */
    convertedOrganization: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    convertedAt: { type: Date, default: null },
    lostReason: { type: String, default: '', maxlength: 200 },

    ip: { type: String, default: '', maxlength: 60 },
    userAgent: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: true },
);

/* The console's default view: newest first, filtered by state. */
schema.index({ status: 1, createdAt: -1 });
schema.index({ createdAt: -1 });
/* Repeat senders — the operator's first question about any enquiry. */
schema.index({ email: 1, createdAt: -1 });

export type Lead = InferSchemaType<typeof schema>;
export type LeadDoc = HydratedDocument<Lead>;
export const LeadModel = model('Lead', schema);
