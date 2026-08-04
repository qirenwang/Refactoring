-- Physical sample storage is no longer tracked by the application.

SET @sample_storage_fk = (
    SELECT CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'SampleDetails'
      AND COLUMN_NAME = 'StorageLocation'
      AND REFERENCED_TABLE_NAME = 'StorageLoc_Ref'
    LIMIT 1
);
SET @drop_sample_storage_fk_sql = IF(
    @sample_storage_fk IS NULL,
    'SELECT 1',
    CONCAT('ALTER TABLE `SampleDetails` DROP FOREIGN KEY `', @sample_storage_fk, '`')
);
PREPARE drop_sample_storage_fk_stmt FROM @drop_sample_storage_fk_sql;
EXECUTE drop_sample_storage_fk_stmt;
DEALLOCATE PREPARE drop_sample_storage_fk_stmt;

SET @user_storage_fk = (
    SELECT CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'sample_storage_location'
      AND REFERENCED_TABLE_NAME = 'StorageLoc_Ref'
    LIMIT 1
);
SET @drop_user_storage_fk_sql = IF(
    @user_storage_fk IS NULL,
    'SELECT 1',
    CONCAT('ALTER TABLE `users` DROP FOREIGN KEY `', @user_storage_fk, '`')
);
PREPARE drop_user_storage_fk_stmt FROM @drop_user_storage_fk_sql;
EXECUTE drop_user_storage_fk_stmt;
DEALLOCATE PREPARE drop_user_storage_fk_stmt;

SET @has_sample_storage_column = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'SampleDetails'
      AND COLUMN_NAME = 'StorageLocation'
);
SET @drop_sample_storage_column_sql = IF(
    @has_sample_storage_column > 0,
    'ALTER TABLE `SampleDetails` DROP COLUMN `StorageLocation`',
    'SELECT 1'
);
PREPARE drop_sample_storage_column_stmt FROM @drop_sample_storage_column_sql;
EXECUTE drop_sample_storage_column_stmt;
DEALLOCATE PREPARE drop_sample_storage_column_stmt;

SET @has_user_storage_column = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'sample_storage_location'
);
SET @drop_user_storage_column_sql = IF(
    @has_user_storage_column > 0,
    'ALTER TABLE `users` DROP COLUMN `sample_storage_location`',
    'SELECT 1'
);
PREPARE drop_user_storage_column_stmt FROM @drop_user_storage_column_sql;
EXECUTE drop_user_storage_column_stmt;
DEALLOCATE PREPARE drop_user_storage_column_stmt;

SET @has_legacy_storage_column = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sample_data'
      AND COLUMN_NAME = 'storage_location'
);
SET @drop_legacy_storage_column_sql = IF(
    @has_legacy_storage_column > 0,
    'ALTER TABLE `sample_data` DROP COLUMN `storage_location`',
    'SELECT 1'
);
PREPARE drop_legacy_storage_column_stmt FROM @drop_legacy_storage_column_sql;
EXECUTE drop_legacy_storage_column_stmt;
DEALLOCATE PREPARE drop_legacy_storage_column_stmt;

DROP TABLE IF EXISTS `StorageLoc_Ref`;
