import { Schema, model } from 'mongoose';

/**
 * Gapless, collision-free sequences — today only invoice numbers.
 *
 * Counting the existing documents would be wrong twice over: two verifications
 * a second apart would read the same count and issue the same number, and a
 * deleted row would make the next invoice reuse a number that is already on a
 * shop's books. A single atomic `$inc` under a named key has neither problem.
 */
const schema = new Schema({
  /** e.g. `invoice:2026` — one sequence per year. */
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const CounterModel = model('Counter', schema);

/** The next number in `key`, incremented atomically. Starts at 1. */
export async function nextSequence(key: string): Promise<number> {
  const doc = await CounterModel.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  ).lean();
  return doc!.seq;
}
