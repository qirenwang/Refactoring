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
-- Table structure for table `SampleDetails`
--

CREATE TABLE `SampleDetails` (
  `SampleUniqueID` int(11) NOT NULL COMMENT 'Label THIS sample with THIS unique identifier if being sent for analysis',
  `SamplingEvent_Num` int(11) NOT NULL COMMENT 'Automatic Link to Sampling Event Location-Date',
  `MediaType_SelectID` int(11) DEFAULT NULL COMMENT 'Select from Drop-down menu selection of Water-Soil-Litter-Mixed media type (insert associated MediaTypeUniqueID)',
  `WholePkg_Count` int(11) DEFAULT NULL COMMENT 'If analyzed, count of pieces of whole packaging in this sample',
  `FragLargerThan5mm_Count` int(11) DEFAULT NULL COMMENT 'If analyzed, count of particles >5mm in size',
  `Micro5mmAndSmaller_Count` int(11) DEFAULT NULL COMMENT 'If analyzed, count of particles <5mm in size',
  `WaterEnvType_SelectID` int(11) DEFAULT NULL COMMENT 'Select from dropdown: Great Lake, Inland Lake (>=5ac), Pond (<5ac; <30% vegetated), River (>=15m bankfull width), Stream (<15m bankfull width), Wetland (>=30% vegetated)',
  `SoilMoisture%` int(11) DEFAULT NULL COMMENT 'Estimate % Soil Moisture if sample was collected from soil',
  `StorageLocation` int(11) DEFAULT NULL COMMENT 'Select sample storage location from dropdown menu or add a new location using the button',
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `SampleDetails`
--

INSERT INTO `SampleDetails` (`SampleUniqueID`, `SamplingEvent_Num`, `MediaType_SelectID`, `WholePkg_Count`, `FragLargerThan5mm_Count`, `Micro5mmAndSmaller_Count`, `WaterEnvType_SelectID`, `SoilMoisture%`, `StorageLocation`, `DateEntered`) VALUES
(1, 101, 0, 5, 300, NULL, 0, 0, 0, '2024-12-10 12:00:00'),
(2, 102, 0, 3, 450, NULL, 0, 0, 0, '2024-12-10 13:30:00'),
(3, 103, 0, 2, 520, NULL, 0, 0, 0, '2024-12-11 09:15:00'),
(4, 104, 0, 1, 275, NULL, 0, 0, 0, '2024-12-11 10:45:00'),
(5, 105, 0, 4, 390, NULL, 0, 0, 0, '2024-12-12 08:20:00');

-- --------------------------------------------------------

--
-- Table structure for table `SamplingEvent`
--

CREATE TABLE `SamplingEvent` (
  `SamplingEventUniqueID` int(11) NOT NULL COMMENT 'Location-Date UniqueID to link to all samples on this date at this location',
  `LocationID_Num` int(11) NOT NULL COMMENT 'UniqueID for each mapped location, consistent across dates for repeat measures',
  `SamplingDate` date NOT NULL,
  `UserSamplingID` text NOT NULL COMMENT 'Automatically enter logged-in UserID who is entering data',
  `AirTemp-C` decimal(10,0) DEFAULT NULL COMMENT 'Current air temperature in Celsius',
  `Weather-Current` int(11) DEFAULT NULL COMMENT 'Current weather at time of sampling',
  `Weather-Precedent24` int(11) DEFAULT NULL COMMENT 'Predominant weather pattern in past 24 hours',
  `Rainfall-cm-Precedent24` decimal(10,0) DEFAULT NULL COMMENT 'Rainfall amount in past 24 hours, in centimeters',
  `SamplerNames` text DEFAULT NULL,
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- --------------------------------------------------------

--
-- Table structure for table `StorageLoc_Ref`
--

CREATE TABLE `StorageLoc_Ref` (
  `StorageLocUniqueID` int(11) NOT NULL,
  `StorageLoc_Desc` text NOT NULL,
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `StorageLoc_Ref`
--

INSERT INTO `StorageLoc_Ref` (`StorageLocUniqueID`, `StorageLoc_Desc`, `DateEntered`) VALUES
(1, 'Wayne State University', '2025-05-21 13:36:06'),
(2, 'Ohio State University', '2025-05-21 13:36:06'),
(3, 'User\'s facility (local storage only)', '2025-05-21 13:36:06'),
(4, 'Samples not retained', '2025-05-21 13:36:06');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `User_UniqueID` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`User_UniqueID`, `username`, `email`, `password`, `created_at`) VALUES
(7, 'admin', 'yongtaoyao@wayne.edu', '$2y$10$SkMW7JvaUBY68ghv/8Me..qQxoMPtw6mKcRPaFJCzh83dEeDkZPD6', '2025-05-19 20:56:34');

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
  ADD UNIQUE KEY `SampleUniqueID` (`SampleUniqueID`);

--
-- Indexes for table `SamplingEvent`
--
ALTER TABLE `SamplingEvent`
  ADD UNIQUE KEY `SamplingEventUniqueID` (`SamplingEventUniqueID`);

--
-- Indexes for table `StorageLoc_Ref`
--
ALTER TABLE `StorageLoc_Ref`
  ADD PRIMARY KEY (`StorageLocUniqueID`);

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
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
