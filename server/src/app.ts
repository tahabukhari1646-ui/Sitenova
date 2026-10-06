import express from "express";
import websiteRoutes from "./modules/website/routes";
import authRoutes from "./modules/auth/routes";
import monitorRoutes from "./modules/monitor/routes";
import performanceRoutes from "./modules/performance/routes";
import seoRoutes from "./modules/seo/routes";
import aiAnalysisRoutes from "./modules/ai-analysis/routes";
import notificationRoutes from "./modules/notification/routes";
import settingsRoutes from "./modules/settings/routes";
import { errorHandler } from "./middlewares/errorHandler";

const app = express();

app.use(express.json());

app.use("/websites", websiteRoutes);
app.use("/websites", monitorRoutes);
app.use("/websites", performanceRoutes);
app.use("/websites", seoRoutes);
app.use("/websites", aiAnalysisRoutes);
app.use("/auth", authRoutes);
// Global, user-scoped -- not website-scoped, so it is not mounted under
// /websites like every other route above (Stage 15.6 §16).
app.use("/notifications", notificationRoutes);
// Stage 16.8: global, user-scoped like /notifications above -- Settings
// has no website/resource param at all, only the authenticated user.
app.use("/settings", settingsRoutes);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "SiteNova Backend Running",
    version: "1.0.0",
  });
});

app.use(errorHandler);

export default app;
