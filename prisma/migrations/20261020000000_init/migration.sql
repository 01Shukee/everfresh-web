-- Hand-written to match prisma/schema.prisma (generated SQL could not be produced offline).
-- Verify with: npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_URL" --exit-code
CREATE TABLE "Category" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "slug" TEXT NOT NULL, "sort" INTEGER NOT NULL DEFAULT 0, "active" BOOLEAN NOT NULL DEFAULT true, CONSTRAINT "Category_pkey" PRIMARY KEY ("id"));
CREATE TABLE "MenuItem" ("id" TEXT NOT NULL, "categoryId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '', "basePriceKobo" INTEGER NOT NULL, "variants" JSONB NOT NULL DEFAULT '[]', "addOnGroups" JSONB NOT NULL DEFAULT '[]', "tags" TEXT[], "imageUrl" TEXT, "imageAlt" TEXT NOT NULL DEFAULT '', "active" BOOLEAN NOT NULL DEFAULT true, "available" BOOLEAN NOT NULL DEFAULT true, "sort" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Order" ("id" TEXT NOT NULL, "orderNumber" TEXT NOT NULL, "publicToken" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "customer" JSONB NOT NULL, "fulfilment" JSONB NOT NULL, "lines" JSONB NOT NULL, "subtotalKobo" INTEGER NOT NULL, "deliveryFeeKobo" INTEGER NOT NULL, "discountKobo" INTEGER NOT NULL, "promoCode" TEXT, "totalKobo" INTEGER NOT NULL, "status" TEXT NOT NULL, "paymentStatus" TEXT NOT NULL, "notes" TEXT[], "paidAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Order_pkey" PRIMARY KEY ("id"));
CREATE TABLE "PaymentAttempt" ("reference" TEXT NOT NULL, "orderId" TEXT NOT NULL, "checkoutId" TEXT, "checkoutUrl" TEXT, "status" TEXT NOT NULL, "chargeId" TEXT, "error" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("reference"));
CREATE TABLE "WebhookEvent" ("id" TEXT NOT NULL, "type" TEXT NOT NULL, "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Doc" ("collection" TEXT NOT NULL, "id" TEXT NOT NULL, "data" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Doc_pkey" PRIMARY KEY ("collection","id"));
CREATE INDEX "MenuItem_categoryId_idx" ON "MenuItem"("categoryId");
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
CREATE INDEX "PaymentAttempt_orderId_idx" ON "PaymentAttempt"("orderId");
CREATE INDEX "PaymentAttempt_chargeId_idx" ON "PaymentAttempt"("chargeId");
CREATE INDEX "Doc_collection_createdAt_idx" ON "Doc"("collection", "createdAt");
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
