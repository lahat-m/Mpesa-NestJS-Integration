-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT');

-- CreateTable
CREATE TABLE "mpesa_transactions" (
    "id" TEXT NOT NULL,
    "merchantRequestID" TEXT NOT NULL,
    "checkoutRequestID" TEXT NOT NULL,
    "responseCode" TEXT,
    "responseDescription" TEXT,
    "customerMessage" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "accountReference" TEXT NOT NULL,
    "transactionDesc" TEXT NOT NULL,
    "mpesaReceiptNumber" TEXT,
    "transactionDate" TIMESTAMP(3),
    "resultCode" INTEGER,
    "resultDesc" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mpesa_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mpesa_transactions_merchantRequestID_key" ON "mpesa_transactions"("merchantRequestID");

-- CreateIndex
CREATE UNIQUE INDEX "mpesa_transactions_checkoutRequestID_key" ON "mpesa_transactions"("checkoutRequestID");

-- CreateIndex
CREATE INDEX "mpesa_transactions_merchantRequestID_idx" ON "mpesa_transactions"("merchantRequestID");

-- CreateIndex
CREATE INDEX "mpesa_transactions_status_idx" ON "mpesa_transactions"("status");

-- CreateIndex
CREATE INDEX "mpesa_transactions_phoneNumber_idx" ON "mpesa_transactions"("phoneNumber");

-- CreateIndex
CREATE INDEX "mpesa_transactions_createdAt_idx" ON "mpesa_transactions"("createdAt");

-- CreateIndex
CREATE INDEX "mpesa_transactions_status_createdAt_idx" ON "mpesa_transactions"("status", "createdAt");
