import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as catalogue from '../services/catalogue.service.js';
import * as requests from '../services/medicineRequest.service.js';
import * as gaps from '../services/catalogueGaps.service.js';
import { z } from 'zod';
import { requirePermission } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import {
  approveRequestSchema,
  medicineInputSchema,
  medicinePatchSchema,
  refNameSchema,
  rejectRequestSchema,
} from '../validators/catalogue.validator.js';
import { ok } from '../utils/response.js';
import { audit } from '../services/audit.service.js';
import { notFound } from '../utils/AppError.js';

/**
 * The shared medicine catalogue and the shops' requests for what it lacks.
 *
 * Mounted inside the platform router, so reaching it at all already took a
 * platform role and a second factor. What separates a reader from an editor is
 * `catalogue.view` and `catalogue.manage`; the older `formulary.*` pair is
 * accepted beside them so a colleague granted those before this page existed
 * is not locked out of it.
 */
const router = Router();

const canView = requirePermission('catalogue.view', 'catalogue.manage', 'formulary.view', 'formulary.manage');
const canManage = requirePermission('catalogue.manage', 'formulary.manage');

const handle =
  <T>(run: (req: Request) => Promise<T>, message?: string) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await run(req), message);
    } catch (err) {
      next(err);
    }
  };

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (v === undefined || v === '' ? undefined : Number(v));

const kindOf = (req: Request) => {
  const kind = req.params.kind;
  if (!catalogue.isRefKind(kind)) throw notFound('List');
  return kind;
};

/** The model name each list is stored under, for the audit trail. */
const REF_MODEL_NAME = {
  companies: 'MedicineCompany',
  generics: 'MedicineGeneric',
  groups: 'MedicineGroup',
} as const;

/* ------------------------------------------------------------ the gaps -- */

/**
 * What the catalogue is missing, and suggestions from shops' own entries to
 * fill it — see catalogueGaps.service. Reading needs `catalogue.view`;
 * accepting, dismissing and writing a generic's write-up need
 * `catalogue.manage`.
 */
const operator = (req: Request) => req.user?.name || 'console';
const gapFilter = z
  .object({
    field: z.enum(gaps.GAP_FIELDS).optional(),
    confidence: z.enum(['high', 'low']).optional(),
    kind: z.enum(['fill', 'update']).optional(),
    stockedOnly: z.boolean().optional(),
  })
  .optional();

router.get('/catalogue/gaps', canView, handle(() => gaps.gapsOverview()));
router.get(
  '/catalogue/gaps/suggestions',
  canView,
  handle((req) =>
    gaps.listSuggestions({
      field: str(req.query.field),
      confidence: str(req.query.confidence),
      kind: str(req.query.kind),
      stockedOnly: req.query.stockedOnly === 'true',
      page: num(req.query.page),
      limit: num(req.query.limit),
    }),
  ),
);
router.post(
  '/catalogue/gaps/decide',
  canManage,
  validate(z.object({ ids: z.array(z.string().max(40)).max(5000).optional(), filter: gapFilter, accept: z.boolean() })),
  handle(async (req) => {
    const r = await gaps.decideSuggestions(req.body, operator(req));
    await audit(
      req,
      'catalogue.medicine_update',
      // Many medicines at once: no one record to point at, so no id.
      { model: 'Medicine', label: req.body.accept ? `${r.applied} suggestion(s) accepted` : `${r.dismissed} suggestion(s) dismissed` },
      { after: { ...r, filter: req.body.filter ?? null, count: req.body.ids?.length ?? null } },
    );
    return r;
  }, 'Done'),
);
router.post('/catalogue/gaps/rebuild', canManage, handle(() => gaps.rebuildSuggestions(), 'Suggestions worked out again'));

router.get(
  '/catalogue/gaps/generics',
  canView,
  handle((req) => gaps.genericsWithoutWriteup({ search: str(req.query.q), page: num(req.query.page), limit: num(req.query.limit) })),
);
router.get('/catalogue/generics/:id/writeup', canView, handle((req) => gaps.getGenericWriteup(req.params.id)));
router.put(
  '/catalogue/generics/:id/writeup',
  canManage,
  validate(
    z.object({
      drugClass: z.string().max(200).optional(),
      monograph: z.object(Object.fromEntries(gaps.MONOGRAPH_KEYS.map((k) => [k, z.string().max(20_000).optional()]))),
    }),
  ),
  handle(async (req) => {
    const r = await gaps.saveGenericWriteup(req.params.id, req.body, operator(req));
    await audit(req, 'catalogue.ref_update', { model: 'MedicineGeneric', id: req.params.id, label: `${r.name}: write-up` }, { after: { sections: Object.keys(req.body.monograph ?? {}) } });
    return r;
  }, 'Write-up saved'),
);

const medicineLabel = (m: { brandName: string; strength: string }) =>
  [m.brandName, m.strength].filter(Boolean).join(' ');

/* ----------------------------------------------------------- medicines -- */

router.get('/catalogue/stats', canView, handle(() => catalogue.catalogueStats()));

router.get('/catalogue/dosage-forms', canView, handle(() => catalogue.dosageForms()));

router.get(
  '/catalogue/medicines',
  canView,
  handle((req) =>
    catalogue.listMedicines({
      q: str(req.query.q),
      company: str(req.query.company),
      generic: str(req.query.generic),
      group: str(req.query.group),
      dosageForm: str(req.query.dosageForm),
      active: catalogue.activeFilter(req.query.active),
      page: num(req.query.page),
      limit: num(req.query.limit),
    }),
  ),
);

router.get('/catalogue/medicines/:id', canView, handle((req) => catalogue.getMedicine(req.params.id)));

router.post(
  '/catalogue/medicines',
  canManage,
  validate(medicineInputSchema),
  handle(async (req) => {
    const medicine = await catalogue.createMedicine(req.body);
    await audit(
      req,
      'catalogue.medicine_create',
      { model: 'Medicine', id: medicine._id, label: medicineLabel(medicine) },
      { after: req.body },
    );
    return medicine;
  }, 'Medicine added'),
);

router.patch(
  '/catalogue/medicines/:id',
  canManage,
  validate(medicinePatchSchema),
  handle(async (req) => {
    const { medicine, before } = await catalogue.updateMedicine(req.params.id, req.body);
    const changed = Object.keys(req.body) as (keyof typeof before)[];
    await audit(
      req,
      'catalogue.medicine_update',
      { model: 'Medicine', id: medicine._id, label: medicineLabel(medicine) },
      {
        before: Object.fromEntries(changed.filter((k) => k in before).map((k) => [k, before[k]])),
        after: req.body,
      },
    );
    return medicine;
  }, 'Medicine saved'),
);

router.delete(
  '/catalogue/medicines/:id',
  canManage,
  handle(async (req) => {
    const { label, ...result } = await catalogue.deleteMedicine(req.params.id);
    await audit(req, 'catalogue.medicine_delete', { model: 'Medicine', id: result.id, label });
    return result;
  }, 'Medicine deleted'),
);

/* ------------------------------------------- companies, generics, groups -- */

// The kinds are spelled out in the path so `/catalogue/medicines` and the rest
// above can never be read as a kind.
const REF_PATH = '/catalogue/:kind(companies|generics|groups)';

router.get(
  REF_PATH,
  canView,
  handle((req) =>
    catalogue.listRefs(kindOf(req), {
      q: str(req.query.q),
      page: num(req.query.page),
      limit: num(req.query.limit),
    }),
  ),
);

router.post(
  REF_PATH,
  canManage,
  validate(refNameSchema),
  handle(async (req) => {
    const kind = kindOf(req);
    const ref = await catalogue.createRef(kind, req.body);
    await audit(req, 'catalogue.ref_create', { model: REF_MODEL_NAME[kind], id: ref._id, label: ref.name });
    return ref;
  }, 'Added'),
);

router.patch(
  `${REF_PATH}/:id`,
  canManage,
  validate(refNameSchema),
  handle(async (req) => {
    const kind = kindOf(req);
    const { ref, before } = await catalogue.updateRef(kind, req.params.id, req.body);
    await audit(
      req,
      'catalogue.ref_update',
      { model: REF_MODEL_NAME[kind], id: ref._id, label: ref.name },
      { before: { name: before }, after: { name: ref.name } },
    );
    return ref;
  }, 'Saved'),
);

router.delete(
  `${REF_PATH}/:id`,
  canManage,
  handle(async (req) => {
    const kind = kindOf(req);
    const { name, ...result } = await catalogue.deleteRef(kind, req.params.id);
    await audit(req, 'catalogue.ref_delete', { model: REF_MODEL_NAME[kind], id: result.id, label: name });
    return result;
  }, 'Deleted'),
);

/* ---------------------------------------------------- medicine requests -- */

router.get(
  '/medicine-requests',
  canView,
  handle((req) =>
    requests.listRequests({
      status: str(req.query.status),
      page: num(req.query.page),
      limit: num(req.query.limit),
    }),
  ),
);

router.post(
  '/medicine-requests/:id/approve',
  canManage,
  validate(approveRequestSchema),
  handle(async (req) => {
    const { request, created } = await requests.approveRequest(req.params.id, req.user!.id, req.body);
    if (created) {
      await audit(
        req,
        'catalogue.medicine_create',
        { model: 'Medicine', id: created._id, label: medicineLabel(created) },
        { after: { ...req.body.medicine, fromRequest: req.params.id } },
      );
    }
    await audit(
      req,
      'catalogue.request_approve',
      { model: 'MedicineRequest', id: req.params.id, label: request?.brandName ?? '' },
      { after: { medicine: request?.medicine ?? null } },
    );
    return request;
  }, 'Request approved'),
);

router.post(
  '/medicine-requests/:id/reject',
  canManage,
  validate(rejectRequestSchema),
  handle(async (req) => {
    const request = await requests.rejectRequest(req.params.id, req.user!.id, req.body.reason);
    await audit(
      req,
      'catalogue.request_reject',
      { model: 'MedicineRequest', id: req.params.id, label: request?.brandName ?? '' },
      { after: { reason: req.body.reason } },
    );
    return request;
  }, 'Request rejected'),
);

export default router;
