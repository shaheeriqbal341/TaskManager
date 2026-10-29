function notFound(req, res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.status = 404;
  next(error);
}

function errorHandler(error, req, res, next) {
  let status = error.status || 500;
  let message = error.message || "An unexpected server error occurred.";

  if (error.name === "ValidationError") {
    status = 400;
    message = Object.values(error.errors)
      .map((item) => item.message)
      .join(" ");
  } else if (error.name === "CastError") {
    status = 400;
    message = "The provided task ID is invalid.";
  }

  if (status >= 500) {
    console.error(error);
    message = "An unexpected server error occurred.";
  }

  res.status(status).json({ error: message });
}

module.exports = { notFound, errorHandler };
