import { describe, expect, it } from "vitest";
import { assertDevelopmentSeedEnvironment } from "./seedPolicy.js";

describe("development seed policy", () => {
  it("allows development lifecycle seeding outside production", () => {
    expect(() => assertDevelopmentSeedEnvironment({ DATA_LIFECYCLE_ENV: "DEVELOPMENT", NODE_ENV: "development" })).not.toThrow();
    expect(() => assertDevelopmentSeedEnvironment({ DATA_LIFECYCLE_ENV: "DEVELOPMENT", NODE_ENV: "test" })).not.toThrow();
  });

  it.each([
    { DATA_LIFECYCLE_ENV: "UAT", NODE_ENV: "development" },
    { DATA_LIFECYCLE_ENV: "PRODUCTION", NODE_ENV: "development" },
    { DATA_LIFECYCLE_ENV: "DEVELOPMENT", NODE_ENV: "production" },
    { NODE_ENV: "development" },
  ])("refuses unsafe seed environment %#", (environment) => {
    expect(() => assertDevelopmentSeedEnvironment(environment)).toThrow(/Development seed refused/);
  });
});
