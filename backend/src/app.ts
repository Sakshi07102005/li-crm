import cors from "cors";
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env";
import { swaggerSpec } from "./config/swagger";
import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";
import { requestIdMiddleware, requestLogger } from "./middleware/requestLogger";
import routes from "./routes";
import { AppError } from "./utils/AppError";

const app = express();

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows Swagger UI assets
  })
);

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || env.corsOrigins.includes(origin) || !env.isProduction) {
        return callback(null, true);
      }
      callback(new AppError("Origin not allowed by CORS", 403, "CORS_FORBIDDEN"));
    },
    credentials: true,
  })
);

// Request tracking & parsing
app.use(requestIdMiddleware);
app.use(requestLogger);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// Swagger API Documentation
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: "LI CRM API Docs",
  customCss: ".swagger-ui .topbar { display: none }",
}));

app.get("/api/docs.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// Mount API routes
app.use("/api", routes);

// 404 & Global Error Handling
app.use(notFound);
app.use(errorHandler);

export default app;
