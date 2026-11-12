import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import { AppError } from '../utils/AppError';
import * as importCtrl from '../controllers/import.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    if (ext.endsWith('.csv') || ext.endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(AppError.validationError('Only .csv and .xlsx files are supported') as any, false);
    }
  },
});

const router = Router();

router.use(authenticate);
router.use(requirePermission('leads.import'));

router.get('/template', importCtrl.getTemplate);
router.post('/', upload.single('file'), importCtrl.importLeads);

export const importRoutes = router;
export default router;

