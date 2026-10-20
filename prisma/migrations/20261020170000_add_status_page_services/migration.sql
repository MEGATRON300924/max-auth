CREATE TABLE "status_page_services" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'green',
    "reason" VARCHAR(1000) NOT NULL DEFAULT '',
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "status_page_services_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "status_page_services_service_key_key" ON "status_page_services"("service_key");
CREATE UNIQUE INDEX "status_page_services_name_key" ON "status_page_services"("name");
CREATE INDEX "status_page_services_category_updated_at_idx" ON "status_page_services"("category", "updated_at");
