import { Router } from "express";
import { aiAnalysisController } from "./controller";
import { authenticate } from "../../middlewares/auth";

const router = Router();

router.use(authenticate);

// Nested under /websites/:id like every other module in this app (website,
// monitor, performance, seo) -- no new top-level routing hierarchy is
// introduced. :checkId addresses the specific PerformanceCheck to analyze;
// :id (the website) is independently verified first, then cross-checked
// against the check's own websiteId (ai-analysis/service.ts), so neither
// param is trusted alone.
router.post("/:id/performance-checks/:checkId/ai-analysis", aiAnalysisController.analyzePerformanceCheck);

export default router;
