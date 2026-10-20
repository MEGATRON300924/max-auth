-- Add a nullable address field without modifying existing business records.
ALTER TABLE "businesses" ADD COLUMN "address" VARCHAR(500);
