import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import * as taskController from '../controllers/task.controller';

const router = Router();

// List tasks (visibility handled in service)
router.get(
  '/',
  authenticate,
  taskController.listTasks,
);

// Create task
router.post(
  '/',
  authenticate,
  requirePermission('tasks.manage'),
  taskController.createTask,
);

// Get single task
router.get(
  '/:id',
  authenticate,
  taskController.getTaskById,
);

// Update task
router.put(
  '/:id',
  authenticate,
  requirePermission('tasks.manage'),
  taskController.updateTask,
);

// Change task status
router.patch(
  '/:id/status',
  authenticate,
  taskController.changeTaskStatus,
);

// Delete task
router.delete(
  '/:id',
  authenticate,
  requirePermission('tasks.manage'),
  taskController.deleteTask,
);

export { router as taskRoutes };

