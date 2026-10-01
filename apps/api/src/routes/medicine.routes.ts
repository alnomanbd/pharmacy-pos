import { Router } from 'express';
import * as medicineController from '../controllers/medicine.controller.js';

const router = Router();

router.get('/', medicineController.search);
router.get('/references', medicineController.references);
router.get('/:id', medicineController.getOne);

export default router;

