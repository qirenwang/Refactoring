-- Extend signup data while keeping every new profile field optional.
-- Existing users are intentionally not backfilled.

CREATE TABLE IF NOT EXISTS `OrganizationType_Ref` (
  `OrganizationTypeUniqueID` int(11) NOT NULL,
  `OrganizationType` varchar(150) NOT NULL,
  PRIMARY KEY (`OrganizationTypeUniqueID`),
  UNIQUE KEY `Unique_OrganizationType` (`OrganizationType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `OrganizationType_Ref` (`OrganizationTypeUniqueID`, `OrganizationType`) VALUES
(1, 'Academic K–12 Education'),
(2, 'Academic Higher Education'),
(3, 'Research Institute / Independent Research Organization'),
(4, 'Industry / Private Sector Consulting / Professional Services'),
(5, 'Utility / Infrastructure Organization'),
(6, 'Government (Federal, State, Local, Tribal)'),
(7, 'Nonprofit Organization / NGO'),
(8, 'Professional Association / Society'),
(9, 'Foundation / Philanthropic Organization'),
(10, 'Community Organization'),
(11, 'International Organization'),
(12, 'Other (please specify)')
ON DUPLICATE KEY UPDATE `OrganizationType` = VALUES(`OrganizationType`);

CREATE TABLE IF NOT EXISTS `Country_Ref` (
  `CountryUniqueID` int(11) NOT NULL,
  `Country` varchar(100) NOT NULL,
  PRIMARY KEY (`CountryUniqueID`),
  UNIQUE KEY `Unique_Country` (`Country`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `Country_Ref` (`CountryUniqueID`, `Country`) VALUES
(1, 'United States of America')
ON DUPLICATE KEY UPDATE `Country` = VALUES(`Country`);

CREATE TABLE IF NOT EXISTS `State_Ref` (
  `StateUniqueID` int(11) NOT NULL,
  `State` varchar(50) NOT NULL,
  `Country_Num` int(11) NOT NULL,
  PRIMARY KEY (`StateUniqueID`),
  UNIQUE KEY `Unique_State_Country` (`Country_Num`, `State`),
  CONSTRAINT `FK_State_Country`
    FOREIGN KEY (`Country_Num`) REFERENCES `Country_Ref` (`CountryUniqueID`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `State_Ref` (`StateUniqueID`, `State`, `Country_Num`) VALUES
(1, 'Alabama', 1),
(2, 'Alaska', 1),
(3, 'Arizona', 1),
(4, 'Arkansas', 1),
(5, 'California', 1),
(6, 'Colorado', 1),
(7, 'Connecticut', 1),
(8, 'Delaware', 1),
(9, 'District of Columbia', 1),
(10, 'Florida', 1),
(11, 'Georgia', 1),
(12, 'Hawaii', 1),
(13, 'Idaho', 1),
(14, 'Illinois', 1),
(15, 'Indiana', 1),
(16, 'Iowa', 1),
(17, 'Kansas', 1),
(18, 'Kentucky', 1),
(19, 'Louisiana', 1),
(20, 'Maine', 1),
(21, 'Maryland', 1),
(22, 'Massachusetts', 1),
(23, 'Michigan', 1),
(24, 'Minnesota', 1),
(25, 'Mississippi', 1),
(26, 'Missouri', 1),
(27, 'Montana', 1),
(28, 'Nebraska', 1),
(29, 'Nevada', 1),
(30, 'New Hampshire', 1),
(31, 'New Jersey', 1),
(32, 'New Mexico', 1),
(33, 'New York', 1),
(34, 'North Carolina', 1),
(35, 'North Dakota', 1),
(36, 'Ohio', 1),
(37, 'Oklahoma', 1),
(38, 'Oregon', 1),
(39, 'Pennsylvania', 1),
(40, 'Rhode Island', 1),
(41, 'South Carolina', 1),
(42, 'South Dakota', 1),
(43, 'Tennessee', 1),
(44, 'Texas', 1),
(45, 'Utah', 1),
(46, 'Vermont', 1),
(47, 'Virginia', 1),
(48, 'Washington', 1),
(49, 'West Virginia', 1),
(50, 'Wisconsin', 1),
(51, 'Wyoming', 1)
ON DUPLICATE KEY UPDATE
  `State` = VALUES(`State`),
  `Country_Num` = VALUES(`Country_Num`);

SET @has_organization_type_num = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'OrganizationType_Num'
);
SET @sql = IF(
  @has_organization_type_num = 0,
  'ALTER TABLE `users` ADD COLUMN `OrganizationType_Num` int(11) DEFAULT NULL AFTER `organization`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_organization_type_other = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'OrganizationTypeOther'
);
SET @sql = IF(
  @has_organization_type_other = 0,
  'ALTER TABLE `users` ADD COLUMN `OrganizationTypeOther` varchar(255) DEFAULT NULL AFTER `OrganizationType_Num`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_job_title = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'job_title'
);
SET @sql = IF(
  @has_job_title = 0,
  'ALTER TABLE `users` ADD COLUMN `job_title` varchar(100) DEFAULT NULL AFTER `OrganizationTypeOther`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_country_num = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'Country_Num'
);
SET @sql = IF(
  @has_country_num = 0,
  'ALTER TABLE `users` ADD COLUMN `Country_Num` int(11) DEFAULT NULL AFTER `job_title`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_state_num = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'State_Num'
);
SET @sql = IF(
  @has_state_num = 0,
  'ALTER TABLE `users` ADD COLUMN `State_Num` int(11) DEFAULT NULL AFTER `Country_Num`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_user_organization_type_fk = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'OrganizationType_Num'
    AND REFERENCED_TABLE_NAME = 'OrganizationType_Ref'
);
SET @sql = IF(
  @has_user_organization_type_fk = 0,
  'ALTER TABLE `users` ADD CONSTRAINT `FK_User_OrganizationType` FOREIGN KEY (`OrganizationType_Num`) REFERENCES `OrganizationType_Ref` (`OrganizationTypeUniqueID`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_user_country_fk = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'Country_Num'
    AND REFERENCED_TABLE_NAME = 'Country_Ref'
);
SET @sql = IF(
  @has_user_country_fk = 0,
  'ALTER TABLE `users` ADD CONSTRAINT `FK_User_Country` FOREIGN KEY (`Country_Num`) REFERENCES `Country_Ref` (`CountryUniqueID`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_user_state_fk = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'State_Num'
    AND REFERENCED_TABLE_NAME = 'State_Ref'
);
SET @sql = IF(
  @has_user_state_fk = 0,
  'ALTER TABLE `users` ADD CONSTRAINT `FK_User_State` FOREIGN KEY (`State_Num`) REFERENCES `State_Ref` (`StateUniqueID`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
