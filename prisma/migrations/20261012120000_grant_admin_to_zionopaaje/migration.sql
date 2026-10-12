-- Grant the initial MAX Auth administrator role to the existing founder account.
-- This is a one-time deployment bootstrap; admin authorization remains enforced server-side.
UPDATE "users"
SET "isAdmin" = TRUE, "updatedAt" = CURRENT_TIMESTAMP
WHERE LOWER("username") = 'zionopaaje';
