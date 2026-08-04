-- Whole packaging and fragments are both represented as Fragment Debris.
-- Preserve the legacy package count in the aggregate debris count before
-- removing the redundant SampleDetails column.

SET @has_whole_pkg_count = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'SampleDetails'
      AND COLUMN_NAME = 'WholePkg_Count'
);

SET @has_fragment_debris_count = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'SampleDetails'
      AND COLUMN_NAME = 'FragLargerThan5mm_Count'
);

SET @has_fragment_purpose_counts = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FragmentsInSample'
      AND COLUMN_NAME IN ('PurposeKnown_Count', 'PurposeUnknown_Count')
);

-- Keep the known/unknown split in the normalized Fragment Debris record.
SET @backfill_existing_fragment_rows_sql = IF(
    @has_whole_pkg_count > 0 AND @has_fragment_purpose_counts = 2,
    'UPDATE `FragmentsInSample` f
     INNER JOIN `SampleDetails` sd ON sd.`SampleUniqueID` = f.`SampleDetails_Num`
     SET f.`PurposeKnown_Count` = IF(
             sd.`WholePkg_Count` IS NOT NULL AND COALESCE(f.`PurposeKnown_Count`, 0) = 0,
             sd.`WholePkg_Count`,
             f.`PurposeKnown_Count`
         ),
         f.`PurposeUnknown_Count` = IF(
             sd.`FragLargerThan5mm_Count` IS NOT NULL AND COALESCE(f.`PurposeUnknown_Count`, 0) = 0,
             sd.`FragLargerThan5mm_Count`,
             f.`PurposeUnknown_Count`
         )',
    'SELECT 1'
);
PREPARE backfill_existing_fragment_rows_stmt FROM @backfill_existing_fragment_rows_sql;
EXECUTE backfill_existing_fragment_rows_stmt;
DEALLOCATE PREPARE backfill_existing_fragment_rows_stmt;

SET @next_fragment_id = (SELECT COALESCE(MAX(`Fragment_UniqueID`), 0) FROM `FragmentsInSample`);
SET @insert_missing_fragment_rows_sql = IF(
    @has_whole_pkg_count > 0 AND @has_fragment_purpose_counts = 2,
    'INSERT INTO `FragmentsInSample` (
         `Fragment_UniqueID`, `SampleDetails_Num`,
         `PurposeKnown_Count`, `PurposeUnknown_Count`
     )
     SELECT
         (@next_fragment_id := @next_fragment_id + 1),
         sd.`SampleUniqueID`,
         sd.`WholePkg_Count`,
         sd.`FragLargerThan5mm_Count`
     FROM `SampleDetails` sd
     LEFT JOIN `FragmentsInSample` f ON f.`SampleDetails_Num` = sd.`SampleUniqueID`
     WHERE f.`Fragment_UniqueID` IS NULL
       AND (sd.`WholePkg_Count` IS NOT NULL OR sd.`FragLargerThan5mm_Count` IS NOT NULL)
     ORDER BY sd.`SampleUniqueID`',
    'SELECT 1'
);
PREPARE insert_missing_fragment_rows_stmt FROM @insert_missing_fragment_rows_sql;
EXECUTE insert_missing_fragment_rows_stmt;
DEALLOCATE PREPARE insert_missing_fragment_rows_stmt;

SET @merge_legacy_counts_sql = IF(
    @has_whole_pkg_count > 0 AND @has_fragment_debris_count > 0,
    'UPDATE `SampleDetails`
     SET `FragLargerThan5mm_Count` = COALESCE(`FragLargerThan5mm_Count`, 0) + `WholePkg_Count`
     WHERE `WholePkg_Count` IS NOT NULL',
    'SELECT 1'
);
PREPARE merge_legacy_counts_stmt FROM @merge_legacy_counts_sql;
EXECUTE merge_legacy_counts_stmt;
DEALLOCATE PREPARE merge_legacy_counts_stmt;

SET @drop_whole_pkg_count_sql = IF(
    @has_whole_pkg_count > 0,
    'ALTER TABLE `SampleDetails` DROP COLUMN `WholePkg_Count`',
    'SELECT 1'
);
PREPARE drop_whole_pkg_count_stmt FROM @drop_whole_pkg_count_sql;
EXECUTE drop_whole_pkg_count_stmt;
DEALLOCATE PREPARE drop_whole_pkg_count_stmt;
