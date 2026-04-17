async function main(): Promise<void> {
  // Entry point. Story 002 wires config; Story 003 wires structured logging.
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});
