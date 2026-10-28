// Stage 19.1: the ONE place that decides which database the test suite uses.
//
// Safety lock: the suite only ever talks to a database whose name ends in
// "_test" and differs from the development database in server/.env. Any
// other name stops the run before a single query is sent.

export const DEFAULT_TEST_DATABASE_NAME = "sitenova_test";

const SAFE_TEST_NAME = /^[a-z0-9_]+_test$/;

export function databaseNameOf(connectionString: string): string {
  return decodeURIComponent(new URL(connectionString).pathname.slice(1));
}

export function assertSafeTestDatabaseName(name: string, developmentName?: string): void {
  if (!SAFE_TEST_NAME.test(name) || name === developmentName) {
    throw new Error(
      `REFUSING TO RUN TESTS: database "${name}" is not a dedicated test database ` +
        `(the name must end in "_test" and must not be the development database).`
    );
  }
}

// Same server, user and password as development -- only the database name
// changes. TEST_DATABASE_NAME can override the default name.
export function resolveTestDatabaseUrl(developmentUrl: string | undefined): string {
  if (!developmentUrl) {
    throw new Error("DATABASE_URL is not set in server/.env -- the test suite needs it to find Postgres.");
  }
  const url = new URL(developmentUrl);
  const developmentName = databaseNameOf(developmentUrl);
  const testName = process.env.TEST_DATABASE_NAME?.trim() || DEFAULT_TEST_DATABASE_NAME;
  assertSafeTestDatabaseName(testName, developmentName);
  url.pathname = `/${testName}`;
  return url.toString();
}

// Error output from Postgres/Prisma may echo the connection string; never
// print the password.
export function redactSecrets(text: string, connectionString: string): string {
  const password = decodeURIComponent(new URL(connectionString).password);
  const withoutPassword = password ? text.split(password).join("<redacted>") : text;
  return withoutPassword.replace(/postgres(ql)?:\/\/\S+/g, "<redacted-url>");
}
