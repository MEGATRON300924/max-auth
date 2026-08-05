import { Router } from "express";
import { adminController } from "../controllers/admin.controller";
import { authenticate } from "../middleware/authenticate";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

router.use(authenticate, requireAdmin);

/** @openapi /admin/users: get: tags: [Admin] summary: List/search users (paginated) */
router.get("/users", adminController.listUsers);

/** @openapi /admin/users/{userId}: get: tags: [Admin] summary: Get a single user by ID */
router.get("/users/:userId", adminController.getUser);

/** @openapi /admin/users/{userId}/suspend: post: tags: [Admin] summary: Suspend a user account */
router.post("/users/:userId/suspend", adminController.suspendUser);

/** @openapi /admin/users/{userId}/reactivate: post: tags: [Admin] summary: Reactivate a suspended user account */
router.post("/users/:userId/reactivate", adminController.reactivateUser);

/** @openapi /admin/stats: get: tags: [Admin] summary: Get platform-wide statistics */
router.get("/stats", adminController.stats);

export default router;
