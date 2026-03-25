export function outputRootHelp(): void {
  import("../program.js")
    .then(({ buildProgram }) => {
      buildProgram().outputHelp();
    })
    .catch((error) => {
      console.error(
        "[remoteclaw] Failed to display help:",
        error instanceof Error ? (error.stack ?? error.message) : error,
      );
      process.exitCode = 1;
    });
}
