-- Landscape classification is no longer collected by the application.
-- Preserve the media distinction for any terrestrial-soil rows that used
-- LandscapeType as the legacy discriminator.

SET @has_landscape_type = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'SampleDetails'
      AND COLUMN_NAME = 'LandscapeType'
);

SET @has_media_sub_type = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'SampleDetails'
      AND COLUMN_NAME = 'MediaSubType'
);

SET @preserve_terrestrial_soil_sql = IF(
    @has_landscape_type > 0 AND @has_media_sub_type > 0,
    'UPDATE `SampleDetails`
     SET `MediaSubType` = ''terrestrial_soil''
     WHERE `MediaType_SelectID` = 2
       AND `LandscapeType` IS NOT NULL
       AND (`MediaSubType` IS NULL OR `MediaSubType` = '''')',
    'SELECT 1'
);
PREPARE preserve_terrestrial_soil_stmt FROM @preserve_terrestrial_soil_sql;
EXECUTE preserve_terrestrial_soil_stmt;
DEALLOCATE PREPARE preserve_terrestrial_soil_stmt;

SET @drop_landscape_type_sql = IF(
    @has_landscape_type > 0,
    'ALTER TABLE `SampleDetails` DROP COLUMN `LandscapeType`',
    'SELECT 1'
);
PREPARE drop_landscape_type_stmt FROM @drop_landscape_type_sql;
EXECUTE drop_landscape_type_stmt;
DEALLOCATE PREPARE drop_landscape_type_stmt;
