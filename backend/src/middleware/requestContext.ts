import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,100}$/;

export const requestContext: RequestHandler = (req, res, next) => {
  const incoming = req.get("X-Request-ID");
  req.requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader("X-Request-ID", req.requestId);
  const startedAt = performance.now();
  res.on("finish", () => {
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    if (process.env.NODE_ENV === "production" || res.statusCode >= 400 || durationMs >= 500) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        severity: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
        requestId: req.requestId,
        method: req.method,
        route: req.originalUrl.split("?")[0],
        status: res.statusCode,
        durationMs,
        userId: req.user?.id ?? null,
      }));
    }
  });
  next();
};
