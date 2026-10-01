import type { Request, Response, NextFunction } from 'express';
import * as medicineService from '../services/medicine.service.js';
import { ok } from '../utils/response.js';

export async function search(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await medicineService.searchMedicines({
      q: req.query.q as string | undefined,
      generic: req.query.generic as string | undefined,
      group: req.query.group as string | undefined,
      company: req.query.company as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    ok(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const medicine = await medicineService.getMedicine(req.params.id);
    ok(res, medicine);
  } catch (err) {
    next(err);
  }
}

export async function references(req: Request, res: Response, next: NextFunction) {
  try {
    // `?only=groups,companies` — a caller that needs two of the four lists should
    // not download 2,045 generics to get them.
    const only = String(req.query.only || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is medicineService.ReferenceList =>
        ['groups', 'companies', 'generics', 'dosageForms'].includes(s),
      );
    const refs = await medicineService.getReferenceLists(only);
    ok(res, refs);
  } catch (err) {
    next(err);
  }
}
