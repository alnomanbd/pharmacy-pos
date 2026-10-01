import type { Request, Response, NextFunction } from 'express';
import * as userService from '../services/user.service.js';
import { ok, created } from '../utils/response.js';
import { audit, listAuditLogs } from '../services/audit.service.js';
import { storage } from '../services/storage.service.js';
import { planUsage } from '../services/platform.service.js';

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const users = await userService.listUsers(req.user!.org!);
    ok(res, users);
  } catch (err) {
    next(err);
  }
}

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await userService.createUser(req.user!.org!, req.body);
    await audit(req, 'user.create', { model: 'User', id: String(user._id), label: String(user.name ?? '') });
    created(res, user, 'User created');
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await userService.updateUser(req.user!.org!, req.params.id, req.body);
    await audit(req, 'user.update', { model: 'User', id: req.params.id, label: user?.name ?? '' }, { after: req.body });
    ok(res, user, 'User updated');
  } catch (err) {
    next(err);
  }
}

export async function removeUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await userService.softDeleteUser(req.user!.org!, req.params.id);
    await audit(req, 'user.delete', {
      model: 'User',
      id: req.params.id,
      label: user?.name ?? '',
    });
    ok(res, user, 'User removed');
  } catch (err) {
    next(err);
  }
}

/**
 * One person's profile.
 *
 * Readable by an administrator, or by the person themselves — which is the
 * whole reason this is not just the list endpoint filtered client-side. The
 * route enforces that; the service only scopes it to the shop.
 */
export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await userService.getUserProfile(req.user!.org!, req.params.id);
    ok(res, user);
  } catch (err) {
    next(err);
  }
}

/** The signed-in user's own record, updated by them. */
export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await userService.updateOwnProfile(req.user!.id, req.body);
    await audit(req, 'user.update', { model: 'User', id: req.user!.id, label: req.user!.email });
    ok(res, user, 'Profile updated');
  } catch (err) {
    next(err);
  }
}

/**
 * What the shop's plan includes, and how much is used.
 *
 * Read by any member, not only an administrator: the salesman is who presses
 * "Add counter", and a page cannot grey out a button whose limit it may not
 * read. Nothing here is sensitive — it is the shop's own ceiling and its own
 * counts.
 */
export async function getOrgUsage(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await planUsage(req.user!.org!));
  } catch (err) {
    next(err);
  }
}

export async function getOrg(req: Request, res: Response, next: NextFunction) {
  try {
    const org = await userService.getOrganization(req.user!.org!);
    ok(res, org);
  } catch (err) {
    next(err);
  }
}

export async function updateOrg(req: Request, res: Response, next: NextFunction) {
  try {
    const org = await userService.updateOrganization(req.user!.org!, req.body);
    await audit(req, 'organization.update', { model: 'Organization', id: req.user!.org, label: org?.name }, { after: req.body });
    ok(res, org, 'Organization updated');
  } catch (err) {
    next(err);
  }
}

/** Read-only trail of destructive and money-touching actions in this org. */
export async function auditTrail(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listAuditLogs(req.user!.org!, {
      action: req.query.action as string | undefined,
      targetId: req.query.targetId as string | undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    });
    ok(res, data);
  } catch (err) {
    next(err);
  }
}
