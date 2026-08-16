-- Fragments (>5mm) and whole packaging are now entered as ONE count on the
-- data-entry form ("Fragments Count (greater than 5mm)"); item purposes are
-- described as percentages in FragmentsPurposes. FragmentsInSample therefore
-- no longer needs the PurposeKnown_Count (whole packaging) / PurposeUnknown_Count
-- (fragments) split. This migration:
--
--   1. adds FragmentsInSample.FragLargerThan5mm_Count (mirrors
--      SampleDetails.FragLargerThan5mm_Count and
--      MicroplasticsInSample.Micro5mmAndSmaller_Count),
--   2. backfills it with PurposeKnown_Count + PurposeUnknown_Count (falling
--      back to the SampleDetails aggregate when the split is empty),
--   3. verifies the backfill, and only then
--   4. drops the two Purpose*_Count columns.
--
-- Deployment order — CODE FIRST, then this migration (the reverse of the
-- usual order, because this migration DROPS columns the old code reads):
--   1. Back up the database (node scripts/backup-database.js).
--   2. Deploy the application code (routes/api.js, public/js/form-handler.js,
--      views/data_forms/formpage5.ejs, public/css/mp_style.css) and confirm
--      the container restarted.
--   3. Run this migration: node scripts/update-database.js db/20260815_merge_fragment_purpose_counts.sql
--
-- Why: the new code is schema-aware — before this migration it keeps writing
-- the merged count into PurposeUnknown_Count (and NULLs PurposeKnown_Count),
-- which step 3 folds into the new column, so nothing is lost. The OLD code,
-- however, still reads/writes PurposeKnown_Count/PurposeUnknown_Count; if the
-- migration ran while the old code was live, an edit-and-save in that window
-- would blank the fragments count. Re-running the migration is a no-op.
--
-- PurposeKnown_Mass / PurposeUnknown_Mass are not touched: the application has
-- never written them (all NULL); drop them separately if desired.

-- Pre-flight: current column inventory.
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'FragmentsInSample'
  AND COLUMN_NAME IN ('FragLargerThan5mm_Count', 'PurposeKnown_Count', 'PurposeUnknown_Count')
ORDER BY ORDINAL_POSITION;

SET @has_merged_count = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FragmentsInSample'
      AND COLUMN_NAME = 'FragLargerThan5mm_Count'
);

SET @has_purpose_split = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FragmentsInSample'
      AND COLUMN_NAME IN ('PurposeKnown_Count', 'PurposeUnknown_Count')
);

-- Step 1: add the merged column (idempotent).
SET @add_merged_count_sql = IF(
    @has_merged_count = 0,
    'ALTER TABLE `FragmentsInSample`
       ADD COLUMN `FragLargerThan5mm_Count` INT(11) NULL DEFAULT NULL
           COMMENT ''Count of items larger than 5mm in this sample (fragments and whole packaging together; purposes are recorded in FragmentsPurposes)''
       AFTER `Mass_Debris_Total`',
    'SELECT 1'
);
PREPARE add_merged_count_stmt FROM @add_merged_count_sql;
EXECUTE add_merged_count_stmt;
DEALLOCATE PREPARE add_merged_count_stmt;

-- Step 2a: backfill from the legacy known/unknown split.
SET @backfill_from_split_sql = IF(
    @has_purpose_split = 2,
    'UPDATE `FragmentsInSample`
     SET `FragLargerThan5mm_Count` = COALESCE(`PurposeKnown_Count`, 0) + COALESCE(`PurposeUnknown_Count`, 0)
     WHERE `FragLargerThan5mm_Count` IS NULL
       AND (`PurposeKnown_Count` IS NOT NULL OR `PurposeUnknown_Count` IS NOT NULL)',
    'SELECT 1'
);
PREPARE backfill_from_split_stmt FROM @backfill_from_split_sql;
EXECUTE backfill_from_split_stmt;
DEALLOCATE PREPARE backfill_from_split_stmt;

-- Step 2b: rows whose split was empty inherit the SampleDetails aggregate
-- (the same form field has always been written to both places).
UPDATE `FragmentsInSample` f
INNER JOIN `SampleDetails` sd ON sd.`SampleUniqueID` = f.`SampleDetails_Num`
SET f.`FragLargerThan5mm_Count` = sd.`FragLargerThan5mm_Count`
WHERE f.`FragLargerThan5mm_Count` IS NULL
  AND sd.`FragLargerThan5mm_Count` IS NOT NULL;

-- Step 3: verification. The mismatch count must be zero before the split is
-- dropped. (Prepared so that a re-run after the drop does not reference the
-- removed columns.)
SET @count_mismatch_sql = IF(
    @has_purpose_split = 2,
    'SELECT COUNT(*) INTO @split_mismatch_rows
     FROM `FragmentsInSample`
     WHERE (`PurposeKnown_Count` IS NOT NULL OR `PurposeUnknown_Count` IS NOT NULL)
       AND COALESCE(`FragLargerThan5mm_Count`, -1) <>
           COALESCE(`PurposeKnown_Count`, 0) + COALESCE(`PurposeUnknown_Count`, 0)',
    'SET @split_mismatch_rows = 0'
);
PREPARE count_mismatch_stmt FROM @count_mismatch_sql;
EXECUTE count_mismatch_stmt;
DEALLOCATE PREPARE count_mismatch_stmt;

SELECT @split_mismatch_rows AS split_mismatch_rows,
       (SELECT COUNT(*) FROM `FragmentsInSample`) AS fragment_rows,
       (SELECT COUNT(*) FROM `FragmentsInSample` WHERE `FragLargerThan5mm_Count` IS NOT NULL) AS rows_with_merged_count;

-- Step 4: drop the legacy split only when the backfill reproduced it exactly.
SET @drop_split_sql = IF(
    @has_purpose_split = 2 AND @split_mismatch_rows = 0,
    'ALTER TABLE `FragmentsInSample`
       DROP COLUMN `PurposeKnown_Count`,
       DROP COLUMN `PurposeUnknown_Count`',
    'SELECT ''Purpose*_Count columns left in place (already dropped, or backfill mismatch)'' AS notice'
);
PREPARE drop_split_stmt FROM @drop_split_sql;
EXECUTE drop_split_stmt;
DEALLOCATE PREPARE drop_split_stmt;

-- Post-migration schema check: expect exactly one row, FragLargerThan5mm_Count.
SELECT COLUMN_NAME, COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'FragmentsInSample'
  AND COLUMN_NAME IN ('FragLargerThan5mm_Count', 'PurposeKnown_Count', 'PurposeUnknown_Count')
ORDER BY ORDINAL_POSITION;
