-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Jun 05, 2025 at 11:35 PM
-- Server version: 10.3.39-MariaDB
-- PHP Version: 8.1.32

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `sweetl23_partner_demo`
--

-- --------------------------------------------------------

--
-- Table structure for table `FragmentsInSample`
--

CREATE TABLE `FragmentsInSample` (
  `Fragment_UniqueID` int(11) NOT NULL,
  `SampleDetails_Num` int(11) NOT NULL,
  `PercentColor_Clear` int(11) DEFAULT NULL,
  `PercentColor_Op-Color` int(11) DEFAULT NULL,
  `PercentColor_Op-Dk` int(11) DEFAULT NULL,
  `PercentColor_Mixed` int(11) DEFAULT NULL,
  `PercentForm_Fiber` int(11) DEFAULT NULL,
  `PercentForm_Pellet` int(11) DEFAULT NULL,
  `PercentForm_Film` int(11) DEFAULT NULL,
  `PercentForm_Foam` int(11) DEFAULT NULL,
  `PercentForm_HardPlastic` int(11) DEFAULT NULL,
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Location`
--

CREATE TABLE `Location` (
  `Loc_UniqueID` int(11) NOT NULL COMMENT 'Automatically generated unique location identifier to enter into SamplingEvent table based on drop-down menu selection',
  `UserLocID_txt` text DEFAULT NULL COMMENT 'User-defined short text and numbers to ID location, to be displayed in drop-down menu for location selection',
  `LocationName` text NOT NULL COMMENT 'Short user-defined name to ID location, to be displayed in drop-down menu for location selection',
  `Location_Desc` text NOT NULL COMMENT 'Longer user-defined location description, to be displayed in drop-down menu for location selection',
  `Env-Indoor_SelectID` int(11) NOT NULL COMMENT 'Use dropdown menu to identify whether location was in the environment or indoor (insert ID from LocTypeUniqueID)',
  `Lat-DecimalDegree` decimal(10,6) DEFAULT NULL,
  `Long-DecimalDegree` decimal(10,6) DEFAULT NULL,
  `Area-acres` decimal(10,0) DEFAULT NULL,
  `StreetAddress` text DEFAULT NULL COMMENT 'Enter street address-city-state-country-zip only if Lat/Long is not identified',
  `City` text DEFAULT NULL,
  `State` text DEFAULT NULL,
  `Country` text DEFAULT NULL,
  `ZipCode` int(11) DEFAULT NULL COMMENT 'Allow zipcode only for confidential data; not required if Lat/Long is entered',
  `LocationType-Environment` text DEFAULT NULL COMMENT 'TBD later; use for analysis (urban-rural; upstream-downstream)',
  `LocationType-Indoor` text DEFAULT NULL COMMENT 'TBD later; use for analysis (WWTP, recycling plant, drinking water utility)',
  `DateCreated` datetime NOT NULL DEFAULT current_timestamp(),
  `UserCreated` text NOT NULL COMMENT '	Automatically enter logged-in UserID who is entering this location information'
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `Location`
--

INSERT INTO `Location` (`Loc_UniqueID`, `UserLocID_txt`, `LocationName`, `Location_Desc`, `Env-Indoor_SelectID`, `Lat-DecimalDegree`, `Long-DecimalDegree`, `Area-acres`, `StreetAddress`, `City`, `State`, `Country`, `ZipCode`, `LocationType-Environment`, `LocationType-Indoor`, `DateCreated`, `UserCreated`) VALUES
(1, 'Pipe_Outlet_AllenCreek', 'Allen Creek Outlet', 'In pipe at outlet of Allen Creek to Huron River', 1, 42.289879, -83.746010, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-05-19 14:27:59', 'admin'),
(2, 'CB_1st_Ann', 'Catch-Basin First Street at Ann', 'Storm Drain on west side of 1st, south of Ann Street, Ann Arbor', 1, 42.282352, -83.750996, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-05-21 13:49:07', 'admin');

-- --------------------------------------------------------

--
-- Table structure for table `LocType_Env-Indoor_Ref`
--

CREATE TABLE `LocType_Env-Indoor_Ref` (
  `LocTypeUniqueID` int(11) NOT NULL,
  `LocType_Desc` text NOT NULL COMMENT 'Use this and other TBD fields in this table to drive location drop-down menus',
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `LocType_Env-Indoor_Ref`
--

INSERT INTO `LocType_Env-Indoor_Ref` (`LocTypeUniqueID`, `LocType_Desc`, `DateEntered`) VALUES
(1, 'Environmental (Outdoors)', '2025-05-19 13:19:28'),
(2, 'Indoors', '2025-05-19 13:19:42');

-- --------------------------------------------------------

--
-- Table structure for table `MediaType_WithinLitterWaterSoil_Ref`
--

CREATE TABLE `MediaType_WithinLitterWaterSoil_Ref` (
  `MediaTypeUniqueID` int(11) NOT NULL COMMENT 'Identifier to be inserted into SamplingEvent table upon selection of MediaType from dropdown',
  `MediaTypeOverall` text NOT NULL COMMENT 'Display in drop-down for selection of media type (In Water, In Soil/Sediment, On Soil, Mixed Media)',
  `MediaTypeDetail` text NOT NULL COMMENT 'Describe in greater detail, to be displayed to help in selection',
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `MediaType_WithinLitterWaterSoil_Ref`
--

INSERT INTO `MediaType_WithinLitterWaterSoil_Ref` (`MediaTypeUniqueID`, `MediaTypeOverall`, `MediaTypeDetail`, `DateEntered`) VALUES
(1, 'In Water', 'In a river or lake environment, or indoors from a water treatment process or faucet', '2025-05-19 14:47:57'),
(2, 'In Soil/Sediment', 'Environmentally embedded or buried in a soil sample, or indoors in sediments from treatment processes', '2025-05-19 14:53:54'),
(3, 'On Soil', 'Loose on the ground, either environmentally or indoors', '2025-05-19 14:53:54'),
(4, 'Mixed Media', 'A composite sample from multiple sources, or difficult to categorize source', '2025-05-19 14:53:54');

-- --------------------------------------------------------

--
-- Table structure for table `MicroplasticsInSample`
--

CREATE TABLE `MicroplasticsInSample` (
  `Micro_UniqueID` int(11) NOT NULL,
  `SampleDetails_Num` int(11) NOT NULL,
  `PercentSize_<1um` int(11) DEFAULT NULL,
  `PercentSize_1-20um` int(11) DEFAULT NULL,
  `PercentSize_20-100um` int(11) DEFAULT NULL,
  `PercentSize_100um-1mm` int(11) DEFAULT NULL,
  `PercentSize_1-5mm` int(11) DEFAULT NULL,
  `PercentForm_fiber` int(11) DEFAULT NULL,
  `PercentForm_Pellet` int(11) DEFAULT NULL,
  `PercentForm_Fragment` int(11) DEFAULT NULL,
  `Method_Desc` text DEFAULT NULL COMMENT 'Describe method used to estimate percentages',
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- --------------------------------------------------------

--
-- Table structure for table `PackagesInSample`
--

CREATE TABLE `PackagesInSample` (
  `PackageDetailsUniqueID` int(11) NOT NULL COMMENT 'Automatically assign',
  `SampleDetails_Num` int(11) NOT NULL COMMENT 'Unique_ID linked to SampleDetails',
  `Form_SelectID` int(11) DEFAULT NULL COMMENT 'For each whole packaging, enable drop-down selection of form in a table-style data entry box',
  `Purpose_SelectID` int(11) DEFAULT NULL COMMENT 'For each whole packaging, enable drop-down selection in a table-style data entry box',
  `PolymerCode_SelectID` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'For each whole packaging, enable drop-down selection in a table-style data entry box',
  `Color_SelectID` int(11) DEFAULT NULL COMMENT 'For each whole packaging, enable drop-down selection in a table-style data entry box'
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- --------------------------------------------------------

--
-- Table structure for table `RamanDetails`
--

CREATE TABLE `RamanDetails` (
  `Raman_UniqueID` int(11) NOT NULL,
  `SampleDetails_Num` int(11) NOT NULL,
  `Wavelength` int(11) NOT NULL COMMENT 'Select from the drop-down the wavelength used to obtain this Raman spectra',
  `DateEntered` datetime DEFAULT current_timestamp()
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Units_Ref`
--

CREATE TABLE `Units_Ref` (
  `UnitsUniqueID` int(11) NOT NULL,
  `Units_Type` varchar(50) NOT NULL,
  `Units_Code` varchar(20) NOT NULL,
  `Units_Desc` varchar(100) NOT NULL,
  `DateEntered` date NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

INSERT INTO `Units_Ref` (`UnitsUniqueID`, `Units_Type`, `Units_Code`, `Units_Desc`, `DateEntered`) VALUES
(1, 'Sample_Quantity', 'L', 'Liters', '2026-05-18'),
(2, 'Sample_Quantity', 'g', 'Grams', '2026-05-18'),
(3, 'Sample_Quantity', 'km2', 'Square Kilometers', '2026-05-18');

-- --------------------------------------------------------

--
-- Table structure for table `SampleDetails`
--

CREATE TABLE `SampleDetails` (
  `SampleUniqueID` int(11) NOT NULL COMMENT 'Label THIS sample with THIS unique identifier if being sent for analysis',
  `SamplingEvent_Num` int(11) NOT NULL COMMENT 'Automatic link to the sampling event',
  `MediaType_SelectID` int(11) DEFAULT NULL COMMENT 'Select from Drop-down menu selection of Water-Soil-Litter-Mixed media type (insert associated MediaTypeUniqueID)',
  `FragLargerThan5mm_Count` int(11) DEFAULT NULL COMMENT 'If analyzed, total count of fragment debris >5mm (purpose known and unknown)',
  `Micro5mmAndSmaller_Count` int(11) DEFAULT NULL COMMENT 'If analyzed, count of particles <5mm in size',
  `WaterEnvType_SelectID` int(11) DEFAULT NULL COMMENT 'Select from dropdown: Great Lake, Inland Lake (>=5ac), Pond (<5ac; <30% vegetated), River (>=15m bankfull width), Stream (<15m bankfull width), Wetland (>=30% vegetated)',
  `SoilMoisture%` int(11) DEFAULT NULL COMMENT 'Estimate % Soil Moisture if sample was collected from soil',
  `SampleUnit_Num` int(11) DEFAULT NULL COMMENT 'Unified sample amount unit from Units_Ref',
  `MicroplasticsSampleUnit_Num` int(11) DEFAULT NULL COMMENT 'Microplastics sample amount unit from Units_Ref',
  `FragmentsSampleUnit_Num` int(11) DEFAULT NULL COMMENT 'Fragment Debris sample amount unit from Units_Ref',
  `PackagingSampleUnit_Num` int(11) DEFAULT NULL COMMENT 'Legacy packaging sample amount unit from Units_Ref',
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `SampleDetails`
--

INSERT INTO `SampleDetails` (`SampleUniqueID`, `SamplingEvent_Num`, `MediaType_SelectID`, `FragLargerThan5mm_Count`, `Micro5mmAndSmaller_Count`, `WaterEnvType_SelectID`, `SoilMoisture%`, `DateEntered`) VALUES
(1, 101, 0, 305, NULL, 0, 0, '2024-12-10 12:00:00'),
(2, 102, 0, 453, NULL, 0, 0, '2024-12-10 13:30:00'),
(3, 103, 0, 522, NULL, 0, 0, '2024-12-11 09:15:00'),
(4, 104, 0, 276, NULL, 0, 0, '2024-12-11 10:45:00'),
(5, 105, 0, 394, NULL, 0, 0, '2024-12-12 08:20:00');

-- --------------------------------------------------------

--
-- Table structure for table `SamplingEvent`
--

CREATE TABLE `SamplingEvent` (
  `SamplingEventUniqueID` int(11) NOT NULL COMMENT 'Unique ID linking all samples from this sampling event',
  `LocationID_Num` int(11) NOT NULL COMMENT 'UniqueID for each mapped location, consistent across dates for repeat measures',
  `StartYear` smallint unsigned NOT NULL COMMENT 'Required collection/start year',
  `StartMonth` tinyint unsigned DEFAULT NULL COMMENT 'Optional collection/start month (1-12)',
  `StartDay` tinyint unsigned DEFAULT NULL COMMENT 'Optional collection/start day',
  `EndYear` smallint unsigned DEFAULT NULL COMMENT 'Device-period end year; NULL for single collection events',
  `EndMonth` tinyint unsigned DEFAULT NULL COMMENT 'Optional device-period end month (1-12)',
  `EndDay` tinyint unsigned DEFAULT NULL COMMENT 'Optional device-period end day',
  `PublicationID_Num` int(11) DEFAULT NULL COMMENT 'Optional associated publication',
  `UserSamplingID` int(11) NOT NULL COMMENT 'Logged-in user who entered the sampling event',
  `AirTemp_C` decimal(12,6) DEFAULT NULL COMMENT 'Current air temperature in Celsius',
  `Weather_Current` int(11) DEFAULT NULL COMMENT 'Current weather at time of sampling',
  `Weather_Precedent24` int(11) DEFAULT NULL COMMENT 'Predominant weather pattern in past 24 hours',
  `Rainfall_cm_Precedent24` decimal(12,6) DEFAULT NULL COMMENT 'Rainfall amount in past 24 hours, in centimeters',
  `SamplerNames` mediumtext DEFAULT NULL,
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp(),
  `DeviceInstallationPeriod` enum('no','yes') NOT NULL DEFAULT 'no' COMMENT 'Whether sample came from a device installed for a period',
  `SampleTime` time DEFAULT NULL COMMENT 'Collection time',
  `WeatherPrecedent24` int(11) DEFAULT NULL COMMENT 'Legacy precedent 24-hour weather reference',
  `AdditionalNotes` mediumtext DEFAULT NULL COMMENT 'Additional sampling-event notes',
  CONSTRAINT `chk_samplingevent_start_year_range`
    CHECK (`StartYear` BETWEEN 1000 AND 9999),
  CONSTRAINT `chk_samplingevent_start_month_range`
    CHECK (`StartMonth` IS NULL OR `StartMonth` BETWEEN 1 AND 12),
  CONSTRAINT `chk_samplingevent_start_day_hierarchy`
    CHECK (`StartDay` IS NULL OR `StartMonth` IS NOT NULL),
  CONSTRAINT `chk_samplingevent_start_day_calendar`
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
  CONSTRAINT `chk_samplingevent_end_year_range`
    CHECK (`EndYear` IS NULL OR `EndYear` BETWEEN 1000 AND 9999),
  CONSTRAINT `chk_samplingevent_end_month_hierarchy`
    CHECK (`EndMonth` IS NULL OR `EndYear` IS NOT NULL),
  CONSTRAINT `chk_samplingevent_end_month_range`
    CHECK (`EndMonth` IS NULL OR `EndMonth` BETWEEN 1 AND 12),
  CONSTRAINT `chk_samplingevent_end_day_hierarchy`
    CHECK (`EndDay` IS NULL OR (`EndYear` IS NOT NULL AND `EndMonth` IS NOT NULL)),
  CONSTRAINT `chk_samplingevent_end_day_calendar`
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
  CONSTRAINT `chk_samplingevent_date_mode`
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
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `OrganizationType_Ref`
--

CREATE TABLE `OrganizationType_Ref` (
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
(12, 'Other (please specify)');

-- --------------------------------------------------------

--
-- Table structure for table `Country_Ref`
--

CREATE TABLE `Country_Ref` (
  `CountryUniqueID` int(11) NOT NULL,
  `ISOAlpha2` char(2) DEFAULT NULL,
  `Country` varchar(100) NOT NULL,
  PRIMARY KEY (`CountryUniqueID`),
  UNIQUE KEY `Unique_Country_ISOAlpha2` (`ISOAlpha2`),
  UNIQUE KEY `Unique_Country` (`Country`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ISO 3166-1 assigned countries, dependencies, and other areas (249 entries).
-- CountryUniqueID=1 is retained for the United States so State_Ref links remain valid.
INSERT INTO `Country_Ref` (`CountryUniqueID`, `ISOAlpha2`, `Country`) VALUES
(2, 'AD', 'Andorra'),
(3, 'AE', 'United Arab Emirates'),
(4, 'AF', 'Afghanistan'),
(5, 'AG', 'Antigua and Barbuda'),
(6, 'AI', 'Anguilla'),
(7, 'AL', 'Albania'),
(8, 'AM', 'Armenia'),
(9, 'AO', 'Angola'),
(10, 'AQ', 'Antarctica'),
(11, 'AR', 'Argentina'),
(12, 'AS', 'American Samoa'),
(13, 'AT', 'Austria'),
(14, 'AU', 'Australia'),
(15, 'AW', 'Aruba'),
(16, 'AX', 'Åland Islands'),
(17, 'AZ', 'Azerbaijan'),
(18, 'BA', 'Bosnia and Herzegovina'),
(19, 'BB', 'Barbados'),
(20, 'BD', 'Bangladesh'),
(21, 'BE', 'Belgium'),
(22, 'BF', 'Burkina Faso'),
(23, 'BG', 'Bulgaria'),
(24, 'BH', 'Bahrain'),
(25, 'BI', 'Burundi'),
(26, 'BJ', 'Benin'),
(27, 'BL', 'Saint Barthélemy'),
(28, 'BM', 'Bermuda'),
(29, 'BN', 'Brunei Darussalam'),
(30, 'BO', 'Bolivia (Plurinational State of)'),
(31, 'BQ', 'Bonaire, Sint Eustatius and Saba'),
(32, 'BR', 'Brazil'),
(33, 'BS', 'Bahamas'),
(34, 'BT', 'Bhutan'),
(35, 'BV', 'Bouvet Island'),
(36, 'BW', 'Botswana'),
(37, 'BY', 'Belarus'),
(38, 'BZ', 'Belize'),
(39, 'CA', 'Canada'),
(40, 'CC', 'Cocos (Keeling) Islands'),
(41, 'CD', 'Democratic Republic of the Congo'),
(42, 'CF', 'Central African Republic'),
(43, 'CG', 'Congo'),
(44, 'CH', 'Switzerland'),
(45, 'CI', 'Côte d’Ivoire'),
(46, 'CK', 'Cook Islands'),
(47, 'CL', 'Chile'),
(48, 'CM', 'Cameroon'),
(49, 'CN', 'China'),
(50, 'CO', 'Colombia'),
(51, 'CR', 'Costa Rica'),
(52, 'CU', 'Cuba'),
(53, 'CV', 'Cabo Verde'),
(54, 'CW', 'Curaçao'),
(55, 'CX', 'Christmas Island'),
(56, 'CY', 'Cyprus'),
(57, 'CZ', 'Czechia'),
(58, 'DE', 'Germany'),
(59, 'DJ', 'Djibouti'),
(60, 'DK', 'Denmark'),
(61, 'DM', 'Dominica'),
(62, 'DO', 'Dominican Republic'),
(63, 'DZ', 'Algeria'),
(64, 'EC', 'Ecuador'),
(65, 'EE', 'Estonia'),
(66, 'EG', 'Egypt'),
(67, 'EH', 'Western Sahara'),
(68, 'ER', 'Eritrea'),
(69, 'ES', 'Spain'),
(70, 'ET', 'Ethiopia'),
(71, 'FI', 'Finland'),
(72, 'FJ', 'Fiji'),
(73, 'FK', 'Falkland Islands (Malvinas)'),
(74, 'FM', 'Micronesia (Federated States of)'),
(75, 'FO', 'Faroe Islands'),
(76, 'FR', 'France'),
(77, 'GA', 'Gabon'),
(78, 'GB', 'United Kingdom of Great Britain and Northern Ireland'),
(79, 'GD', 'Grenada'),
(80, 'GE', 'Georgia'),
(81, 'GF', 'French Guiana'),
(82, 'GG', 'Guernsey'),
(83, 'GH', 'Ghana'),
(84, 'GI', 'Gibraltar'),
(85, 'GL', 'Greenland'),
(86, 'GM', 'Gambia'),
(87, 'GN', 'Guinea'),
(88, 'GP', 'Guadeloupe'),
(89, 'GQ', 'Equatorial Guinea'),
(90, 'GR', 'Greece'),
(91, 'GS', 'South Georgia and the South Sandwich Islands'),
(92, 'GT', 'Guatemala'),
(93, 'GU', 'Guam'),
(94, 'GW', 'Guinea-Bissau'),
(95, 'GY', 'Guyana'),
(96, 'HK', 'China, Hong Kong Special Administrative Region'),
(97, 'HM', 'Heard Island and McDonald Islands'),
(98, 'HN', 'Honduras'),
(99, 'HR', 'Croatia'),
(100, 'HT', 'Haiti'),
(101, 'HU', 'Hungary'),
(102, 'ID', 'Indonesia'),
(103, 'IE', 'Ireland'),
(104, 'IL', 'Israel'),
(105, 'IM', 'Isle of Man'),
(106, 'IN', 'India'),
(107, 'IO', 'British Indian Ocean Territory'),
(108, 'IQ', 'Iraq'),
(109, 'IR', 'Iran (Islamic Republic of)'),
(110, 'IS', 'Iceland'),
(111, 'IT', 'Italy'),
(112, 'JE', 'Jersey'),
(113, 'JM', 'Jamaica'),
(114, 'JO', 'Jordan'),
(115, 'JP', 'Japan'),
(116, 'KE', 'Kenya'),
(117, 'KG', 'Kyrgyzstan'),
(118, 'KH', 'Cambodia'),
(119, 'KI', 'Kiribati'),
(120, 'KM', 'Comoros'),
(121, 'KN', 'Saint Kitts and Nevis'),
(122, 'KP', 'Democratic People''s Republic of Korea'),
(123, 'KR', 'Republic of Korea'),
(124, 'KW', 'Kuwait'),
(125, 'KY', 'Cayman Islands'),
(126, 'KZ', 'Kazakhstan'),
(127, 'LA', 'Lao People''s Democratic Republic'),
(128, 'LB', 'Lebanon'),
(129, 'LC', 'Saint Lucia'),
(130, 'LI', 'Liechtenstein'),
(131, 'LK', 'Sri Lanka'),
(132, 'LR', 'Liberia'),
(133, 'LS', 'Lesotho'),
(134, 'LT', 'Lithuania'),
(135, 'LU', 'Luxembourg'),
(136, 'LV', 'Latvia'),
(137, 'LY', 'Libya'),
(138, 'MA', 'Morocco'),
(139, 'MC', 'Monaco'),
(140, 'MD', 'Republic of Moldova'),
(141, 'ME', 'Montenegro'),
(142, 'MF', 'Saint Martin (French Part)'),
(143, 'MG', 'Madagascar'),
(144, 'MH', 'Marshall Islands'),
(145, 'MK', 'North Macedonia'),
(146, 'ML', 'Mali'),
(147, 'MM', 'Myanmar'),
(148, 'MN', 'Mongolia'),
(149, 'MO', 'China, Macao Special Administrative Region'),
(150, 'MP', 'Northern Mariana Islands'),
(151, 'MQ', 'Martinique'),
(152, 'MR', 'Mauritania'),
(153, 'MS', 'Montserrat'),
(154, 'MT', 'Malta'),
(155, 'MU', 'Mauritius'),
(156, 'MV', 'Maldives'),
(157, 'MW', 'Malawi'),
(158, 'MX', 'Mexico'),
(159, 'MY', 'Malaysia'),
(160, 'MZ', 'Mozambique'),
(161, 'NA', 'Namibia'),
(162, 'NC', 'New Caledonia'),
(163, 'NE', 'Niger'),
(164, 'NF', 'Norfolk Island'),
(165, 'NG', 'Nigeria'),
(166, 'NI', 'Nicaragua'),
(167, 'NL', 'Netherlands (Kingdom of the)'),
(168, 'NO', 'Norway'),
(169, 'NP', 'Nepal'),
(170, 'NR', 'Nauru'),
(171, 'NU', 'Niue'),
(172, 'NZ', 'New Zealand'),
(173, 'OM', 'Oman'),
(174, 'PA', 'Panama'),
(175, 'PE', 'Peru'),
(176, 'PF', 'French Polynesia'),
(177, 'PG', 'Papua New Guinea'),
(178, 'PH', 'Philippines'),
(179, 'PK', 'Pakistan'),
(180, 'PL', 'Poland'),
(181, 'PM', 'Saint Pierre and Miquelon'),
(182, 'PN', 'Pitcairn'),
(183, 'PR', 'Puerto Rico'),
(184, 'PS', 'State of Palestine'),
(185, 'PT', 'Portugal'),
(186, 'PW', 'Palau'),
(187, 'PY', 'Paraguay'),
(188, 'QA', 'Qatar'),
(189, 'RE', 'Réunion'),
(190, 'RO', 'Romania'),
(191, 'RS', 'Serbia'),
(192, 'RU', 'Russian Federation'),
(193, 'RW', 'Rwanda'),
(194, 'SA', 'Saudi Arabia'),
(195, 'SB', 'Solomon Islands'),
(196, 'SC', 'Seychelles'),
(197, 'SD', 'Sudan'),
(198, 'SE', 'Sweden'),
(199, 'SG', 'Singapore'),
(200, 'SH', 'Saint Helena'),
(201, 'SI', 'Slovenia'),
(202, 'SJ', 'Svalbard and Jan Mayen Islands'),
(203, 'SK', 'Slovakia'),
(204, 'SL', 'Sierra Leone'),
(205, 'SM', 'San Marino'),
(206, 'SN', 'Senegal'),
(207, 'SO', 'Somalia'),
(208, 'SR', 'Suriname'),
(209, 'SS', 'South Sudan'),
(210, 'ST', 'Sao Tome and Principe'),
(211, 'SV', 'El Salvador'),
(212, 'SX', 'Sint Maarten (Dutch part)'),
(213, 'SY', 'Syrian Arab Republic'),
(214, 'SZ', 'Eswatini'),
(215, 'TC', 'Turks and Caicos Islands'),
(216, 'TD', 'Chad'),
(217, 'TF', 'French Southern Territories'),
(218, 'TG', 'Togo'),
(219, 'TH', 'Thailand'),
(220, 'TJ', 'Tajikistan'),
(221, 'TK', 'Tokelau'),
(222, 'TL', 'Timor-Leste'),
(223, 'TM', 'Turkmenistan'),
(224, 'TN', 'Tunisia'),
(225, 'TO', 'Tonga'),
(226, 'TR', 'Türkiye'),
(227, 'TT', 'Trinidad and Tobago'),
(228, 'TV', 'Tuvalu'),
(229, 'TW', 'Taiwan, Province of China'),
(230, 'TZ', 'United Republic of Tanzania'),
(231, 'UA', 'Ukraine'),
(232, 'UG', 'Uganda'),
(233, 'UM', 'United States Minor Outlying Islands'),
(1, 'US', 'United States of America'),
(234, 'UY', 'Uruguay'),
(235, 'UZ', 'Uzbekistan'),
(236, 'VA', 'Holy See'),
(237, 'VC', 'Saint Vincent and the Grenadines'),
(238, 'VE', 'Venezuela (Bolivarian Republic of)'),
(239, 'VG', 'British Virgin Islands'),
(240, 'VI', 'United States Virgin Islands'),
(241, 'VN', 'Viet Nam'),
(242, 'VU', 'Vanuatu'),
(243, 'WF', 'Wallis and Futuna Islands'),
(244, 'WS', 'Samoa'),
(245, 'YE', 'Yemen'),
(246, 'YT', 'Mayotte'),
(247, 'ZA', 'South Africa'),
(248, 'ZM', 'Zambia'),
(249, 'ZW', 'Zimbabwe');

-- --------------------------------------------------------

--
-- Table structure for table `State_Ref`
--

CREATE TABLE `State_Ref` (
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
(51, 'Wyoming', 1);

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `User_UniqueID` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `first_name` varchar(50) DEFAULT NULL,
  `last_name` varchar(50) DEFAULT NULL,
  `organization` varchar(100) DEFAULT NULL,
  `OrganizationType_Num` int(11) DEFAULT NULL,
  `OrganizationTypeOther` varchar(255) DEFAULT NULL,
  `job_title` varchar(100) DEFAULT NULL,
  `Country_Num` int(11) DEFAULT NULL,
  `State_Num` int(11) DEFAULT NULL,
  `role` enum('admin','researcher','user') DEFAULT 'user',
  `is_active` tinyint(1) DEFAULT 1,
  `email_verified` tinyint(1) DEFAULT 0,
  `password_reset_token` varchar(255) DEFAULT NULL,
  `password_reset_expires` datetime DEFAULT NULL,
  `last_login` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`User_UniqueID`, `username`, `email`, `password`, `created_at`) VALUES
(7, 'admin', 'yongtaoyao@wayne.edu', '$2y$10$SkMW7JvaUBY68ghv/8Me..qQxoMPtw6mKcRPaFJCzh83dEeDkZPD6', '2025-05-19 20:56:34');

-- --------------------------------------------------------

--
-- Table structure for table `password_reset_tokens`
--

CREATE TABLE `password_reset_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `email` varchar(100) NOT NULL,
  `token` varchar(64) NOT NULL,
  -- The explicit DEFAULT stops MariaDB from implicitly making the first
  -- timestamp column auto-update to the current time on every row update.
  `expires_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `used` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `user_id` (`user_id`),
  KEY `email` (`email`),
  KEY `expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `account_recovery_cooldowns`
--

CREATE TABLE `account_recovery_cooldowns` (
  `scope` varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `key_hash` binary(32) NOT NULL,
  `window_started_at` datetime(6) NOT NULL,
  `attempt_count` smallint unsigned NOT NULL DEFAULT 0,
  `blocked_until` datetime(6) DEFAULT NULL,
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6)
    ON UPDATE current_timestamp(6),
  PRIMARY KEY (`scope`, `key_hash`),
  KEY `updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `account_recovery_outbox`
--

CREATE TABLE `account_recovery_outbox` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `event_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` int(11) NOT NULL,
  `reset_token_id` int(11) NOT NULL,
  `payload_ciphertext` mediumtext DEFAULT NULL,
  `status` varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'pending',
  `attempt_count` smallint unsigned NOT NULL DEFAULT 0,
  `next_attempt_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `claim_token` char(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `lease_until` datetime(6) DEFAULT NULL,
  `last_error_code` varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6)
    ON UPDATE current_timestamp(6),
  `sent_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `event_id` (`event_id`),
  UNIQUE KEY `claim_token` (`claim_token`),
  KEY `ready_jobs` (`status`, `next_attempt_at`, `lease_until`, `id`),
  KEY `user_id` (`user_id`),
  KEY `reset_token_id` (`reset_token_id`),
  CONSTRAINT `FK_RecoveryOutbox_ResetToken`
    FOREIGN KEY (`reset_token_id`) REFERENCES `password_reset_tokens` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `WaterEnvType_Ref`
--

CREATE TABLE `WaterEnvType_Ref` (
  `WaterEnv_UniqueID` int(11) NOT NULL,
  `WaterEnv_Name` text NOT NULL COMMENT 'Populate dropdown with: Ocean/Sea, Great Lake, Inland Lake (>=5ac), Pond (<5ac; <30% vegetated), River (>=15m bankfull width), Stream (<15m bankfull width), Wetland (>=30% vegetated)',
  `WaterEnv_Desc` text NOT NULL COMMENT 'Explain definition (see user manual)',
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `WaterEnvType_Ref`
--

INSERT INTO `WaterEnvType_Ref` (`WaterEnv_UniqueID`, `WaterEnv_Name`, `WaterEnv_Desc`, `DateEntered`) VALUES
(1, 'Stream', 'Size <15m bankfull channel width, also called a creek or ditch', '2025-05-19'),
(2, 'River', 'Size >= 15m bankfull channel width', '2025-05-19'),
(3, 'Inland Lake', 'Size >=5 acres (or 2 hectares) open water, excepting the Great Lakes', '2025-05-19'),
(4, 'Pond', 'Size less than 5 acres (or 2 hectares) open water (<30% emergent vegetation)', '2025-05-19'),
(5, 'Wetland', 'Greater than 30% vegetated aquatic habitat (see pond or inland lake if less vegetated than 30%)', '2025-05-19'),
(6, 'Great Lake', 'One of the named Great Lakes (in North America: Superior, Michigan, Huron, Erie, Ontario)', '2025-05-19');

-- --------------------------------------------------------

--
-- Table structure for table `Wavelength_Ref`
--

CREATE TABLE `Wavelength_Ref` (
  `Wavelength_UniqueID` int(11) NOT NULL,
  `WavelengthRange` text NOT NULL,
  `DateEntered` datetime DEFAULT current_timestamp()
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `Wavelength_Ref`
--

INSERT INTO `Wavelength_Ref` (`Wavelength_UniqueID`, `WavelengthRange`, `DateEntered`) VALUES
(1, '0 - 499 nm', '2025-05-21'),
(2, '500 - 599 nm', '2025-05-21'),
(3, '600 - 699 nm', '2025-05-21'),
(4, '700 - 799 nm', '2025-05-21'),
(5, '800 nm and greater', '2025-05-21');

-- --------------------------------------------------------

--
-- Table structure for table `WeatherType_Ref`
--

CREATE TABLE `WeatherType_Ref` (
  `WeatherUniqueID` int(11) NOT NULL,
  `WeatherType` text NOT NULL,
  `WeatherDescription` text NOT NULL,
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `WeatherType_Ref`
--

INSERT INTO `WeatherType_Ref` (`WeatherUniqueID`, `WeatherType`, `WeatherDescription`, `DateEntered`) VALUES
(1, 'Sunny', 'Less than 50% cloud cover', '2025-05-19 16:25:52'),
(2, 'Cloudy', '50% cloud cover or more', '2025-05-19 16:25:52'),
(3, 'Raining', 'Precipitation currently falling (see also precedent inches of rainfall)', '2025-05-19 16:25:52');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `FragmentsInSample`
--
ALTER TABLE `FragmentsInSample`
  ADD PRIMARY KEY (`Fragment_UniqueID`);

--
-- Indexes for table `Location`
--
ALTER TABLE `Location`
  ADD UNIQUE KEY `UniqueLocID` (`Loc_UniqueID`);

--
-- Indexes for table `LocType_Env-Indoor_Ref`
--
ALTER TABLE `LocType_Env-Indoor_Ref`
  ADD UNIQUE KEY `SourceUniqueID` (`LocTypeUniqueID`);

--
-- Indexes for table `MediaType_WithinLitterWaterSoil_Ref`
--
ALTER TABLE `MediaType_WithinLitterWaterSoil_Ref`
  ADD UNIQUE KEY `MediaTypeUniqueID` (`MediaTypeUniqueID`);

--
-- Indexes for table `MicroplasticsInSample`
--
ALTER TABLE `MicroplasticsInSample`
  ADD PRIMARY KEY (`Micro_UniqueID`);

--
-- Indexes for table `PackagesInSample`
--
ALTER TABLE `PackagesInSample`
  ADD UNIQUE KEY `ParticleDetailsUniqueID` (`PackageDetailsUniqueID`);

--
-- Indexes for table `SampleDetails`
--
ALTER TABLE `SampleDetails`
  ADD UNIQUE KEY `SampleUniqueID` (`SampleUniqueID`),
  ADD KEY `FK_Sample_Unit` (`SampleUnit_Num`),
  ADD KEY `FK_Sample_MicroUnit` (`MicroplasticsSampleUnit_Num`),
  ADD KEY `FK_Sample_FragmentUnit` (`FragmentsSampleUnit_Num`),
  ADD KEY `FK_Sample_PackagingUnit` (`PackagingSampleUnit_Num`);

--
-- Indexes for table `Units_Ref`
--
ALTER TABLE `Units_Ref`
  ADD PRIMARY KEY (`UnitsUniqueID`),
  ADD UNIQUE KEY `Unique_Units_Code` (`Units_Code`);

--
-- Indexes for table `SamplingEvent`
--
ALTER TABLE `SamplingEvent`
  ADD PRIMARY KEY (`SamplingEventUniqueID`),
  ADD KEY `idx_samplingevent_location` (`LocationID_Num`),
  ADD KEY `FK_Event_User` (`UserSamplingID`),
  ADD KEY `FK_Event_Publication` (`PublicationID_Num`),
  ADD KEY `FK_Event_CurrentWeather` (`Weather_Current`),
  ADD KEY `FK_Event_PrecedentWeather` (`Weather_Precedent24`),
  ADD KEY `FK_Event_PrecedentWeatherLegacy` (`WeatherPrecedent24`),
  ADD KEY `idx_samplingevent_start_components`
    (`StartYear`, `StartMonth`, `StartDay`, `SamplingEventUniqueID`),
  ADD KEY `idx_samplingevent_end_components` (`EndYear`, `EndMonth`, `EndDay`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`User_UniqueID`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `WaterEnvType_Ref`
--
ALTER TABLE `WaterEnvType_Ref`
  ADD UNIQUE KEY `WaterEnv_UniqueID` (`WaterEnv_UniqueID`);

--
-- Indexes for table `Wavelength_Ref`
--
ALTER TABLE `Wavelength_Ref`
  ADD PRIMARY KEY (`Wavelength_UniqueID`);

--
-- Indexes for table `WeatherType_Ref`
--
ALTER TABLE `WeatherType_Ref`
  ADD UNIQUE KEY `WeatherUniqueID` (`WeatherUniqueID`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `User_UniqueID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- Constraints for table `SampleDetails`
--
ALTER TABLE `SampleDetails`
  ADD CONSTRAINT `FK_Sample_Unit` FOREIGN KEY (`SampleUnit_Num`) REFERENCES `Units_Ref` (`UnitsUniqueID`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FK_Sample_MicroUnit` FOREIGN KEY (`MicroplasticsSampleUnit_Num`) REFERENCES `Units_Ref` (`UnitsUniqueID`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FK_Sample_FragmentUnit` FOREIGN KEY (`FragmentsSampleUnit_Num`) REFERENCES `Units_Ref` (`UnitsUniqueID`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FK_Sample_PackagingUnit` FOREIGN KEY (`PackagingSampleUnit_Num`) REFERENCES `Units_Ref` (`UnitsUniqueID`) ON DELETE RESTRICT ON UPDATE CASCADE;

--
-- Constraints for table `users`
--
ALTER TABLE `users`
  ADD CONSTRAINT `FK_User_OrganizationType` FOREIGN KEY (`OrganizationType_Num`) REFERENCES `OrganizationType_Ref` (`OrganizationTypeUniqueID`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FK_User_Country` FOREIGN KEY (`Country_Num`) REFERENCES `Country_Ref` (`CountryUniqueID`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FK_User_State` FOREIGN KEY (`State_Num`) REFERENCES `State_Ref` (`StateUniqueID`) ON DELETE RESTRICT ON UPDATE CASCADE;

--
-- Constraints for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  ADD CONSTRAINT `FK_ResetToken_User` FOREIGN KEY (`user_id`) REFERENCES `users` (`User_UniqueID`) ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
