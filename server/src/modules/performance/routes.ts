import { Router } from "express";
import { performanceController } from "./controller";
import { authenticate } from "../../middlewares/auth";

const router = Router();

router.use(authenticate);

router.post("/:id/performance/check", performanceController.runCheck);
router.get("/:id/performance/latest", performanceController.getLatest);
router.get("/:id/performance", performanceController.getHistory);
router.get("/:id/performance/stats", performanceController.getStats);

export default router;
