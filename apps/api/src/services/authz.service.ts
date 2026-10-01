import { OrganizationModel } from '../models/index.js';
import { forbidden } from '../utils/AppError.js';
import type { Role } from '../types/enums.js';

/**
 * Who may administer the shop.
 *
 * The account that signed up and pays owns everything in it; an `admin` the
 * owner appointed is the same in effect. A pharmacist or salesman works the
 * shop but may not change who works there or what the shop is called.
 */

export interface Actor {
  id: string;
  role: Role;
  org: string | null;
}

/** The subscriber, or someone they appointed alongside themselves. */
export async function isOrgAdmin(actor: Actor): Promise<boolean> {
  if (!actor.org) return false;
  if (actor.role === 'admin') return true;

  const org = await OrganizationModel.findById(actor.org).select('owner').lean();
  return org?.owner?.toString() === actor.id;
}

export async function requireOrgAdmin(actor: Actor) {
  if (await isOrgAdmin(actor)) return;
  throw forbidden('Only the shop owner can do this');
}
