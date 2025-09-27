-- phpMyAdmin SQL Dump
-- version 5.2.0
-- https://www.phpmyadmin.net/
--
-- Host: localhost
-- Generation Time: Aug 04, 2025 at 03:16 AM
-- Server version: 8.0.31
-- PHP Version: 7.4.33

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
-- Table structure for table `fragmentsinsample`
--

CREATE TABLE `fragmentsinsample` (
  `Fragment_UniqueID` int NOT NULL,
  `SampleDetails_Num` int NOT NULL,
  `PercentColor_Clear` int DEFAULT NULL,
  `PercentColor_Op-Color` int DEFAULT NULL,
  `PercentColor_Op-Dk` int DEFAULT NULL,
  `PercentColor_Mixed` int DEFAULT NULL,
  `PercentForm_Fiber` int DEFAULT NULL,
  `PercentForm_Pellet` int DEFAULT NULL,
  `PercentForm_Film` int DEFAULT NULL,
  `PercentForm_Foam` int DEFAULT NULL,
  `PercentForm_HardPlastic` int DEFAULT NULL,
  `DateEntered` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `fragmentspolymerdetails`
--

CREATE TABLE `fragmentspolymerdetails` (
  `ID` int NOT NULL,
  `Fragment_UniqueID` int NOT NULL,
  `PolymerType` varchar(50) NOT NULL,
  `Percentage` int DEFAULT NULL,
  `DateEntered` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `location`
--

CREATE TABLE `location` (
  `Loc_UniqueID` int NOT NULL COMMENT 'Automatically generated unique location identifier to enter into SamplingEvent table based on drop-down menu selection',
  `UserLocID_txt` text COMMENT 'User-defined short text and numbers to ID location, to be displayed in drop-down menu for location selection',
  `LocationName` varchar(255) CHARACTER SET latin1 COLLATE latin1_swedish_ci NOT NULL COMMENT 'Short user-defined name to ID location, to be displayed in drop-down menu for location selection',
  `Location_Desc` text NOT NULL COMMENT 'Longer user-defined location description, to be displayed in drop-down menu for location selection',
  `Env-Indoor_SelectID` int NOT NULL COMMENT 'Use dropdown menu to identify whether location was in the environment or indoor (insert ID from LocTypeUniqueID)',
  `Lat-DecimalDegree` decimal(10,6) DEFAULT NULL,
  `Long-DecimalDegree` decimal(10,6) DEFAULT NULL,
  `Area-acres` decimal(10,0) DEFAULT NULL,
  `StreetAddress` text COMMENT 'Enter street address-city-state-country-zip only if Lat/Long is not identified',
  `City` text,
  `State` text,
  `Country` text,
  `ZipCode` int DEFAULT NULL COMMENT 'Allow zipcode only for confidential data; not required if Lat/Long is entered',
  `LocationType-Environment` text COMMENT 'TBD later; use for analysis (urban-rural; upstream-downstream)',
  `LocationType-Indoor` text COMMENT 'TBD later; use for analysis (WWTP, recycling plant, drinking water utility)',
  `DateCreated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `UserCreated` text NOT NULL COMMENT '	Automatically enter logged-in UserID who is entering this location information'
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `loctype_env-indoor_ref`
--

CREATE TABLE `loctype_env-indoor_ref` (
  `LocTypeUniqueID` int NOT NULL,
  `LocType_Desc` text NOT NULL COMMENT 'Use this and other TBD fields in this table to drive location drop-down menus',
  `DateEntered` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `mediatype_withinlitterwatersoil_ref`
--

CREATE TABLE `mediatype_withinlitterwatersoil_ref` (
  `MediaTypeUniqueID` int NOT NULL COMMENT 'Identifier to be inserted into SamplingEvent table upon selection of MediaType from dropdown',
  `MediaTypeOverall` text NOT NULL COMMENT 'Display in drop-down for selection of media type (In Water, In Soil/Sediment, On Soil, Mixed Media)',
  `MediaTypeDetail` text NOT NULL COMMENT 'Describe in greater detail, to be displayed to help in selection',
  `DateEntered` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `microplasticsinsample`
--

CREATE TABLE `microplasticsinsample` (
  `Micro_UniqueID` int NOT NULL,
  `SampleDetails_Num` int NOT NULL,
  `PercentSize_<1um` int DEFAULT NULL,
  `PercentSize_1-20um` int DEFAULT NULL,
  `PercentSize_20-100um` int DEFAULT NULL,
  `PercentSize_100um-1mm` int DEFAULT NULL,
  `PercentSize_1-5mm` int DEFAULT NULL,
  `PercentForm_fiber` int DEFAULT NULL,
  `PercentForm_Pellet` int DEFAULT NULL,
  `PercentForm_Fragment` int DEFAULT NULL,
  `Method_Desc` text COMMENT 'Describe method used to estimate percentages',
  `DateEntered` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `PercentForm_Film` int DEFAULT NULL COMMENT 'Percentage of film form',
  `PercentForm_Foam` int DEFAULT NULL COMMENT 'Percentage of foam form',
  `PercentColor_Clear` int DEFAULT NULL COMMENT 'Percentage of clear color',
  `PercentColor_OpaqueLight` int DEFAULT NULL COMMENT 'Percentage of opaque light color',
  `PercentColor_OpaqueDark` int DEFAULT NULL COMMENT 'Percentage of opaque dark color',
  `PercentColor_Mixed` int DEFAULT NULL COMMENT 'Percentage of mixed color'
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `microplasticspolymerdetails`
--

CREATE TABLE `microplasticspolymerdetails` (
  `ID` int NOT NULL,
  `Micro_UniqueID` int NOT NULL,
  `PolymerType` varchar(50) NOT NULL,
  `Percentage` int DEFAULT NULL,
  `DateEntered` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `packagesinsample`
--

CREATE TABLE `packagesinsample` (
  `PackageDetailsUniqueID` int NOT NULL COMMENT 'Automatically assign',
  `SampleDetails_Num` int NOT NULL COMMENT 'Unique_ID linked to SampleDetails',
  `Form_SelectID` int DEFAULT NULL COMMENT 'For each whole packaging, enable drop-down selection of form in a table-style data entry box',
  `Purpose_SelectID` int DEFAULT NULL COMMENT 'For each whole packaging, enable drop-down selection in a table-style data entry box',
  `PolymerCode_SelectID` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT 'For each whole packaging, enable drop-down selection in a table-style data entry box',
  `Color_SelectID` int DEFAULT NULL COMMENT 'For each whole packaging, enable drop-down selection in a table-style data entry box',
  `UserPieceID` varchar(100) DEFAULT NULL COMMENT 'User defined piece identifier',
  `PackagingPurpose` varchar(200) DEFAULT NULL COMMENT 'Purpose of packaging',
  `RecycleCode` varchar(20) DEFAULT NULL COMMENT 'Recycle code',
  `ColorOpacity` varchar(50) DEFAULT NULL COMMENT 'Color opacity type',
  `Color` varchar(50) DEFAULT NULL COMMENT 'Color of package'
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `password_reset_tokens`
--

CREATE TABLE `password_reset_tokens` (
  `id` int NOT NULL,
  `user_id` int NOT NULL,
  `email` varchar(100) NOT NULL,
  `token` varchar(64) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `used` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `ramandetails`
--

CREATE TABLE `ramandetails` (
  `Raman_UniqueID` int NOT NULL,
  `SampleDetails_Num` int NOT NULL,
  `Wavelength` int NOT NULL COMMENT 'Select from the drop-down the wavelength used to obtain this Raman spectra',
  `DateEntered` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `sampledetails`
--

CREATE TABLE `sampledetails` (
  `SampleUniqueID` int NOT NULL COMMENT 'Label THIS sample with THIS unique identifier if being sent for analysis',
  `SamplingEvent_Num` int NOT NULL COMMENT 'Automatic Link to Sampling Event Location-Date',
  `MediaType_SelectID` int DEFAULT NULL COMMENT 'Select from Drop-down menu selection of Water-Soil-Litter-Mixed media type (insert associated MediaTypeUniqueID)',
  `WholePkg_Count` int DEFAULT NULL COMMENT 'If analyzed, count of pieces of whole packaging in this sample',
  `FragLargerThan5mm_Count` int DEFAULT NULL COMMENT 'If analyzed, count of particles >5mm in size',
  `Micro5mmAndSmaller_Count` int DEFAULT NULL COMMENT 'If analyzed, count of particles <5mm in size',
  `WaterEnvType_SelectID` int DEFAULT NULL COMMENT 'Select from dropdown: Great Lake, Inland Lake (>=5ac), Pond (<5ac; <30% vegetated), River (>=15m bankfull width), Stream (<15m bankfull width), Wetland (>=30% vegetated)',
  `SoilMoisture%` int DEFAULT NULL COMMENT 'Estimate % Soil Moisture if sample was collected from soil',
  `StorageLocation` int DEFAULT NULL COMMENT 'Select sample storage location from dropdown menu or add a new location using the button',
  `DateEntered` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `MediaSubType` varchar(100) DEFAULT NULL COMMENT 'Specific media subtype (water_type, sediment_type, etc.)',
  `LandscapeType` varchar(100) DEFAULT NULL COMMENT 'Landscape type for soil/surface samples',
  `MixedMediaDescription` text COMMENT 'Description of mixed media composition',
  `VolumeSampled` decimal(10,3) DEFAULT NULL COMMENT 'Volume sampled in liters',
  `WaterDepth` decimal(10,2) DEFAULT NULL COMMENT 'Water depth in meters',
  `FlowVelocity` decimal(10,2) DEFAULT NULL COMMENT 'Water flow velocity',
  `SuspendedSolids` decimal(10,2) DEFAULT NULL COMMENT 'Total suspended solids mg/L',
  `Conductivity` decimal(10,2) DEFAULT NULL COMMENT 'Conductivity uS/cm',
  `SoilDryWeight` decimal(10,2) DEFAULT NULL COMMENT 'Soil dry weight in grams',
  `SoilOrganicMatter` decimal(5,2) DEFAULT NULL COMMENT 'Soil organic matter percentage',
  `SoilSand` decimal(5,2) DEFAULT NULL COMMENT 'Soil sand percentage',
  `SoilSilt` decimal(5,2) DEFAULT NULL COMMENT 'Soil silt percentage',
  `SoilClay` decimal(5,2) DEFAULT NULL COMMENT 'Soil clay percentage',
  `ReplicatesCount` int DEFAULT NULL COMMENT 'Number of replicates',
  `MicroplasticsSampleAmount` decimal(10,3) DEFAULT NULL COMMENT 'Sample amount for microplastics',
  `MicroplasticsSampleUnit` varchar(20) DEFAULT NULL COMMENT 'Unit for microplastics sample amount',
  `FragmentsSampleAmount` decimal(10,3) DEFAULT NULL COMMENT 'Sample amount for fragments',
  `FragmentsSampleUnit` varchar(20) DEFAULT NULL COMMENT 'Unit for fragments sample amount',
  `PackagingSampleAmount` decimal(10,3) DEFAULT NULL COMMENT 'Sample amount for packaging',
  `PackagingSampleUnit` varchar(20) DEFAULT NULL COMMENT 'Unit for packaging sample amount'
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `samplingevent`
--

CREATE TABLE `samplingevent` (
  `SamplingEventUniqueID` int NOT NULL COMMENT 'Location-Date UniqueID to link to all samples on this date at this location',
  `LocationID_Num` int NOT NULL COMMENT 'UniqueID for each mapped location, consistent across dates for repeat measures',
  `SamplingDate` date NOT NULL,
  `UserSamplingID` text NOT NULL COMMENT 'Automatically enter logged-in UserID who is entering data',
  `AirTemp-C` decimal(10,0) DEFAULT NULL COMMENT 'Current air temperature in Celsius',
  `Weather-Current` int DEFAULT NULL COMMENT 'Current weather at time of sampling',
  `Weather-Precedent24` int DEFAULT NULL COMMENT 'Predominant weather pattern in past 24 hours',
  `Rainfall-cm-Precedent24` decimal(10,0) DEFAULT NULL COMMENT 'Rainfall amount in past 24 hours, in centimeters',
  `SamplerNames` text,
  `DateEntered` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `DeviceInstallationPeriod` enum('no','yes') DEFAULT 'no' COMMENT 'Whether sample came from device installed for a period',
  `DeviceStartDate` date DEFAULT NULL COMMENT 'Device installation start date',
  `DeviceEndDate` date DEFAULT NULL COMMENT 'Device removal/end date',
  `SampleTime` time DEFAULT NULL COMMENT 'Collection time',
  `WeatherPrecedent24` int DEFAULT NULL COMMENT 'Precedent 24 hour weather pattern',
  `AdditionalNotes` text COMMENT 'Additional notes from review page'
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `storageloc_ref`
--

CREATE TABLE `storageloc_ref` (
  `StorageLocUniqueID` int NOT NULL,
  `StorageLoc_Desc` text NOT NULL,
  `DateEntered` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `User_UniqueID` int NOT NULL,
  `username` varchar(50) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `full_name` varchar(100) DEFAULT NULL,
  `institution` varchar(150) DEFAULT NULL,
  `cell_phone` varchar(20) DEFAULT NULL,
  `sample_confidentiality` enum('public','restricted','private') DEFAULT 'public',
  `sample_storage_location` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `waterenvtype_ref`
--

CREATE TABLE `waterenvtype_ref` (
  `WaterEnv_UniqueID` int NOT NULL,
  `WaterEnv_Name` text NOT NULL COMMENT 'Populate dropdown with: Ocean/Sea, Great Lake, Inland Lake (>=5ac), Pond (<5ac; <30% vegetated), River (>=15m bankfull width), Stream (<15m bankfull width), Wetland (>=30% vegetated)',
  `WaterEnv_Desc` text NOT NULL COMMENT 'Explain definition (see user manual)',
  `DateEntered` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `wavelength_ref`
--

CREATE TABLE `wavelength_ref` (
  `Wavelength_UniqueID` int NOT NULL,
  `WavelengthRange` text NOT NULL,
  `DateEntered` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `weathertype_ref`
--

CREATE TABLE `weathertype_ref` (
  `WeatherUniqueID` int NOT NULL,
  `WeatherType` text NOT NULL,
  `WeatherDescription` text NOT NULL,
  `DateEntered` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `fragmentsinsample`
--
ALTER TABLE `fragmentsinsample`
  ADD PRIMARY KEY (`Fragment_UniqueID`),
  ADD KEY `idx_fragments_sample` (`SampleDetails_Num`);

--
-- Indexes for table `fragmentspolymerdetails`
--
ALTER TABLE `fragmentspolymerdetails`
  ADD PRIMARY KEY (`ID`),
  ADD KEY `FK_FragmentPolymer_Fragment` (`Fragment_UniqueID`);

--
-- Indexes for table `location`
--
ALTER TABLE `location`
  ADD PRIMARY KEY (`Loc_UniqueID`),
  ADD UNIQUE KEY `UniqueLocID` (`Loc_UniqueID`),
  ADD UNIQUE KEY `LocationName` (`LocationName`);

--
-- Indexes for table `loctype_env-indoor_ref`
--
ALTER TABLE `loctype_env-indoor_ref`
  ADD UNIQUE KEY `SourceUniqueID` (`LocTypeUniqueID`);

--
-- Indexes for table `mediatype_withinlitterwatersoil_ref`
--
ALTER TABLE `mediatype_withinlitterwatersoil_ref`
  ADD UNIQUE KEY `MediaTypeUniqueID` (`MediaTypeUniqueID`);

--
-- Indexes for table `microplasticsinsample`
--
ALTER TABLE `microplasticsinsample`
  ADD PRIMARY KEY (`Micro_UniqueID`),
  ADD KEY `idx_microplastics_sample` (`SampleDetails_Num`);

--
-- Indexes for table `microplasticspolymerdetails`
--
ALTER TABLE `microplasticspolymerdetails`
  ADD PRIMARY KEY (`ID`),
  ADD KEY `FK_MicroPolymer_Micro` (`Micro_UniqueID`);

--
-- Indexes for table `packagesinsample`
--
ALTER TABLE `packagesinsample`
  ADD UNIQUE KEY `ParticleDetailsUniqueID` (`PackageDetailsUniqueID`),
  ADD KEY `idx_packages_sample` (`SampleDetails_Num`);

--
-- Indexes for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `token` (`token`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `email` (`email`),
  ADD KEY `expires_at` (`expires_at`);

--
-- Indexes for table `sampledetails`
--
ALTER TABLE `sampledetails`
  ADD UNIQUE KEY `SampleUniqueID` (`SampleUniqueID`),
  ADD KEY `idx_sampledetails_event` (`SamplingEvent_Num`);

--
-- Indexes for table `samplingevent`
--
ALTER TABLE `samplingevent`
  ADD UNIQUE KEY `SamplingEventUniqueID` (`SamplingEventUniqueID`),
  ADD KEY `idx_samplingevent_location` (`LocationID_Num`),
  ADD KEY `idx_samplingevent_date` (`SamplingDate`);

--
-- Indexes for table `storageloc_ref`
--
ALTER TABLE `storageloc_ref`
  ADD PRIMARY KEY (`StorageLocUniqueID`);

--
-- Indexes for table `waterenvtype_ref`
--
ALTER TABLE `waterenvtype_ref`
  ADD UNIQUE KEY `WaterEnv_UniqueID` (`WaterEnv_UniqueID`);

--
-- Indexes for table `wavelength_ref`
--
ALTER TABLE `wavelength_ref`
  ADD PRIMARY KEY (`Wavelength_UniqueID`);

--
-- Indexes for table `weathertype_ref`
--
ALTER TABLE `weathertype_ref`
  ADD UNIQUE KEY `WeatherUniqueID` (`WeatherUniqueID`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `fragmentspolymerdetails`
--
ALTER TABLE `fragmentspolymerdetails`
  MODIFY `ID` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `location`
--
ALTER TABLE `location`
  MODIFY `Loc_UniqueID` int NOT NULL AUTO_INCREMENT COMMENT 'Automatically generated unique location identifier to enter into SamplingEvent table based on drop-down menu selection';

--
-- AUTO_INCREMENT for table `microplasticspolymerdetails`
--
ALTER TABLE `microplasticspolymerdetails`
  MODIFY `ID` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
