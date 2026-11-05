-- Polymer reference table v2: the PI's 25-row polymer list (Comments-20261103).
--
-- PolymerType_Ref drives both polymer-percentage lists on form page 5
-- (microplastics and fragments) through GET /api/references; each row becomes
-- an input named <prefix><normalized Polymer_Code>, e.g. mp_polymer_pet.
-- This migration replaces the 20-row list (PETE, HDPE, ..., Rubber, Bitumen,
-- Other) with the PI's 25 rows in the PI's display order:
--
--   * three new columns hold the rest of the PI's table:
--       Polymer_AltCodes    the PI's alternate abbreviations (PETE, PE-HD,
--                           PE-LD, PUR, MULTI); Polymer_Code stays one clean
--                           token because form field names are derived from it
--       CommonApplications  "Common Applications or Sources"
--       ClassificationNotes "Classification Notes"
--   * the 15 rows that continue are updated IN PLACE, matched by their old or
--     new Polymer_Code, so their PolymerUniqueID — the FK target of
--     FragmentsPolymerDetails / MicroplasticsPolymerDetails .PolymerID_Num —
--     never changes. Only PETE -> PET changes a form field name
--     (mp_polymer_pete -> mp_polymer_pet); Rubber/Bitumen/Other only change
--     case, which the field-name normalization ignores, so the Other-polymer
--     description box (db/20260815_add_polymer_other_description.sql) keeps
--     working unchanged;
--   * the per-sample code snapshot PolymerType_Legacy = 'PETE' on
--     Microplastics/FragmentsPolymerDetails rows that point at the PET row is
--     rewritten to 'PET' (the edit-sample loader rejects a snapshot that
--     disagrees with its reference code, so samples containing PETE would
--     otherwise no longer open for editing);
--   * the 10 new rows (CA, PBT, PE, PTFE, PU, SAN, MIX, UNKNOWN, RTB, OSM) are
--     inserted with the repo's manual ID convention (MAX(PolymerUniqueID) + 1,
--     as nextTableId() does), each guarded by its code;
--   * SortOrder = the PI's No. x 10 (10 .. 250). The PI's order deliberately
--     overrides the "Other = 900" convention of
--     db/20260817_add_reference_sort_order.sql: Other Polymer is No. 20 (200);
--   * RecycleCode stays 1-6 on PET..PS and is NULL everywhere else (the Other
--     row's former 7 included);
--   * the five old options the PI dropped (PLA, PB, PE_UHMW, HIPS, EPS) are
--     DELETED only when no FragmentsPolymerDetails / MicroplasticsPolymerDetails
--     row references them. A still-referenced row is KEPT (deleting it would
--     orphan sample data and the FK forbids it anyway), moved behind the PI's
--     25 (SortOrder 1010-1050), recategorised as 'Plastic polymer' and marked
--     as a legacy option in ClassificationNotes. It stays selectable on the
--     form until its samples are re-classified and this migration is re-run
--     (or the row is deleted by hand). As of the 2026-08-18 backup all five are
--     still referenced by surviving events 197-200.
--
-- Safe to re-run:
--   * each ALTER is guarded by an INFORMATION_SCHEMA check;
--   * the in-place UPDATEs only touch rows whose CommonApplications is still
--     NULL (i.e. not migrated yet), so a re-run never overwrites a value that
--     was adjusted by hand afterwards (e.g. a SortOrder tweak);
--   * each INSERT is skipped when its Polymer_Code already exists;
--   * the guarded DELETE is a no-op once nothing qualifies, and the legacy-row
--     UPDATE only touches rows whose ClassificationNotes is still NULL.
--
-- Deployment order:
--   1. Back up the database (node scripts/backup-database.js).
--   2. Run this migration: node scripts/update-database.js db/20261105_polymer_table_v2.sql
--      The application reads the polymer list (SELECT *) at request time, so
--      the new list appears on the form immediately; no restart is needed.
--   3. Deploy public/js/data-summary-utils.js, public/js/form-handler.js and
--      routes/api.js from the same commit (label polish, tooltips and the CSV
--      template header). The old files work with the new rows too; they only
--      label a few rows less neatly ("RUBBER - Rubber").
--   Note: a form draft started BEFORE the migration that still holds a PETE
--   percentage posts mp_polymer_pete / fragment_polymer_pete, which the API
--   rejects after the migration (400 "Unknown polymer percentage field(s)").
--   The user re-enters that value on page 5 as PET. Saved samples keep
--   PolymerID_Num 1, which is now PET (and their PETE snapshot becomes PET,
--   see Step 2b).
--
-- scripts/update-database.js does not print SELECT results; run the pre-flight
-- and post-check SELECTs by hand to see them.

-- Pre-flight: the current list and how often each row is referenced.
SELECT p.`PolymerUniqueID`, p.`SortOrder`, p.`Polymer_Code`, p.`Polymer_FullName`,
       (SELECT COUNT(*) FROM `FragmentsPolymerDetails` f WHERE f.`PolymerID_Num` = p.`PolymerUniqueID`) AS frag_refs,
       (SELECT COUNT(*) FROM `MicroplasticsPolymerDetails` m WHERE m.`PolymerID_Num` = p.`PolymerUniqueID`) AS micro_refs
FROM `PolymerType_Ref` p
ORDER BY p.`SortOrder`, p.`PolymerUniqueID`;

-- ---------------------------------------------------------------------------
-- Step 1: new columns (idempotent, one guarded ALTER each).
-- ---------------------------------------------------------------------------

SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PolymerType_Ref' AND COLUMN_NAME = 'Polymer_AltCodes');
SET @sql = IF(@has_col = 0,
    'ALTER TABLE `PolymerType_Ref` ADD COLUMN `Polymer_AltCodes` VARCHAR(100) NULL DEFAULT NULL
         COMMENT ''Alternate abbreviations from the PI list (e.g. PETE, PE-HD, PUR, MULTI); display/search only, never a form field name''
         AFTER `Polymer_Code`',
    'SELECT ''PolymerType_Ref.Polymer_AltCodes already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PolymerType_Ref' AND COLUMN_NAME = 'CommonApplications');
SET @sql = IF(@has_col = 0,
    'ALTER TABLE `PolymerType_Ref` ADD COLUMN `CommonApplications` VARCHAR(255) NULL DEFAULT NULL
         COMMENT ''Common applications or sources (PI list)''
         AFTER `Category`',
    'SELECT ''PolymerType_Ref.CommonApplications already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PolymerType_Ref' AND COLUMN_NAME = 'ClassificationNotes');
SET @sql = IF(@has_col = 0,
    'ALTER TABLE `PolymerType_Ref` ADD COLUMN `ClassificationNotes` VARCHAR(500) NULL DEFAULT NULL
         COMMENT ''Classification notes / when to use this option (PI list)''
         AFTER `CommonApplications`',
    'SELECT ''PolymerType_Ref.ClassificationNotes already exists'' AS notice');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Step 2: the 15 continuing rows, updated in place (PolymerUniqueID kept).
-- Matched by old OR new code; only rows not migrated yet
-- (CommonApplications IS NULL) are touched.
-- ---------------------------------------------------------------------------

-- No. 1 (ID 1): PETE -> PET
UPDATE `PolymerType_Ref`
SET `Polymer_Code` = 'PET', `Polymer_AltCodes` = 'PETE', `SortOrder` = 10,
    `Polymer_FullName` = 'Polyethylene terephthalate', `RecycleCode` = 1, `Category` = 'Plastic polymer',
    `CommonApplications` = 'Beverage bottles, food packaging, synthetic textiles',
    `ClassificationNotes` = 'Common thermoplastic polyester'
WHERE `Polymer_Code` IN ('PETE', 'PET') AND `CommonApplications` IS NULL;

-- No. 2 (ID 2)
UPDATE `PolymerType_Ref`
SET `Polymer_Code` = 'HDPE', `Polymer_AltCodes` = 'PE-HD', `SortOrder` = 20,
    `Polymer_FullName` = 'High-density polyethylene', `RecycleCode` = 2, `Category` = 'Plastic polymer',
    `CommonApplications` = 'Milk jugs, detergent bottles, pipes',
    `ClassificationNotes` = 'High-density polyethylene'
WHERE `Polymer_Code` = 'HDPE' AND `CommonApplications` IS NULL;

-- No. 3 (ID 3)
UPDATE `PolymerType_Ref`
SET `Polymer_Code` = 'PVC', `Polymer_AltCodes` = NULL, `SortOrder` = 30,
    `Polymer_FullName` = 'Polyvinyl chloride', `RecycleCode` = 3, `Category` = 'Plastic polymer',
    `CommonApplications` = 'Water pipes, flooring, cable insulation',
    `ClassificationNotes` = 'Chlorine-containing thermoplastic'
WHERE `Polymer_Code` = 'PVC' AND `CommonApplications` IS NULL;

-- No. 4 (ID 4)
UPDATE `PolymerType_Ref`
SET `Polymer_Code` = 'LDPE', `Polymer_AltCodes` = 'PE-LD', `SortOrder` = 40,
    `Polymer_FullName` = 'Low-density polyethylene', `RecycleCode` = 4, `Category` = 'Plastic polymer',
    `CommonApplications` = 'Plastic bags, films, flexible packaging',
    `ClassificationNotes` = 'Low-density polyethylene'
WHERE `Polymer_Code` = 'LDPE' AND `CommonApplications` IS NULL;

-- No. 5 (ID 5)
UPDATE `PolymerType_Ref`
SET `Polymer_Code` = 'PP', `Polymer_AltCodes` = NULL, `SortOrder` = 50,
    `Polymer_FullName` = 'Polypropylene', `RecycleCode` = 5, `Category` = 'Plastic polymer',
    `CommonApplications` = 'Food containers, bottle caps, textiles',
    `ClassificationNotes` = 'Polyolefin'
WHERE `Polymer_Code` = 'PP' AND `CommonApplications` IS NULL;

-- No. 6 (ID 6)
UPDATE `PolymerType_Ref`
SET `Polymer_Code` = 'PS', `Polymer_AltCodes` = NULL, `SortOrder` = 60,
    `Polymer_FullName` = 'Polystyrene', `RecycleCode` = 6, `Category` = 'Plastic polymer',
    `CommonApplications` = 'Disposable cups, rigid packaging, foam products',
    `ClassificationNotes` = 'Includes expanded polystyrene (EPS)'
WHERE `Polymer_Code` = 'PS' AND `CommonApplications` IS NULL;

-- No. 7 (ID 10)
UPDATE `PolymerType_Ref`
SET `Polymer_Code` = 'ABS', `Polymer_AltCodes` = NULL, `SortOrder` = 70,
    `Polymer_FullName` = 'Acrylonitrile butadiene styrene', `RecycleCode` = NULL, `Category` = 'Plastic polymer',
    `CommonApplications` = 'Electronics, automotive parts, toys',
    `ClassificationNotes` = 'Engineering thermoplastic'
WHERE `Polymer_Code` = 'ABS' AND `CommonApplications` IS NULL;

-- No. 9 (ID 11)
UPDATE `PolymerType_Ref`
SET `Polymer_Code` = 'EVA', `Polymer_AltCodes` = NULL, `SortOrder` = 90,
    `Polymer_FullName` = 'Ethylene-vinyl acetate', `RecycleCode` = NULL, `Category` = 'Plastic polymer',
    `CommonApplications` = 'Footwear, foam products, flexible films',
    `ClassificationNotes` = 'Ethylene copolymer'
WHERE `Polymer_Code` = 'EVA' AND `CommonApplications` IS NULL;

-- No. 10 (ID 17)
UPDATE `PolymerType_Ref`
SET `Polymer_Code` = 'PAN', `Polymer_AltCodes` = NULL, `SortOrder` = 100,
    `Polymer_FullName` = 'Polyacrylonitrile', `RecycleCode` = NULL, `Category` = 'Plastic polymer',
    `CommonApplications` = 'Acrylic fibers, industrial materials',
    `ClassificationNotes` = 'Synthetic polymer and carbon-fiber precursor'
WHERE `Polymer_Code` = 'PAN' AND `CommonApplications` IS NULL;

-- No. 11 (ID 7)
UPDATE `PolymerType_Ref`
SET `Polymer_Code` = 'PA', `Polymer_AltCodes` = NULL, `SortOrder` = 110,
    `Polymer_FullName` = 'Polyamide (nylon)', `RecycleCode` = NULL, `Category` = 'Plastic polymer',
    `CommonApplications` = 'Textiles, fishing nets, ropes',
    `ClassificationNotes` = 'Includes multiple nylon types'
WHERE `Polymer_Code` = 'PA' AND `CommonApplications` IS NULL;

-- No. 13 (ID 8)
UPDATE `PolymerType_Ref`
SET `Polymer_Code` = 'PC', `Polymer_AltCodes` = NULL, `SortOrder` = 130,
    `Polymer_FullName` = 'Polycarbonate', `RecycleCode` = NULL, `Category` = 'Plastic polymer',
    `CommonApplications` = 'Electronics, protective glazing, reusable products',
    `ClassificationNotes` = 'Engineering thermoplastic'
WHERE `Polymer_Code` = 'PC' AND `CommonApplications` IS NULL;

-- No. 15 (ID 14)
UPDATE `PolymerType_Ref`
SET `Polymer_Code` = 'PMMA', `Polymer_AltCodes` = NULL, `SortOrder` = 150,
    `Polymer_FullName` = 'Polymethyl methacrylate', `RecycleCode` = NULL, `Category` = 'Plastic polymer',
    `CommonApplications` = 'Acrylic panels, lenses, signs',
    `ClassificationNotes` = 'Acrylic thermoplastic'
WHERE `Polymer_Code` = 'PMMA' AND `CommonApplications` IS NULL;

-- No. 20 (ID 20): Other -> OTHER (field name mp_polymer_other is unchanged)
UPDATE `PolymerType_Ref`
SET `Polymer_Code` = 'OTHER', `Polymer_AltCodes` = NULL, `SortOrder` = 200,
    `Polymer_FullName` = 'Other Polymer', `RecycleCode` = NULL, `Category` = 'Polymer classification — other',
    `CommonApplications` = 'Identified polymers not listed in the reference table',
    `ClassificationNotes` = 'Use when a specific polymer is identified but absent from the reference list'
WHERE `Polymer_Code` = 'OTHER' AND `CommonApplications` IS NULL;

-- No. 22 (ID 19): Bitumen -> BITUMEN
UPDATE `PolymerType_Ref`
SET `Polymer_Code` = 'BITUMEN', `Polymer_AltCodes` = NULL, `SortOrder` = 220,
    `Polymer_FullName` = 'Bituminous Material / Bitumen', `RecycleCode` = NULL, `Category` = 'Bituminous material',
    `CommonApplications` = 'Asphalt roads, roofing materials, pavement wear',
    `ClassificationNotes` = 'Complex hydrocarbon-based material; not a conventional plastic polymer'
WHERE `Polymer_Code` = 'BITUMEN' AND `CommonApplications` IS NULL;

-- No. 23 (ID 18): Rubber -> RUBBER
UPDATE `PolymerType_Ref`
SET `Polymer_Code` = 'RUBBER', `Polymer_AltCodes` = NULL, `SortOrder` = 230,
    `Polymer_FullName` = 'Rubber', `RecycleCode` = NULL, `Category` = 'Rubber material',
    `CommonApplications` = 'Rubber products, vehicle components, industrial materials',
    `ClassificationNotes` = 'May include natural or synthetic rubber'
WHERE `Polymer_Code` = 'RUBBER' AND `CommonApplications` IS NULL;

-- (Polymer_Code uses a case-insensitive collation, so 'OTHER' / 'BITUMEN' /
-- 'RUBBER' above also match the old 'Other' / 'Bitumen' / 'Rubber'.)

-- Step 2b: keep the per-sample code snapshot in step with the rename.
-- <Microplastics|Fragments>PolymerDetails.PolymerType_Legacy stores the code
-- the row was saved under, and the edit-sample loader
-- (loadPolymerFieldsForForm in routes/api.js) refuses a row whose snapshot and
-- reference code normalize differently. Without this, every saved sample that
-- contains PETE would fail to open for editing ("reference and legacy codes
-- disagree"). Only rows that point at the PET reference row are touched; the
-- case-only renames (Rubber/Bitumen/Other) normalize identically and need no
-- change. Idempotent: nothing is left to match on a re-run.
UPDATE `MicroplasticsPolymerDetails` d
JOIN `PolymerType_Ref` p ON p.`PolymerUniqueID` = d.`PolymerID_Num`
SET d.`PolymerType_Legacy` = 'PET'
WHERE p.`Polymer_Code` = 'PET' AND d.`PolymerType_Legacy` = 'PETE';

UPDATE `FragmentsPolymerDetails` d
JOIN `PolymerType_Ref` p ON p.`PolymerUniqueID` = d.`PolymerID_Num`
SET d.`PolymerType_Legacy` = 'PET'
WHERE p.`Polymer_Code` = 'PET' AND d.`PolymerType_Legacy` = 'PETE';

-- ---------------------------------------------------------------------------
-- Step 3: the 10 new rows. Manual ID = MAX + 1 (as nextTableId() does);
-- each INSERT is skipped when its code already exists.
-- ---------------------------------------------------------------------------

-- No. 8
SET @next_id = (SELECT COALESCE(MAX(`PolymerUniqueID`), 0) + 1 FROM `PolymerType_Ref`);
INSERT INTO `PolymerType_Ref`
    (`PolymerUniqueID`, `SortOrder`, `Polymer_Code`, `Polymer_AltCodes`, `Polymer_FullName`, `RecycleCode`,
     `Category`, `CommonApplications`, `ClassificationNotes`)
SELECT @next_id, 80, 'CA', NULL, 'Cellulose acetate', NULL,
       'Plastic polymer', 'Cigarette filters, films, textile fibers', 'Cellulose-derived polymer'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `PolymerType_Ref` WHERE `Polymer_Code` = 'CA');

-- No. 12
SET @next_id = (SELECT COALESCE(MAX(`PolymerUniqueID`), 0) + 1 FROM `PolymerType_Ref`);
INSERT INTO `PolymerType_Ref`
    (`PolymerUniqueID`, `SortOrder`, `Polymer_Code`, `Polymer_AltCodes`, `Polymer_FullName`, `RecycleCode`,
     `Category`, `CommonApplications`, `ClassificationNotes`)
SELECT @next_id, 120, 'PBT', NULL, 'Polybutylene terephthalate', NULL,
       'Plastic polymer', 'Electrical components, automotive parts', 'Engineering polyester'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `PolymerType_Ref` WHERE `Polymer_Code` = 'PBT');

-- No. 14
SET @next_id = (SELECT COALESCE(MAX(`PolymerUniqueID`), 0) + 1 FROM `PolymerType_Ref`);
INSERT INTO `PolymerType_Ref`
    (`PolymerUniqueID`, `SortOrder`, `Polymer_Code`, `Polymer_AltCodes`, `Polymer_FullName`, `RecycleCode`,
     `Category`, `CommonApplications`, `ClassificationNotes`)
SELECT @next_id, 140, 'PE', NULL, 'Polyethylene (general category)', NULL,
       'Plastic polymer', 'Packaging, containers, films, pipes',
       'Use when the specific PE density grade is not reported'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `PolymerType_Ref` WHERE `Polymer_Code` = 'PE');

-- No. 16
SET @next_id = (SELECT COALESCE(MAX(`PolymerUniqueID`), 0) + 1 FROM `PolymerType_Ref`);
INSERT INTO `PolymerType_Ref`
    (`PolymerUniqueID`, `SortOrder`, `Polymer_Code`, `Polymer_AltCodes`, `Polymer_FullName`, `RecycleCode`,
     `Category`, `CommonApplications`, `ClassificationNotes`)
SELECT @next_id, 160, 'PTFE', NULL, 'Polytetrafluoroethylene', NULL,
       'Plastic polymer', 'Nonstick coatings, seals, industrial components', 'Fluoropolymer'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `PolymerType_Ref` WHERE `Polymer_Code` = 'PTFE');

-- No. 17
SET @next_id = (SELECT COALESCE(MAX(`PolymerUniqueID`), 0) + 1 FROM `PolymerType_Ref`);
INSERT INTO `PolymerType_Ref`
    (`PolymerUniqueID`, `SortOrder`, `Polymer_Code`, `Polymer_AltCodes`, `Polymer_FullName`, `RecycleCode`,
     `Category`, `CommonApplications`, `ClassificationNotes`)
SELECT @next_id, 170, 'PU', 'PUR', 'Polyurethane', NULL,
       'Plastic polymer', 'Foams, coatings, insulation, synthetic leather', 'Can be flexible or rigid'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `PolymerType_Ref` WHERE `Polymer_Code` = 'PU');

-- No. 18
SET @next_id = (SELECT COALESCE(MAX(`PolymerUniqueID`), 0) + 1 FROM `PolymerType_Ref`);
INSERT INTO `PolymerType_Ref`
    (`PolymerUniqueID`, `SortOrder`, `Polymer_Code`, `Polymer_AltCodes`, `Polymer_FullName`, `RecycleCode`,
     `Category`, `CommonApplications`, `ClassificationNotes`)
SELECT @next_id, 180, 'SAN', NULL, 'Styrene-acrylonitrile', NULL,
       'Plastic polymer', 'Household products, containers, appliances', 'Styrene copolymer'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `PolymerType_Ref` WHERE `Polymer_Code` = 'SAN');

-- No. 19
SET @next_id = (SELECT COALESCE(MAX(`PolymerUniqueID`), 0) + 1 FROM `PolymerType_Ref`);
INSERT INTO `PolymerType_Ref`
    (`PolymerUniqueID`, `SortOrder`, `Polymer_Code`, `Polymer_AltCodes`, `Polymer_FullName`, `RecycleCode`,
     `Category`, `CommonApplications`, `ClassificationNotes`)
SELECT @next_id, 190, 'MIX', 'MULTI', 'Mixed Polymer', NULL,
       'Polymer classification — mixed',
       'Multilayer packaging, composite plastics, particles containing multiple polymers',
       'Use when multiple polymer types are confirmed within a particle or composite material'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `PolymerType_Ref` WHERE `Polymer_Code` = 'MIX');

-- No. 21
SET @next_id = (SELECT COALESCE(MAX(`PolymerUniqueID`), 0) + 1 FROM `PolymerType_Ref`);
INSERT INTO `PolymerType_Ref`
    (`PolymerUniqueID`, `SortOrder`, `Polymer_Code`, `Polymer_AltCodes`, `Polymer_FullName`, `RecycleCode`,
     `Category`, `CommonApplications`, `ClassificationNotes`)
SELECT @next_id, 210, 'UNKNOWN', NULL, 'Unknown Polymer', NULL,
       'Polymer classification — unknown',
       'Particles whose polymer identity cannot be determined',
       'Other examination methods as plastics; Use when identification is inconclusive or unavailable'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `PolymerType_Ref` WHERE `Polymer_Code` = 'UNKNOWN');

-- No. 24
SET @next_id = (SELECT COALESCE(MAX(`PolymerUniqueID`), 0) + 1 FROM `PolymerType_Ref`);
INSERT INTO `PolymerType_Ref`
    (`PolymerUniqueID`, `SortOrder`, `Polymer_Code`, `Polymer_AltCodes`, `Polymer_FullName`, `RecycleCode`,
     `Category`, `CommonApplications`, `ClassificationNotes`)
SELECT @next_id, 240, 'RTB', NULL, 'Rubber/Tire/Bituminous (combined category)', NULL,
       'Mixed road-related material',
       'Road runoff, roadway dust, traffic-related particles',
       'Use when the source dataset groups these materials together or they cannot be reliably distinguished'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `PolymerType_Ref` WHERE `Polymer_Code` = 'RTB');

-- No. 25
SET @next_id = (SELECT COALESCE(MAX(`PolymerUniqueID`), 0) + 1 FROM `PolymerType_Ref`);
INSERT INTO `PolymerType_Ref`
    (`PolymerUniqueID`, `SortOrder`, `Polymer_Code`, `Polymer_AltCodes`, `Polymer_FullName`, `RecycleCode`,
     `Category`, `CommonApplications`, `ClassificationNotes`)
SELECT @next_id, 250, 'OSM', NULL, 'Other Synthetic Materials', NULL,
       'Other synthetic material',
       'Synthetic fibers, coatings, resins, adhesives, and manufactured materials not classified above',
       'Use for identified synthetic materials that do not fit the listed polymer or rubber categories; record the specific material when known'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `PolymerType_Ref` WHERE `Polymer_Code` = 'OSM');

-- ---------------------------------------------------------------------------
-- Step 4: the five options the PI dropped. Delete only what no sample uses.
-- ---------------------------------------------------------------------------

DELETE FROM `PolymerType_Ref`
WHERE `Polymer_Code` IN ('PLA', 'PB', 'PE_UHMW', 'HIPS', 'EPS')
  AND NOT EXISTS (SELECT 1 FROM `FragmentsPolymerDetails` f
                  WHERE f.`PolymerID_Num` = `PolymerType_Ref`.`PolymerUniqueID`)
  AND NOT EXISTS (SELECT 1 FROM `MicroplasticsPolymerDetails` m
                  WHERE m.`PolymerID_Num` = `PolymerType_Ref`.`PolymerUniqueID`);

-- Whatever is still here is referenced: keep it, behind the PI's 25, and say
-- why in ClassificationNotes (only on the first pass).
UPDATE `PolymerType_Ref`
SET `SortOrder` = CASE `Polymer_Code`
        WHEN 'PLA'     THEN 1010
        WHEN 'PB'      THEN 1020
        WHEN 'PE_UHMW' THEN 1030
        WHEN 'HIPS'    THEN 1040
        WHEN 'EPS'     THEN 1050
    END,
    `Category` = 'Plastic polymer',
    `ClassificationNotes` = 'Legacy option, not on the PI''s 2026-11 polymer list; kept only because existing samples reference it'
WHERE `Polymer_Code` IN ('PLA', 'PB', 'PE_UHMW', 'HIPS', 'EPS')
  AND `ClassificationNotes` IS NULL;

-- ---------------------------------------------------------------------------
-- Post-migration check: expect the PI's 25 rows at SortOrder 10..250 (IDs
-- 1-8, 10, 11, 14, 17-20 unchanged), plus any kept legacy rows at 1010+, and
-- no detail row pointing at a missing polymer.
-- ---------------------------------------------------------------------------
SELECT p.`SortOrder`, p.`PolymerUniqueID`, p.`Polymer_Code`, p.`Polymer_AltCodes`, p.`Polymer_FullName`,
       p.`RecycleCode`, p.`Category`,
       (SELECT COUNT(*) FROM `FragmentsPolymerDetails` f WHERE f.`PolymerID_Num` = p.`PolymerUniqueID`) AS frag_refs,
       (SELECT COUNT(*) FROM `MicroplasticsPolymerDetails` m WHERE m.`PolymerID_Num` = p.`PolymerUniqueID`) AS micro_refs
FROM `PolymerType_Ref` p
ORDER BY p.`SortOrder`, p.`PolymerUniqueID`;

SELECT (SELECT COUNT(*) FROM `MicroplasticsPolymerDetails` WHERE `PolymerType_Legacy` = 'PETE') +
       (SELECT COUNT(*) FROM `FragmentsPolymerDetails` WHERE `PolymerType_Legacy` = 'PETE') AS pete_snapshots_expect_0;

SELECT SUM(`SortOrder` BETWEEN 10 AND 250) AS pi_rows_expect_25,
       SUM(`SortOrder` > 1000)             AS kept_legacy_rows,
       COUNT(*)                            AS total_rows
FROM `PolymerType_Ref`;
