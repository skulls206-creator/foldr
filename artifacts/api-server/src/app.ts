import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
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

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
