import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * One run of a scheduled job, and how it ended.
 *
 * The scheduler only ever wrote to the log, so "did the renewal reminders go
 * out last night?" meant reading server logs. The console's System page reads
 * this instead: when each job last ran, whether it worked, and the last error.
 * Kept for 30 days.
 */
const schema = new Schema(
  {
    job: { type: String, required: true, index: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    ok: { type: Boolean, default: false },
    error: { type: String, default: '' },
    /** What it did, in the job's own words: `{ sent: 3 }`. */
    result: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

schema.index({ job: 1, startedAt: -1 });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export type JobRun = InferSchemaType<typeof schema>;
export type JobRunDoc = HydratedDocument<JobRun>;
export const JobRunModel = model('JobRun', schema);
