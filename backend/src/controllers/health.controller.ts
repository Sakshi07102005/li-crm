import { Request, Response } from "express";
import { env } from "../config/env";

export const getHealth = (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: "Service is healthy",
    data: {
      status: "OK",
      service: "li-crm-backend",
      environment: env.nodeEnv,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
};

