-- Replace exact DATE storage with precision-preserving year/month/day components.
-- Target: MariaDB 10.3.
--
-- Existing rows are migrated mechanically:
--   * single collection events use SamplingDate as the start date;
--   * device-period events use DeviceStartDate and DeviceEndDate.
--
-- The legacy DATE columns are retained until the component backfill has passed
-- the NOT NULL and CHECK constraints. This keeps a failed migration recoverable.

ALTER TABLE `SamplingEvent`
  ADD COLUMN `StartYear` smallint unsigned DEFAULT NULL
    COMMENT 'Required collection/start year' AFTER `LocationID_Num`,
  ADD COLUMN `StartMonth` tinyint unsigned DEFAULT NULL
    COMMENT 'Optional collection/start month (1-12)' AFTER `StartYear`,
  ADD COLUMN `StartDay` tinyint unsigned DEFAULT NULL
    COMMENT 'Optional collection/start day' AFTER `StartMonth`,
  ADD COLUMN `EndYear` smallint unsigned DEFAULT NULL
    COMMENT 'Device-period end year; NULL for single collection events' AFTER `StartDay`,
  ADD COLUMN `EndMonth` tinyint unsigned DEFAULT NULL
    COMMENT 'Optional device-period end month (1-12)' AFTER `EndYear`,
  ADD COLUMN `EndDay` tinyint unsigned DEFAULT NULL
    COMMENT 'Optional device-period end day' AFTER `EndMonth`;

-- Treat legacy NULL mode values as the existing default single-event mode.
UPDATE `SamplingEvent`
SET `DeviceInstallationPeriod` = 'no'
WHERE `DeviceInstallationPeriod` IS NULL;

UPDATE `SamplingEvent`
SET
  `StartYear` = YEAR(
    CASE
      WHEN `DeviceInstallationPeriod` = 'yes' THEN `DeviceStartDate`
      ELSE `SamplingDate`
    END
  ),
  `StartMonth` = MONTH(
    CASE
      WHEN `DeviceInstallationPeriod` = 'yes' THEN `DeviceStartDate`
      ELSE `SamplingDate`
    END
  ),
  `StartDay` = DAY(
    CASE
      WHEN `DeviceInstallationPeriod` = 'yes' THEN `DeviceStartDate`
      ELSE `SamplingDate`
    END
  ),
  `EndYear` = CASE
    WHEN `DeviceInstallationPeriod` = 'yes' THEN YEAR(`DeviceEndDate`)
    ELSE NULL
  END,
  `EndMonth` = CASE
    WHEN `DeviceInstallationPeriod` = 'yes' THEN MONTH(`DeviceEndDate`)
    ELSE NULL
  END,
  `EndDay` = CASE
    WHEN `DeviceInstallationPeriod` = 'yes' THEN DAY(`DeviceEndDate`)
    ELSE NULL
  END;

-- Validate the backfill before dropping the legacy exact-date columns.
ALTER TABLE `SamplingEvent`
  MODIFY COLUMN `DeviceInstallationPeriod` enum('no','yes') NOT NULL DEFAULT 'no'
    COMMENT 'Whether sample came from a device installed for a period',
  MODIFY COLUMN `StartYear` smallint unsigned NOT NULL
    COMMENT 'Required collection/start year',
  ADD CONSTRAINT `chk_samplingevent_start_year_range`
    CHECK (`StartYear` BETWEEN 1000 AND 9999),
  ADD CONSTRAINT `chk_samplingevent_start_month_range`
    CHECK (`StartMonth` IS NULL OR `StartMonth` BETWEEN 1 AND 12),
  ADD CONSTRAINT `chk_samplingevent_start_day_hierarchy`
    CHECK (`StartDay` IS NULL OR `StartMonth` IS NOT NULL),
  ADD CONSTRAINT `chk_samplingevent_start_day_calendar`
    CHECK (
      `StartDay` IS NULL
      OR `StartDay` BETWEEN 1 AND
        CASE
          WHEN `StartMonth` = 2 THEN
            CASE
              WHEN MOD(`StartYear`, 400) = 0
                OR (MOD(`StartYear`, 4) = 0 AND MOD(`StartYear`, 100) <> 0)
              THEN 29
              ELSE 28
            END
          WHEN `StartMonth` IN (4, 6, 9, 11) THEN 30
          ELSE 31
        END
    ),
  ADD CONSTRAINT `chk_samplingevent_end_year_range`
    CHECK (`EndYear` IS NULL OR `EndYear` BETWEEN 1000 AND 9999),
  ADD CONSTRAINT `chk_samplingevent_end_month_hierarchy`
    CHECK (`EndMonth` IS NULL OR `EndYear` IS NOT NULL),
  ADD CONSTRAINT `chk_samplingevent_end_month_range`
    CHECK (`EndMonth` IS NULL OR `EndMonth` BETWEEN 1 AND 12),
  ADD CONSTRAINT `chk_samplingevent_end_day_hierarchy`
    CHECK (`EndDay` IS NULL OR (`EndYear` IS NOT NULL AND `EndMonth` IS NOT NULL)),
  ADD CONSTRAINT `chk_samplingevent_end_day_calendar`
    CHECK (
      `EndDay` IS NULL
      OR `EndDay` BETWEEN 1 AND
        CASE
          WHEN `EndMonth` = 2 THEN
            CASE
              WHEN MOD(`EndYear`, 400) = 0
                OR (MOD(`EndYear`, 4) = 0 AND MOD(`EndYear`, 100) <> 0)
              THEN 29
              ELSE 28
            END
          WHEN `EndMonth` IN (4, 6, 9, 11) THEN 30
          ELSE 31
        END
    ),
  ADD CONSTRAINT `chk_samplingevent_date_mode`
    CHECK (
      (
        `DeviceInstallationPeriod` = 'no'
        AND `EndYear` IS NULL
        AND `EndMonth` IS NULL
        AND `EndDay` IS NULL
      )
      OR (
        `DeviceInstallationPeriod` = 'yes'
        AND `EndYear` IS NOT NULL
      )
    ),
  ADD INDEX `idx_samplingevent_start_components`
    (`StartYear`, `StartMonth`, `StartDay`, `SamplingEventUniqueID`),
  ADD INDEX `idx_samplingevent_end_components` (`EndYear`, `EndMonth`, `EndDay`);

DROP INDEX IF EXISTS `idx_samplingevent_date` ON `SamplingEvent`;

ALTER TABLE `SamplingEvent`
  DROP COLUMN `SamplingDate`,
  DROP COLUMN `DeviceStartDate`,
  DROP COLUMN `DeviceEndDate`;
