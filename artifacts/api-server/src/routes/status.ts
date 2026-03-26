import { Router, type IRouter } from "express";
import { getBackend } from "../lib/storage";

const router: IRouter = Router();

router.get("/status", (_req, res) => {
  res.json({ backend: getBackend() });
});

export default router;
