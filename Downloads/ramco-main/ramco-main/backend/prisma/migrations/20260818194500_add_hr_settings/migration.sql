-- CreateTable
CREATE TABLE "HrSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" INTEGER,

    CONSTRAINT "HrSetting_pkey" PRIMARY KEY ("id")
);
