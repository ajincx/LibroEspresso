import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/appError.js";
import type { DatabaseError } from "pg";

export const notFoundHandler: RequestHandler = (req, _res, next) => next(new AppError(404, "NOT_FOUND", `Route ${req.method} ${req.path} was not found`));
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) return void res.status(422).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: error.flatten() } });
  if (error instanceof AppError) return void res.status(error.status).json({ success: false, error: { code: error.code, message: error.message, details: error.details } });
  const databaseError = error as DatabaseError;
  if (databaseError.code === "23505") return void res.status(409).json({ success: false, error: { code: "DUPLICATE_RECORD", message: "A record with the same unique value already exists" } });
  if (databaseError.code === "23503" || databaseError.code === "23514") return void res.status(422).json({ success: false, error: { code: "DATA_INTEGRITY_ERROR", message: "The supplied data violates a database constraint" } });
  console.error(error);
  res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
};
