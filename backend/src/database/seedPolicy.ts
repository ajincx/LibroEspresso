export function assertDevelopmentSeedEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.DATA_LIFECYCLE_ENV !== "DEVELOPMENT" || environment.NODE_ENV === "production") {
    throw new Error("Development seed refused: require DATA_LIFECYCLE_ENV=DEVELOPMENT and NODE_ENV must not be production.");
  }
}
