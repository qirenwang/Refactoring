-- Unify user-entered sample measurements at DECIMAL(12,6): up to 12 digits
-- with 0.000001 resolution, the convention already used by SurfaceAreaSampled
-- and the SampleAmount columns. Requested because values such as a water flow
-- velocity of 0.001 m/s were rounded away by the previous DECIMAL(10,2)
-- columns (and air temperature by DECIMAL(10,0)).
--
-- Deployment order:
--   1. Back up the database.
--   2. Run the pre-flight checks below; both must return no rows.
--   3. Run this migration.
--   4. Deploy the application code that loosens the form input steps
--      (views/data_forms/formpage2.ejs, views/data_forms/formpage4.ejs).
--
-- Existing values are widened without change. Note that DECIMAL(12,6) allows
-- at most 6 integer digits (999999.999999), fewer than the old DECIMAL(10,2)
-- columns allowed; the pre-flight checks list any rows that would not fit.

-- Pre-flight check 1: sample detail values too large for DECIMAL(12,6).
SELECT SampleUniqueID, VolumeSampled, WaterDepth, SampleWaterDepth,
       FlowVelocity, SuspendedSolids, Conductivity, Turbidity, DissolvedOxygen,
       SamplingDepth, SoilDryWeight
FROM SampleDetails
WHERE GREATEST(
        COALESCE(VolumeSampled, 0), COALESCE(WaterDepth, 0),
        COALESCE(SampleWaterDepth, 0), COALESCE(FlowVelocity, 0),
        COALESCE(SuspendedSolids, 0), COALESCE(Conductivity, 0),
        COALESCE(Turbidity, 0), COALESCE(DissolvedOxygen, 0),
        COALESCE(SamplingDepth, 0), COALESCE(SoilDryWeight, 0)
      ) > 999999.999999;

-- Pre-flight check 2: sampling event weather values too large for DECIMAL(12,6).
SELECT SamplingEventUniqueID, AirTemp_C, Rainfall_cm_Precedent24
FROM SamplingEvent
WHERE ABS(COALESCE(AirTemp_C, 0)) > 999999.999999
   OR COALESCE(Rainfall_cm_Precedent24, 0) > 999999.999999;

ALTER TABLE `SampleDetails`
    MODIFY COLUMN `SoilMoisture_Percent` DECIMAL(12,6) NULL DEFAULT NULL
        COMMENT 'Estimated soil moisture percentage',
    MODIFY COLUMN `VolumeSampled` DECIMAL(12,6) NULL DEFAULT NULL
        COMMENT 'Volume sampled in liters',
    MODIFY COLUMN `WaterDepth` DECIMAL(12,6) NULL DEFAULT NULL
        COMMENT 'Total water depth at sample location in meters',
    MODIFY COLUMN `SampleWaterDepth` DECIMAL(12,6) NULL DEFAULT NULL
        COMMENT 'Water depth where sample is collected (m)',
    MODIFY COLUMN `FlowVelocity` DECIMAL(12,6) NULL DEFAULT NULL
        COMMENT 'Water flow velocity',
    MODIFY COLUMN `SuspendedSolids` DECIMAL(12,6) NULL DEFAULT NULL
        COMMENT 'Total suspended solids mg/L',
    MODIFY COLUMN `Conductivity` DECIMAL(12,6) NULL DEFAULT NULL
        COMMENT 'Conductivity uS/cm',
    MODIFY COLUMN `Turbidity` DECIMAL(12,6) NULL DEFAULT NULL
        COMMENT 'Turbidity in NTU',
    MODIFY COLUMN `DissolvedOxygen` DECIMAL(12,6) NULL DEFAULT NULL
        COMMENT 'Dissolved oxygen in mg/L',
    MODIFY COLUMN `SamplingDepth` DECIMAL(12,6) NULL DEFAULT NULL
        COMMENT 'Depth of soil sample collection in meters',
    MODIFY COLUMN `SoilDryWeight` DECIMAL(12,6) NULL DEFAULT NULL
        COMMENT 'Soil dry weight in grams',
    MODIFY COLUMN `SoilOrganicMatter` DECIMAL(12,6) NULL DEFAULT NULL
        COMMENT 'Soil organic matter percentage',
    MODIFY COLUMN `SoilSand` DECIMAL(12,6) NULL DEFAULT NULL
        COMMENT 'Soil sand percentage',
    MODIFY COLUMN `SoilSilt` DECIMAL(12,6) NULL DEFAULT NULL
        COMMENT 'Soil silt percentage',
    MODIFY COLUMN `SoilClay` DECIMAL(12,6) NULL DEFAULT NULL
        COMMENT 'Soil clay percentage',
    MODIFY COLUMN `PermeableSurfaces` DECIMAL(12,6) NULL DEFAULT NULL
        COMMENT 'Percentage of permeable surfaces',
    MODIFY COLUMN `ImpermeableSurfaces` DECIMAL(12,6) NULL DEFAULT NULL
        COMMENT 'Percentage of impermeable surfaces';

ALTER TABLE `SamplingEvent`
    MODIFY COLUMN `AirTemp_C` DECIMAL(12,6) NULL DEFAULT NULL
        COMMENT 'Current air temperature in Celsius',
    MODIFY COLUMN `Rainfall_cm_Precedent24` DECIMAL(12,6) NULL DEFAULT NULL
        COMMENT 'Rainfall amount in past 24 hours, in centimeters';

-- Post-migration schema check. Every row should report decimal type with
-- precision 12 and scale 6.
SELECT
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE,
    NUMERIC_PRECISION,
    NUMERIC_SCALE,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
      (TABLE_NAME = 'SampleDetails' AND COLUMN_NAME IN (
          'SoilMoisture_Percent', 'VolumeSampled', 'WaterDepth',
          'SampleWaterDepth', 'FlowVelocity', 'SuspendedSolids', 'Conductivity',
          'Turbidity', 'DissolvedOxygen', 'SamplingDepth', 'SoilDryWeight',
          'SoilOrganicMatter', 'SoilSand', 'SoilSilt', 'SoilClay',
          'PermeableSurfaces', 'ImpermeableSurfaces'
      ))
      OR (TABLE_NAME = 'SamplingEvent' AND COLUMN_NAME IN (
          'AirTemp_C', 'Rainfall_cm_Precedent24'
      ))
  )
ORDER BY TABLE_NAME, COLUMN_NAME;
