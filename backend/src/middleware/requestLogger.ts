import { Request, Response, NextFunction } from "express";
import morgan from "morgan";
import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env";

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const incomingId = req.header("x-request-id");
  const requestId = incomingId || uuidv4();
  req.headers["x-request-id"] = requestId;
  res.setHeader("x-request-id", requestId);
  next();
};

morgan.token("request-id", (req: Request) => {
  return (req.headers["x-request-id"] as string) || "-";
});

morgan.token("user-id", (req: Request) => {
  return req.user?.id || "anonymous";
});

export const requestLogger = env.isProduction
  ? morgan(
      '{"time":":date[iso]","requestId":":request-id","userId":":user-id","method":":method","url":":url","status":":status","responseTime":":response-time ms"}'
    )
  : morgan(":method :url :status :response-time ms - reqId: :request-id user: :user-id");

