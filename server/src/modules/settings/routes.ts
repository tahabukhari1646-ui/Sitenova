import { Router } from "express";
import { settingsController } from "./controller";
import { authenticate } from "../../middlewares/auth";

const router = Router();

router.use(authenticate);

// A new top-level mount, like /auth and /notifications -- this codebase has
// no existing /users/me or /account route to extend (confirmed by
// inspection), so this does not duplicate an established pattern.
router.get("/", settingsController.get);
router.patch("/account", settingsController.updateAccount);
router.patch("/notifications", settingsController.updateNotifications);
router.patch("/appearance", settingsController.updateAppearance);

export default router;
