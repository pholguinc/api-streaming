-- CreateTable
CREATE TABLE `Stream` (
    `uid` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NULL DEFAULT 'offline',
    `preferLowLatency` BOOLEAN NOT NULL DEFAULT true,
    `deleteRecordingAfterDays` INTEGER NULL DEFAULT 30,
    `recordingMode` VARCHAR(191) NULL,
    `webRTCUrl` VARCHAR(191) NULL,
    `webRTCPlaybackUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`uid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
