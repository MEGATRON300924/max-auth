// Runs before any test file is imported (see jest.config.js -> setupFiles).
// config/env.ts throws at import time if required vars are missing, and
// several security/service modules import env transitively — so these
// dummy values must be in place before Jest loads any test file.

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test_access_secret_test_access_secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test_refresh_secret_test_refresh_secret";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "test_csrf_secret_test_csrf_secret";
