import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import * as notifCtrl from '../controllers/notification.controller';

const router = Router();

router.use(authenticate);

router.get('/', notifCtrl.listNotifications);
router.get('/unread-count', notifCtrl.getUnreadCount);
router.patch('/:id/read', notifCtrl.markAsRead);
router.post('/mark-all-read', notifCtrl.markAllAsRead);
router.post('/device-token', notifCtrl.registerDeviceToken);
router.delete('/device-token', notifCtrl.deleteDeviceToken);

export const notificationRoutes = router;
export default router;

