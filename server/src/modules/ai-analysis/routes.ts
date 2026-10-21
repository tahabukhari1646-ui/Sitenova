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
// Stage 18.2: read-only -- the newest stored SUCCEEDED analysis for this
// check (or null). Same ownership chain as the POST above; never calls a
// provider.
router.get(
  "/:id/performance-checks/:checkId/ai-analysis/latest",
  aiAnalysisController.getLatestPerformanceAnalysis
);
// Stage 18.3: SEO diagnosis of one stored SeoCheck -- same ownership chain
// (website, then the check cross-checked against it). POST runs the manual
// analysis; GET .../latest is read-only.
router.post("/:id/seo-checks/:checkId/ai-analysis", aiAnalysisController.analyzeSeoCheck);
router.get("/:id/seo-checks/:checkId/ai-analysis/latest", aiAnalysisController.getLatestSeoAnalysis);
// Stage 18.5: uptime diagnosis of one stored incident -- same ownership
// chain (website, then the incident cross-checked against it). Manual only.
router.post("/:id/incidents/:incidentId/ai-analysis", aiAnalysisController.analyzeIncident);
router.get("/:id/incidents/:incidentId/ai-analysis/latest", aiAnalysisController.getLatestIncidentAnalysis);

export default router;
