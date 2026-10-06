import { Router } from "express";
import { seoController } from "./controller";
import { authenticate } from "../../middlewares/auth";

const router = Router();

router.use(authenticate);

router.post("/:id/seo/check", seoController.runCheck);
router.get("/:id/seo/latest", seoController.getLatest);
router.get("/:id/seo", seoController.getHistory);

export default router;
