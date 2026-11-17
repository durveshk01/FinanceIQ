Object.assign(process.env, { NODE_ENV: "test" });
import("../render-backend/src/index")
  .then(({ default: app }) => {
    const server = app.listen(4140, "127.0.0.1", () =>
      console.log("Browser-test cloud backend listening on 4140"),
    );
    for (const signal of ["SIGINT", "SIGTERM"] as const)
      process.on(signal, () => server.close(() => process.exit(0)));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
