import { Router } from "express";
import { notificationController } from "./controller";
import { authenticate } from "../../middlewares/auth";

const router = Router();

router.use(authenticate);

router.get("/", notificationController.list);
// Registered before "/:id/read" as idiomatic practice for a literal segment
// vs. a param route -- though in this specific case there is no real
// ambiguity to begin with: "/read-all" is a single path segment and
// "/:id/read" always requires exactly two, so Express's route-matching by
// segment shape can never confuse the two regardless of registration
// order. Verified live in both directions (Stage 15.6 §27 test matrix).
router.patch("/read-all", notificationController.markAllRead);
router.patch("/:id/read", notificationController.markOneRead);

export default router;
