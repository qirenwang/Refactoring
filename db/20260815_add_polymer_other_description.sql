-- "Other" polymer type: give users a place to say WHAT the other polymer is.
--
-- The polymer percentage lists on the data-entry form include the reference
-- polymer PolymerType_Ref.Polymer_Code = 'Other'. Its label used to say
-- "(specify in method)", but the method fields are drop-downs, so there was
-- nowhere to write the description. The form now shows a text box directly
-- under the Other percentage; this migration stores that text next to the
-- percentage it describes:
--
--   1. adds PolymerOther_Desc VARCHAR(255) NULL to MicroplasticsPolymerDetails
--      and FragmentsPolymerDetails (populated only on the Other row),
--   2. renames the reference label from "Other (specify in method)" to
--      "Other polymer type".
--
-- Deployment order (this migration is safe in either order; the old code
-- ignores the new column):
--   1. Back up the database (node scripts/backup-database.js).
--   2. Run this migration: node scripts/update-database.js db/20260815_add_polymer_other_description.sql
--   3. Deploy the application code (routes/api.js, public/js/form-handler.js,
--      public/css/mp_style.css, views/data_forms/formpage5.ejs).
--   4. Then run db/20260815_merge_fragment_purpose_counts.sql (that one must
--      come AFTER the code deploy — see its header).
--
-- If the code is deployed before this migration, a save that includes an
-- Other description fails with a clear "run the migration" error instead of
-- dropping the text; description-less saves keep working. Re-running the
-- migration is a no-op.

-- Pre-flight: current state.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('MicroplasticsPolymerDetails', 'FragmentsPolymerDetails')
  AND COLUMN_NAME = 'PolymerOther_Desc';

SELECT PolymerUniqueID, Polymer_Code, Polymer_FullName
FROM `PolymerType_Ref`
WHERE `Polymer_Code` = 'Other';

-- Step 1a: MicroplasticsPolymerDetails.PolymerOther_Desc (idempotent).
SET @has_micro_other_desc = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'MicroplasticsPolymerDetails'
      AND COLUMN_NAME = 'PolymerOther_Desc'
);
SET @add_micro_other_desc_sql = IF(
    @has_micro_other_desc = 0,
    'ALTER TABLE `MicroplasticsPolymerDetails`
       ADD COLUMN `PolymerOther_Desc` VARCHAR(255) NULL DEFAULT NULL
           COMMENT ''Free-text description of the polymer(s) when PolymerID_Num is the Other reference polymer; NULL on every other row''
       AFTER `Percentage`',
    'SELECT ''MicroplasticsPolymerDetails.PolymerOther_Desc already exists'' AS notice'
);
PREPARE add_micro_other_desc_stmt FROM @add_micro_other_desc_sql;
EXECUTE add_micro_other_desc_stmt;
DEALLOCATE PREPARE add_micro_other_desc_stmt;

-- Step 1b: FragmentsPolymerDetails.PolymerOther_Desc (idempotent).
SET @has_frag_other_desc = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FragmentsPolymerDetails'
      AND COLUMN_NAME = 'PolymerOther_Desc'
);
SET @add_frag_other_desc_sql = IF(
    @has_frag_other_desc = 0,
    'ALTER TABLE `FragmentsPolymerDetails`
       ADD COLUMN `PolymerOther_Desc` VARCHAR(255) NULL DEFAULT NULL
           COMMENT ''Free-text description of the polymer(s) when PolymerID_Num is the Other reference polymer; NULL on every other row''
       AFTER `Percentage`',
    'SELECT ''FragmentsPolymerDetails.PolymerOther_Desc already exists'' AS notice'
);
PREPARE add_frag_other_desc_stmt FROM @add_frag_other_desc_sql;
EXECUTE add_frag_other_desc_stmt;
DEALLOCATE PREPARE add_frag_other_desc_stmt;

-- Step 2: reference label. The form renders this name; the description box
-- underneath now replaces the old "(specify in method)" instruction.
UPDATE `PolymerType_Ref`
SET `Polymer_FullName` = 'Other polymer type'
WHERE `Polymer_Code` = 'Other'
  AND `Polymer_FullName` = 'Other (specify in method)';

-- Post-migration check: expect two PolymerOther_Desc rows and the new label.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('MicroplasticsPolymerDetails', 'FragmentsPolymerDetails')
  AND COLUMN_NAME = 'PolymerOther_Desc';

SELECT PolymerUniqueID, Polymer_Code, Polymer_FullName
FROM `PolymerType_Ref`
WHERE `Polymer_Code` = 'Other';
