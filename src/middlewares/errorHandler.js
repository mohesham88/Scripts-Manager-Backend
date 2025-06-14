export const errorHandlerMiddleware = (err, req, res, next) => {
  console.log("Internal Server Error");
  res.status(err.status || 500).json({
    message: err.message || err.code || "Internal Server Error",
  });
};
