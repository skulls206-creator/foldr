import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pinoHttp from "pino-http";
import multer from "multer";
import router from "./routes";
import { logger } from "./lib/logger";
import { initStorageAdapter } from "./lib/storage";

initStorageAdapter();

const app: Express = express();

// Explicit allowlist — keeps cross-origin access locked to known frontends.
// Replit preview and deploy domains are allowed for development/staging.
const ALLOWED_ORIGINS = new Set([
  "https://skulls206-creator.github.io",
  "https://khurk.xyz",
  "https://www.khurk.xyz",
  "https://foldr.khurk.xyz",
]);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin(origin, callback) {
      // No origin = server-to-server / curl / same-origin — allow
      if (!origin) return callback(null, true);
      // Replit preview and deploy domains (development + staging)
      if (
        origin.endsWith(".replit.dev") ||
        origin.endsWith(".replit.app") ||
        origin.endsWith(".repl.co")
      ) {
        return callback(null, true);
      }
      // Production frontends
      if (ALLOWED_ORIGINS.has(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin not allowed — ${origin}`));
    },
    credentials: true,
  }),
);

app.set("trust proxy", 1);

app.use(helmet());
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/api", router);

// ── Error handler ───────────────────────────────────────────────────────
// Catches multer/fileFilter errors and returns them as JSON
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "File too large. Maximum size is 100 MB." });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }
  if (err.message?.startsWith?.("File type")) {
    res.status(415).json({ error: err.message });
    return;
  }
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
