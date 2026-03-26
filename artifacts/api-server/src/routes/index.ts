import { Router } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import filesRouter from "./files";
import shareRouter from "./share";
import statusRouter from "./status";
import foldersRouter from "./folders";
import activityRouter from "./activity";
import sharedFoldersRouter from "./shared-folders";

const router = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/files", filesRouter);
router.use("/folders", foldersRouter);
router.use("/activity", activityRouter);
router.use("/shared-folder", sharedFoldersRouter);
router.use(shareRouter);
router.use(statusRouter);

export default router;
