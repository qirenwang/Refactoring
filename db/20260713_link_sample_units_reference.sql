-- Normalize SampleDetails unit codes to Units_Ref foreign keys.

SET @has_sample_unit_num = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SampleDetails' AND COLUMN_NAME = 'SampleUnit_Num'
);
SET @sql = IF(
    @has_sample_unit_num = 0,
    'ALTER TABLE `SampleDetails` ADD COLUMN `SampleUnit_Num` int(11) DEFAULT NULL AFTER `TotalSampleAmount`',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_micro_unit_num = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SampleDetails' AND COLUMN_NAME = 'MicroplasticsSampleUnit_Num'
);
SET @sql = IF(
    @has_micro_unit_num = 0,
    'ALTER TABLE `SampleDetails` ADD COLUMN `MicroplasticsSampleUnit_Num` int(11) DEFAULT NULL AFTER `MicroplasticsSampleAmount`',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fragment_unit_num = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SampleDetails' AND COLUMN_NAME = 'FragmentsSampleUnit_Num'
);
SET @sql = IF(
    @has_fragment_unit_num = 0,
    'ALTER TABLE `SampleDetails` ADD COLUMN `FragmentsSampleUnit_Num` int(11) DEFAULT NULL AFTER `FragmentsSampleAmount`',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_packaging_unit_num = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SampleDetails' AND COLUMN_NAME = 'PackagingSampleUnit_Num'
);
SET @sql = IF(
    @has_packaging_unit_num = 0,
    'ALTER TABLE `SampleDetails` ADD COLUMN `PackagingSampleUnit_Num` int(11) DEFAULT NULL AFTER `PackagingSampleAmount`',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @legacy_unit_column_count = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'SampleDetails'
      AND COLUMN_NAME IN (
          'SampleUnit', 'MicroplasticsSampleUnit',
          'FragmentsSampleUnit', 'PackagingSampleUnit'
      )
);

SET @backfill_units_sql = IF(
    @legacy_unit_column_count = 4,
    'UPDATE `SampleDetails` sd
     LEFT JOIN `Units_Ref` sampleUnit
       ON sampleUnit.`Units_Code` = sd.`SampleUnit`
      AND sampleUnit.`Units_Type` = ''Sample_Quantity''
     LEFT JOIN `Units_Ref` microUnit
       ON microUnit.`Units_Code` = sd.`MicroplasticsSampleUnit`
      AND microUnit.`Units_Type` = ''Sample_Quantity''
     LEFT JOIN `Units_Ref` fragmentUnit
       ON fragmentUnit.`Units_Code` = sd.`FragmentsSampleUnit`
      AND fragmentUnit.`Units_Type` = ''Sample_Quantity''
     LEFT JOIN `Units_Ref` packagingUnit
       ON packagingUnit.`Units_Code` = sd.`PackagingSampleUnit`
      AND packagingUnit.`Units_Type` = ''Sample_Quantity''
     SET sd.`SampleUnit_Num` = sampleUnit.`UnitsUniqueID`,
         sd.`MicroplasticsSampleUnit_Num` = microUnit.`UnitsUniqueID`,
         sd.`FragmentsSampleUnit_Num` = fragmentUnit.`UnitsUniqueID`,
         sd.`PackagingSampleUnit_Num` = packagingUnit.`UnitsUniqueID`',
    'SELECT 1'
);
PREPARE backfill_units_stmt FROM @backfill_units_sql;
EXECUTE backfill_units_stmt;
DEALLOCATE PREPARE backfill_units_stmt;

SET @find_unmatched_units_sql = IF(
    @legacy_unit_column_count = 4,
    'SELECT COUNT(*) INTO @unmatched_unit_count
     FROM `SampleDetails` sd
     WHERE (sd.`SampleUnit` IS NOT NULL AND sd.`SampleUnit_Num` IS NULL)
        OR (sd.`MicroplasticsSampleUnit` IS NOT NULL AND sd.`MicroplasticsSampleUnit_Num` IS NULL)
        OR (sd.`FragmentsSampleUnit` IS NOT NULL AND sd.`FragmentsSampleUnit_Num` IS NULL)
        OR (sd.`PackagingSampleUnit` IS NOT NULL AND sd.`PackagingSampleUnit_Num` IS NULL)',
    'SET @unmatched_unit_count = 0'
);
PREPARE find_unmatched_units_stmt FROM @find_unmatched_units_sql;
EXECUTE find_unmatched_units_stmt;
DEALLOCATE PREPARE find_unmatched_units_stmt;

SET @assert_units_sql = IF(
    @unmatched_unit_count = 0,
    'SELECT 1',
    'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Unit migration stopped: unmatched SampleDetails unit code'''
);
PREPARE assert_units_stmt FROM @assert_units_sql;
EXECUTE assert_units_stmt;
DEALLOCATE PREPARE assert_units_stmt;

SET @has_legacy_sample_unit = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SampleDetails' AND COLUMN_NAME = 'SampleUnit'
);
SET @sql = IF(@has_legacy_sample_unit > 0, 'ALTER TABLE `SampleDetails` DROP COLUMN `SampleUnit`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_legacy_micro_unit = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SampleDetails' AND COLUMN_NAME = 'MicroplasticsSampleUnit'
);
SET @sql = IF(@has_legacy_micro_unit > 0, 'ALTER TABLE `SampleDetails` DROP COLUMN `MicroplasticsSampleUnit`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_legacy_fragment_unit = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SampleDetails' AND COLUMN_NAME = 'FragmentsSampleUnit'
);
SET @sql = IF(@has_legacy_fragment_unit > 0, 'ALTER TABLE `SampleDetails` DROP COLUMN `FragmentsSampleUnit`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_legacy_packaging_unit = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SampleDetails' AND COLUMN_NAME = 'PackagingSampleUnit'
);
SET @sql = IF(@has_legacy_packaging_unit > 0, 'ALTER TABLE `SampleDetails` DROP COLUMN `PackagingSampleUnit`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_sample_unit_fk = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SampleDetails'
      AND COLUMN_NAME = 'SampleUnit_Num' AND REFERENCED_TABLE_NAME = 'Units_Ref'
);
SET @sql = IF(
    @has_sample_unit_fk = 0,
    'ALTER TABLE `SampleDetails` ADD CONSTRAINT `FK_Sample_Unit` FOREIGN KEY (`SampleUnit_Num`) REFERENCES `Units_Ref` (`UnitsUniqueID`) ON DELETE RESTRICT ON UPDATE CASCADE',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_micro_unit_fk = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SampleDetails'
      AND COLUMN_NAME = 'MicroplasticsSampleUnit_Num' AND REFERENCED_TABLE_NAME = 'Units_Ref'
);
SET @sql = IF(
    @has_micro_unit_fk = 0,
    'ALTER TABLE `SampleDetails` ADD CONSTRAINT `FK_Sample_MicroUnit` FOREIGN KEY (`MicroplasticsSampleUnit_Num`) REFERENCES `Units_Ref` (`UnitsUniqueID`) ON DELETE RESTRICT ON UPDATE CASCADE',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_fragment_unit_fk = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SampleDetails'
      AND COLUMN_NAME = 'FragmentsSampleUnit_Num' AND REFERENCED_TABLE_NAME = 'Units_Ref'
);
SET @sql = IF(
    @has_fragment_unit_fk = 0,
    'ALTER TABLE `SampleDetails` ADD CONSTRAINT `FK_Sample_FragmentUnit` FOREIGN KEY (`FragmentsSampleUnit_Num`) REFERENCES `Units_Ref` (`UnitsUniqueID`) ON DELETE RESTRICT ON UPDATE CASCADE',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_packaging_unit_fk = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SampleDetails'
      AND COLUMN_NAME = 'PackagingSampleUnit_Num' AND REFERENCED_TABLE_NAME = 'Units_Ref'
);
SET @sql = IF(
    @has_packaging_unit_fk = 0,
    'ALTER TABLE `SampleDetails` ADD CONSTRAINT `FK_Sample_PackagingUnit` FOREIGN KEY (`PackagingSampleUnit_Num`) REFERENCES `Units_Ref` (`UnitsUniqueID`) ON DELETE RESTRICT ON UPDATE CASCADE',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
