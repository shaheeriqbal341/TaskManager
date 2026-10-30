function isProductionEnvironment() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    process.env.VERCEL_ENV === "production"
  );
}

function getAllowedOrigins() {
  const configuredOrigins = process.env.FRONTEND_URL;
  if (!configuredOrigins?.trim()) {
    if (isProductionEnvironment()) {
      throw new Error("FRONTEND_URL must contain the exact allowed frontend origin in production.");
    }
    return ["http://localhost:5173"];
  }

  const origins = [...new Set(configuredOrigins.split(",").map((origin) => origin.trim()).filter(Boolean))];
  for (const origin of origins) {
    let parsedOrigin;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error(`FRONTEND_URL contains an invalid origin: ${origin}`);
    }

    if (
      !["http:", "https:"].includes(parsedOrigin.protocol) ||
      parsedOrigin.origin !== origin ||
      parsedOrigin.username ||
      parsedOrigin.password
    ) {
      throw new Error(`FRONTEND_URL entries must be exact origins without paths: ${origin}`);
    }
  }

  if (!origins.length) {
    throw new Error("FRONTEND_URL must contain at least one allowed frontend origin.");
  }
  return origins;
}

module.exports = { getAllowedOrigins, isProductionEnvironment };
