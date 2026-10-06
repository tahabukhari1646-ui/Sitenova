import { Router } from "express";
import { websiteController } from "./controller";
import { authenticate } from "../../middlewares/auth";

const router = Router();

router.use(authenticate);

router.post("/", websiteController.create);
router.get("/", websiteController.getAll);
router.get("/:id", websiteController.getById);
router.patch("/:id", websiteController.update);
router.delete("/:id", websiteController.delete);

export default router;
