import { z } from 'zod';

/**
 * What a shop may change about itself.
 *
 * An allow-list, and the reason is not tidiness. `PATCH /users/organization/me`
 * used to `$set` whatever body it was given straight onto the organisation
 * document — with no schema at all. That document is also where `status`,
 * `plan` and `trialEndsAt` live, so a shop's own admin could
 * lift its suspension, move itself onto a bigger plan, or extend its own
 * subscription by naming those fields in the request. The role guard on the
 * route was never the problem; the missing schema was.
 *
 * So the fields below are the ones a shop owns — how it is named, reached and
 * printed. Anything else is the platform's, and `.strict()` refuses the request
 * rather than quietly dropping it: a settings page that says "saved" while
 * ignoring half of what it sent is worse than an error.
 */
const address = z
  .object({
    street: z.string().max(200).optional(),
    area: z.string().max(120).optional(),
    city: z.string().max(120).optional(),
    district: z.string().max(120).optional(),
    postcode: z.string().max(20).optional(),
  })
  .strict();

export const organizationUpdateSchema = z
  .object({
    /*
     * The messages are written out because they are shown to the person who
     * typed the value: the app now surfaces `fieldErrors` in its toast, so
     * zod's default ("String must contain at least 2 character(s)") ends up on
     * screen in front of a shop administrator.
     */
    name: z.string().trim().min(2, 'The shop needs a name').max(160, 'That name is too long').optional(),
    contactPhone: z.string().trim().max(20, 'That phone number is too long').optional(),
    contactEmail: z
      .string()
      .trim()
      .email('That does not look like an email address')
      .max(160)
      .or(z.literal(''))
      .optional(),
    logo: z.string().trim().max(500).optional(),
    address: address.optional(),
    settings: z
      .object({
        smsEnabled: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Nothing to update',
  });
