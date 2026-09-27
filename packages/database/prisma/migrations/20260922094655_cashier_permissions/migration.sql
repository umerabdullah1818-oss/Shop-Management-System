-- AlterTable
ALTER TABLE "User" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lockedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CashierProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "counterId" TEXT,
    "dashboardModules" JSONB NOT NULL,
    "dashboardWidgets" JSONB NOT NULL,
    "canEditPrice" BOOLEAN NOT NULL DEFAULT true,
    "canApplyDiscount" BOOLEAN NOT NULL DEFAULT true,
    "canCreateCustomer" BOOLEAN NOT NULL DEFAULT true,
    "canCollectKhataPayment" BOOLEAN NOT NULL DEFAULT true,
    "canProcessReturn" BOOLEAN NOT NULL DEFAULT false,
    "canCancelInvoice" BOOLEAN NOT NULL DEFAULT false,
    "canReprintInvoice" BOOLEAN NOT NULL DEFAULT true,
    "canViewPreviousInvoices" BOOLEAN NOT NULL DEFAULT true,
    "canScanBarcode" BOOLEAN NOT NULL DEFAULT true,
    "canViewStock" BOOLEAN NOT NULL DEFAULT true,
    "canOpenCloseShift" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashierProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashierProfile_userId_key" ON "CashierProfile"("userId");

-- CreateIndex
CREATE INDEX "CashierProfile_counterId_idx" ON "CashierProfile"("counterId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashierProfile" ADD CONSTRAINT "CashierProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashierProfile" ADD CONSTRAINT "CashierProfile_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "Counter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
