-- Allow small sampled-area values such as 0.0014 km2 without losing precision.
-- This script is safe to run repeatedly; each column is modified only if it exists.

SET @stmt = (
  SELECT IF(COUNT(*) > 0,
    'ALTER TABLE `SampleDetails` MODIFY COLUMN `SurfaceAreaSampled` DECIMAL(12,6) DEFAULT NULL COMMENT ''Area sampled in km2 for surface samples''',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'SampleDetails'
    AND COLUMN_NAME = 'SurfaceAreaSampled'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = (
  SELECT IF(COUNT(*) > 0,
    'ALTER TABLE `SampleDetails` MODIFY COLUMN `TotalSampleAmount` DECIMAL(12,6) DEFAULT NULL COMMENT ''Unified sample amount''',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'SampleDetails'
    AND COLUMN_NAME = 'TotalSampleAmount'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = (
  SELECT IF(COUNT(*) > 0,
    'ALTER TABLE `SampleDetails` MODIFY COLUMN `MicroplasticsSampleAmount` DECIMAL(12,6) DEFAULT NULL COMMENT ''Sample amount for microplastics''',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'SampleDetails'
    AND COLUMN_NAME = 'MicroplasticsSampleAmount'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = (
  SELECT IF(COUNT(*) > 0,
    'ALTER TABLE `SampleDetails` MODIFY COLUMN `FragmentsSampleAmount` DECIMAL(12,6) DEFAULT NULL COMMENT ''Sample amount for fragments''',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'SampleDetails'
    AND COLUMN_NAME = 'FragmentsSampleAmount'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = (
  SELECT IF(COUNT(*) > 0,
    'ALTER TABLE `SampleDetails` MODIFY COLUMN `PackagingSampleAmount` DECIMAL(12,6) DEFAULT NULL COMMENT ''Sample amount for packaging''',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'SampleDetails'
    AND COLUMN_NAME = 'PackagingSampleAmount'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
