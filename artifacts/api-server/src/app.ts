import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { initStorageAdapter } from "./lib/storage";

initStorageAdapter();

const app: Express = express();

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
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  ...(process.env.REPLIT_DEV_DOMAIN
    ? [`https://${process.env.REPLIT_DEV_DOMAIN}`]
    : []),
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : []),
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (server-to-server, curl, etc.)
      if (!origin) return cb(null, true);
      // Allow configured origins
      if (ALLOWED_ORIGINS.some((o) => origin.startsWith(o))) return cb(null, true);
      // Allow Replit preview domains
      if (origin.endsWith(".replit.dev") || origin.endsWith(".replit.app")) return cb(null, true);
      // Allow khurk.xyz and subdomains
      if (origin.endsWith("khurk.xyz")) return cb(null, true);
      // Allow github.io pages
      if (origin.endsWith(".github.io")) return cb(null, true);
      cb(null, true); // wide fallback for now
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
