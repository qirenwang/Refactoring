-- Reference-table display order: make it data instead of an accident.
--
-- Every drop-down / percentage list on the data-entry form is rendered from
-- GET /api/references in the order the query returns. Until now that order was
-- whatever column each query happened to sort by: Purpose_Ref by Purpose_Name
-- (alphabetical, so "Other" and "Other durable goods ..." landed in the middle
-- of the Purposes list), PolymerType_Ref by Polymer_Code (alphabetical, so
-- "Other polymer type" sat between LDPE and PA), everything else by the
-- auto-increment ID (which only looked right because "Other" happened to be
-- the last row entered).
--
-- This migration adds an explicit SortOrder column to the ten reference tables
-- served by /api/references and back-fills it:
--
--   * regular options count up in tens (10, 20, 30, ...) so a new option can
--     be slotted in later without renumbering (e.g. 35 goes between 30 and 40);
--   * catch-all options are pinned high: "Other ..." = 900, "Unknown" = 990,
--     so anything added later with a normal value stays ahead of them;
--   * only rows still at the DEFAULT 0 are touched, so re-running the migration
--     is a no-op and never overwrites an order somebody adjusted by hand;
--   * Purpose_Ref follows the PI's Microplastic_sampling_datasheet_v3 order
--     (Products one time -> Products multiple times -> Other durable goods ->
--     Bag -> Packing -> Other -> Unknown), PolymerType_Ref follows recycle
--     codes 1-6 then the datasheet's additional polymers with Other last, and
--     the remaining tables keep their current (ID) order.
--
-- To reorder later: UPDATE <table> SET SortOrder = <n> WHERE <code> = '...';
-- no code change needed. A brand-new row that is left at SortOrder = 0 shows
-- up FIRST in its list on purpose — a visible reminder to give it a value.
--
-- Deployment order:
--   1. Back up the database (node scripts/backup-database.js).
--   2. Run this migration FIRST: node scripts/update-database.js db/20260817_add_reference_sort_order.sql
--      (harmless to the old code: it SELECTs * and orders by name/ID).
--   3. Then deploy routes/api.js, whose /api/references and /api/ref/* queries
--      ORDER BY SortOrder. Deploying it before the migration makes those
--      endpoints fail with "Unknown column 'SortOrder'" until the migration runs.

-- Pre-flight: which reference tables already carry the column (expect none on
-- the first run).
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND COLUMN_NAME = 'SortOrder'
  AND TABLE_NAME IN ('PolymerType_Ref', 'Purpose_Ref', 'ColorType_Ref', 'Form_Ref',
                     'Methods_Ref', 'Opacity_Ref', 'SoilTexture_Ref', 'Units_Ref',
                     'SizeClass_Ref', 'PubSource_Ref')
ORDER BY TABLE_NAME;

-- ---------------------------------------------------------------------------
-- Step 1: add SortOrder to each table (idempotent, one guarded ALTER per table).
-- ---------------------------------------------------------------------------

-- Purpose_Ref
SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Purpose_Ref' AND COLUMN_NAME = 'SortOrder');
SET @sql = IF(@has_col = 0,
    'ALTER TABLE `Purpose_Ref` ADD COLUMN `SortOrder` INT NOT NULL DEFAULT 0
         COMMENT ''Display order in form lists (ascending); catch-alls 900 (Other) / 990 (Unknown)''
         AFTER `PurposeUniqueID`',
    'SELECT ''Purpose_Ref.SortOrder already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- PolymerType_Ref
SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PolymerType_Ref' AND COLUMN_NAME = 'SortOrder');
SET @sql = IF(@has_col = 0,
    'ALTER TABLE `PolymerType_Ref` ADD COLUMN `SortOrder` INT NOT NULL DEFAULT 0
         COMMENT ''Display order in form lists (ascending); catch-alls 900 (Other) / 990 (Unknown)''
         AFTER `PolymerUniqueID`',
    'SELECT ''PolymerType_Ref.SortOrder already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ColorType_Ref
SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ColorType_Ref' AND COLUMN_NAME = 'SortOrder');
SET @sql = IF(@has_col = 0,
    'ALTER TABLE `ColorType_Ref` ADD COLUMN `SortOrder` INT NOT NULL DEFAULT 0
         COMMENT ''Display order in form lists (ascending); catch-alls 900 (Other) / 990 (Unknown)''
         AFTER `ColorUniqueID`',
    'SELECT ''ColorType_Ref.SortOrder already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Form_Ref
SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Form_Ref' AND COLUMN_NAME = 'SortOrder');
SET @sql = IF(@has_col = 0,
    'ALTER TABLE `Form_Ref` ADD COLUMN `SortOrder` INT NOT NULL DEFAULT 0
         COMMENT ''Display order in form lists (ascending); catch-alls 900 (Other) / 990 (Unknown)''
         AFTER `FormUniqueID`',
    'SELECT ''Form_Ref.SortOrder already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Methods_Ref
SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Methods_Ref' AND COLUMN_NAME = 'SortOrder');
SET @sql = IF(@has_col = 0,
    'ALTER TABLE `Methods_Ref` ADD COLUMN `SortOrder` INT NOT NULL DEFAULT 0
         COMMENT ''Display order in form lists (ascending); catch-alls 900 (Other) / 990 (Unknown)''
         AFTER `MethodsUniqueID`',
    'SELECT ''Methods_Ref.SortOrder already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Opacity_Ref
SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Opacity_Ref' AND COLUMN_NAME = 'SortOrder');
SET @sql = IF(@has_col = 0,
    'ALTER TABLE `Opacity_Ref` ADD COLUMN `SortOrder` INT NOT NULL DEFAULT 0
         COMMENT ''Display order in form lists (ascending); catch-alls 900 (Other) / 990 (Unknown)''
         AFTER `OpacityUniqueID`',
    'SELECT ''Opacity_Ref.SortOrder already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- SoilTexture_Ref
SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SoilTexture_Ref' AND COLUMN_NAME = 'SortOrder');
SET @sql = IF(@has_col = 0,
    'ALTER TABLE `SoilTexture_Ref` ADD COLUMN `SortOrder` INT NOT NULL DEFAULT 0
         COMMENT ''Display order in form lists (ascending); catch-alls 900 (Other) / 990 (Unknown)''
         AFTER `SoilTextureUniqueID`',
    'SELECT ''SoilTexture_Ref.SortOrder already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Units_Ref
SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Units_Ref' AND COLUMN_NAME = 'SortOrder');
SET @sql = IF(@has_col = 0,
    'ALTER TABLE `Units_Ref` ADD COLUMN `SortOrder` INT NOT NULL DEFAULT 0
         COMMENT ''Display order in form lists (ascending); catch-alls 900 (Other) / 990 (Unknown)''
         AFTER `UnitsUniqueID`',
    'SELECT ''Units_Ref.SortOrder already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- SizeClass_Ref
SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SizeClass_Ref' AND COLUMN_NAME = 'SortOrder');
SET @sql = IF(@has_col = 0,
    'ALTER TABLE `SizeClass_Ref` ADD COLUMN `SortOrder` INT NOT NULL DEFAULT 0
         COMMENT ''Display order in form lists (ascending); catch-alls 900 (Other) / 990 (Unknown)''
         AFTER `SizeUniqueID`',
    'SELECT ''SizeClass_Ref.SortOrder already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- PubSource_Ref
SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PubSource_Ref' AND COLUMN_NAME = 'SortOrder');
SET @sql = IF(@has_col = 0,
    'ALTER TABLE `PubSource_Ref` ADD COLUMN `SortOrder` INT NOT NULL DEFAULT 0
         COMMENT ''Display order in form lists (ascending); catch-alls 900 (Other) / 990 (Unknown)''
         AFTER `PubSourceUniqueID`',
    'SELECT ''PubSource_Ref.SortOrder already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Step 2: back-fill. Only rows still at 0 are assigned, so this never
-- overwrites an order that was set by hand and re-runs are no-ops.
-- ---------------------------------------------------------------------------

-- Purpose_Ref: the PI's datasheet order (Purpose column of
-- Microplastic_sampling_datasheet_v3.xlsx), Other then Unknown last.
UPDATE `Purpose_Ref`
SET `SortOrder` = CASE `Purpose_Code`
    WHEN 'single_use'       THEN 10   -- Products for consuming Food/Beverages one time
    WHEN 'multi_use'        THEN 20   -- Products for consuming or storing Food/Beverages multiple times
    WHEN 'consumer_product' THEN 30   -- Other durable goods for longer term use
    WHEN 'bag_container'    THEN 40   -- Bag for carrying or containing items
    WHEN 'packing'          THEN 50   -- Packing or wrapping materials
    WHEN 'other_purpose'    THEN 900  -- Other
    WHEN 'unknown_purpose'  THEN 990  -- Unknown purpose
    ELSE `PurposeUniqueID` * 10       -- any code not listed above keeps its ID order
END
WHERE `SortOrder` = 0;

-- PolymerType_Ref: resin identification codes 1-6 first, then the datasheet's
-- additional polymers, "Other polymer type" last.
UPDATE `PolymerType_Ref`
SET `SortOrder` = CASE `Polymer_Code`
    WHEN 'PETE'    THEN 10    -- recycle code 1
    WHEN 'HDPE'    THEN 20    -- recycle code 2
    WHEN 'PVC'     THEN 30    -- recycle code 3
    WHEN 'LDPE'    THEN 40    -- recycle code 4
    WHEN 'PP'      THEN 50    -- recycle code 5
    WHEN 'PS'      THEN 60    -- recycle code 6
    WHEN 'PA'      THEN 70
    WHEN 'PC'      THEN 80
    WHEN 'PLA'     THEN 90
    WHEN 'ABS'     THEN 100
    WHEN 'EVA'     THEN 110
    WHEN 'PB'      THEN 120
    WHEN 'PE_UHMW' THEN 130
    WHEN 'PMMA'    THEN 140
    WHEN 'HIPS'    THEN 150
    WHEN 'EPS'     THEN 160
    WHEN 'PAN'     THEN 170
    WHEN 'Rubber'  THEN 180
    WHEN 'Bitumen' THEN 190
    WHEN 'Other'   THEN 900   -- Other polymer type
    ELSE `PolymerUniqueID` * 10
END
WHERE `SortOrder` = 0;

-- Remaining tables: keep the current ID order, pin the catch-all row(s) high.
UPDATE `ColorType_Ref`
SET `SortOrder` = CASE
    WHEN LOWER(`Color_Code`) IN ('other_mixed', 'other') THEN 900   -- Other or mixed colors
    ELSE `ColorUniqueID` * 10
END
WHERE `SortOrder` = 0;

UPDATE `Form_Ref`
SET `SortOrder` = CASE
    WHEN LOWER(`Form_Name`) IN ('other_mixed', 'other') THEN 900
    ELSE `FormUniqueID` * 10
END
WHERE `SortOrder` = 0;

UPDATE `Methods_Ref`
SET `SortOrder` = CASE
    WHEN LOWER(`Method_Code`) LIKE 'other%' THEN 900   -- Other_PolyType, Other_Count (last within their MethodType)
    ELSE `MethodsUniqueID` * 10
END
WHERE `SortOrder` = 0;

UPDATE `Opacity_Ref`
SET `SortOrder` = CASE
    WHEN LOWER(`Opacity_Code`) IN ('other_mixed', 'other') THEN 900   -- Other or mixed opacities
    ELSE `OpacityUniqueID` * 10
END
WHERE `SortOrder` = 0;

UPDATE `PubSource_Ref`
SET `SortOrder` = CASE
    WHEN LOWER(`PubSourceLabel`) = 'other' THEN 900
    ELSE `PubSourceUniqueID` * 10
END
WHERE `SortOrder` = 0;

-- No catch-all rows in these three; ID order is the intended order
-- (soil textures coarse -> fine, size classes ascending, units as entered).
UPDATE `SoilTexture_Ref` SET `SortOrder` = `SoilTextureUniqueID` * 10 WHERE `SortOrder` = 0;
UPDATE `SizeClass_Ref`   SET `SortOrder` = `SizeUniqueID` * 10        WHERE `SortOrder` = 0;
UPDATE `Units_Ref`       SET `SortOrder` = `UnitsUniqueID` * 10       WHERE `SortOrder` = 0;

-- ---------------------------------------------------------------------------
-- Post-migration check: expect ten SortOrder columns, no row left at 0, and
-- the two lists that visibly change shown in their new order.
-- ---------------------------------------------------------------------------
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND COLUMN_NAME = 'SortOrder'
  AND TABLE_NAME IN ('PolymerType_Ref', 'Purpose_Ref', 'ColorType_Ref', 'Form_Ref',
                     'Methods_Ref', 'Opacity_Ref', 'SoilTexture_Ref', 'Units_Ref',
                     'SizeClass_Ref', 'PubSource_Ref')
ORDER BY TABLE_NAME;

SELECT 'Purpose_Ref' AS tbl,     COUNT(*) AS rows_still_at_zero FROM `Purpose_Ref`     WHERE `SortOrder` = 0
UNION ALL SELECT 'PolymerType_Ref', COUNT(*) FROM `PolymerType_Ref` WHERE `SortOrder` = 0
UNION ALL SELECT 'ColorType_Ref',   COUNT(*) FROM `ColorType_Ref`   WHERE `SortOrder` = 0
UNION ALL SELECT 'Form_Ref',        COUNT(*) FROM `Form_Ref`        WHERE `SortOrder` = 0
UNION ALL SELECT 'Methods_Ref',     COUNT(*) FROM `Methods_Ref`     WHERE `SortOrder` = 0
UNION ALL SELECT 'Opacity_Ref',     COUNT(*) FROM `Opacity_Ref`     WHERE `SortOrder` = 0
UNION ALL SELECT 'SoilTexture_Ref', COUNT(*) FROM `SoilTexture_Ref` WHERE `SortOrder` = 0
UNION ALL SELECT 'Units_Ref',       COUNT(*) FROM `Units_Ref`       WHERE `SortOrder` = 0
UNION ALL SELECT 'SizeClass_Ref',   COUNT(*) FROM `SizeClass_Ref`   WHERE `SortOrder` = 0
UNION ALL SELECT 'PubSource_Ref',   COUNT(*) FROM `PubSource_Ref`   WHERE `SortOrder` = 0;

SELECT `SortOrder`, `PurposeUniqueID`, `Purpose_Code`, `Purpose_Name`
FROM `Purpose_Ref`
ORDER BY `SortOrder`, `PurposeUniqueID`;

SELECT `SortOrder`, `PolymerUniqueID`, `Polymer_Code`, `Polymer_FullName`
FROM `PolymerType_Ref`
ORDER BY `SortOrder`, `PolymerUniqueID`;
