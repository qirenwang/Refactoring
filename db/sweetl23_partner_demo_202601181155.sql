-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Jan 18, 2026 at 11:53 PM
-- Server version: 10.3.39-MariaDB
-- PHP Version: 8.1.34

SET FOREIGN_KEY_CHECKS=0;
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
-- Table structure for table `ColorType_Ref`
--

DROP TABLE IF EXISTS `ColorType_Ref`;
CREATE TABLE `ColorType_Ref` (
  `ColorUniqueID` int(11) NOT NULL,
  `Color_Code` varchar(50) NOT NULL,
  `Color_Name` varchar(100) NOT NULL,
  `Color_Set` varchar(50) NOT NULL COMMENT 'Simple (MP) vs Detailed (Packaging)',
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `ColorType_Ref`
--

INSERT INTO `ColorType_Ref` (`ColorUniqueID`, `Color_Code`, `Color_Name`, `Color_Set`, `DateEntered`) VALUES
(1, 'clear', 'Clear', 'Simple', '2026-01-08 23:39:02'),
(2, 'opaque_light', 'Opaque - Light', 'Simple', '2026-01-08 23:39:02'),
(3, 'opaque_dark', 'Opaque - Dark', 'Simple', '2026-01-08 23:39:02'),
(4, 'mixed', 'Mixed', 'Simple', '2026-01-08 23:39:02'),
(5, 'black', 'Black', 'Detailed', '2026-01-08 23:39:02'),
(6, 'blue', 'Blue', 'Detailed', '2026-01-08 23:39:02'),
(7, 'green', 'Green', 'Detailed', '2026-01-08 23:39:02'),
(8, 'pink', 'Pink', 'Detailed', '2026-01-08 23:39:02'),
(9, 'purple', 'Purple', 'Detailed', '2026-01-08 23:39:02'),
(10, 'red', 'Red', 'Detailed', '2026-01-08 23:39:02'),
(11, 'white', 'White', 'Detailed', '2026-01-08 23:39:02'),
(12, 'yellow', 'Yellow', 'Detailed', '2026-01-08 23:39:02'),
(13, 'other', 'Other', 'Detailed', '2026-01-08 23:39:02');

-- --------------------------------------------------------

--
-- Table structure for table `contact_submissions`
--

DROP TABLE IF EXISTS `contact_submissions`;
CREATE TABLE `contact_submissions` (
  `id` int(11) NOT NULL,
  `user_name` varchar(100) NOT NULL,
  `user_email` varchar(255) NOT NULL,
  `user_organization` varchar(200) DEFAULT NULL,
  `question_category` varchar(50) NOT NULL,
  `user_question` text NOT NULL,
  `subscribe_updates` enum('yes','no') DEFAULT 'no',
  `submission_date` datetime NOT NULL DEFAULT current_timestamp(),
  `ip_address` varchar(45) DEFAULT NULL,
  `status` enum('new','in_progress','resolved','closed') DEFAULT 'new',
  `admin_notes` text DEFAULT NULL,
  `resolved_date` datetime DEFAULT NULL,
  `resolved_by` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Form_Ref`
--

DROP TABLE IF EXISTS `Form_Ref`;
CREATE TABLE `Form_Ref` (
  `FormUniqueID` int(11) NOT NULL,
  `Form_Name` varchar(100) NOT NULL,
  `AppliesTo` varchar(100) DEFAULT NULL COMMENT '适用范围: MP, Fragment 等',
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `Form_Ref`
--

INSERT INTO `Form_Ref` (`FormUniqueID`, `Form_Name`, `AppliesTo`, `DateEntered`) VALUES
(1, 'Fiber', 'MP, Fragment', '2026-01-08 23:39:02'),
(2, 'Pellet', 'MP, Fragment', '2026-01-08 23:39:02'),
(3, 'Fragment', 'MP', '2026-01-08 23:39:02'),
(4, 'Film', 'Fragment', '2026-01-08 23:39:02'),
(5, 'Foam', 'Fragment', '2026-01-08 23:39:02'),
(6, 'HardPlastic', 'Fragment', '2026-01-08 23:39:02'),
(7, 'Other', 'Fragment', '2026-01-08 23:39:02');

-- --------------------------------------------------------

--
-- Table structure for table `FragmentsInSample`
--

DROP TABLE IF EXISTS `FragmentsInSample`;
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
  `DateEntered` date NOT NULL DEFAULT current_timestamp(),
  `PercentForm_Other` int(11) DEFAULT NULL COMMENT 'Percentage of other form',
  `Method_Desc` text DEFAULT NULL COMMENT 'Describe method used to estimate percentages'
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `FragmentsInSample`
--

INSERT INTO `FragmentsInSample` (`Fragment_UniqueID`, `SampleDetails_Num`, `PercentColor_Clear`, `PercentColor_Op-Color`, `PercentColor_Op-Dk`, `PercentColor_Mixed`, `PercentForm_Fiber`, `PercentForm_Pellet`, `PercentForm_Film`, `PercentForm_Foam`, `PercentForm_HardPlastic`, `DateEntered`, `PercentForm_Other`, `Method_Desc`) VALUES
(1, 6, 100, NULL, NULL, NULL, 100, NULL, NULL, NULL, NULL, '2025-08-14', NULL, NULL),
(2, 9, NULL, NULL, NULL, NULL, 50, 34, 16, NULL, NULL, '2025-08-15', NULL, NULL),
(3, 14, 50, 48, 2, NULL, NULL, NULL, NULL, NULL, NULL, '2025-08-15', NULL, NULL),
(4, 21, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-08-29', NULL, NULL),
(5, 23, 50, 50, NULL, NULL, 50, 50, NULL, NULL, NULL, '2025-08-29', NULL, NULL),
(6, 32, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-09-30', NULL, NULL),
(7, 51, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-10-28', NULL, NULL),
(8, 52, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-10-28', NULL, NULL),
(9, 53, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-11-17', NULL, NULL),
(10, 54, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-11-17', NULL, NULL),
(11, 57, 50, NULL, NULL, 50, NULL, 50, 50, NULL, NULL, '2025-11-21', NULL, NULL),
(12, 58, 50, NULL, NULL, 50, NULL, 50, 50, NULL, NULL, '2025-12-02', NULL, NULL),
(13, 59, 100, NULL, NULL, NULL, NULL, 100, NULL, NULL, NULL, '2025-12-02', NULL, NULL),
(14, 60, 50, 50, NULL, NULL, NULL, 100, NULL, NULL, NULL, '2025-12-02', NULL, NULL),
(15, 62, 50, 10, 30, 10, 15, 5, 10, 20, 30, '2025-12-14', NULL, NULL),
(16, 63, 50, 10, 30, 10, 15, 5, 10, 20, 30, '2025-12-14', NULL, NULL),
(17, 64, 20, 20, 40, 20, 20, 20, 10, 10, 10, '2025-12-23', NULL, NULL),
(18, 65, 20, 20, 40, 20, 20, 20, 10, 10, 10, '2025-12-23', NULL, NULL),
(19, 66, 50, 10, 20, 20, 20, 10, 3, 10, 3, '2025-12-23', NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `FragmentsPolymerDetails`
--

DROP TABLE IF EXISTS `FragmentsPolymerDetails`;
CREATE TABLE `FragmentsPolymerDetails` (
  `ID` int(11) NOT NULL,
  `Fragment_UniqueID` int(11) NOT NULL,
  `PolymerType_Legacy` varchar(50) DEFAULT NULL,
  `Percentage` int(11) DEFAULT NULL,
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp(),
  `PolymerID_Num` int(11) DEFAULT NULL COMMENT '外键：指向 PolymerType_Ref'
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `FragmentsPolymerDetails`
--

INSERT INTO `FragmentsPolymerDetails` (`ID`, `Fragment_UniqueID`, `PolymerType_Legacy`, `Percentage`, `DateEntered`, `PolymerID_Num`) VALUES
(1, 1, 'PETE', 100, '2025-08-14 18:21:37', 1),
(2, 5, 'PETE', 50, '2025-08-29 12:06:46', 1),
(3, 5, 'HDPE', 50, '2025-08-29 12:06:46', 2),
(4, 11, 'LDPE', 50, '2025-11-21 20:01:56', 4),
(5, 11, 'PP', 50, '2025-11-21 20:01:56', 5),
(6, 12, 'LDPE', 50, '2025-12-02 21:52:38', 4),
(7, 12, 'PP', 50, '2025-12-02 21:52:38', 5),
(8, 13, 'PETE', 100, '2025-12-02 23:16:14', 1),
(9, 14, 'PETE', 50, '2025-12-02 23:21:44', 1),
(10, 14, 'HDPE', 50, '2025-12-02 23:21:44', 2),
(11, 15, 'PETE', 10, '2025-12-14 20:55:14', 1),
(12, 15, 'HDPE', 5, '2025-12-14 20:55:14', 2),
(13, 15, 'PVC', 5, '2025-12-14 20:55:14', 3),
(14, 15, 'LDPE', 10, '2025-12-14 20:55:14', 4),
(15, 15, 'PP', 4, '2025-12-14 20:55:14', 5),
(16, 15, 'PS', 5, '2025-12-14 20:55:14', 6),
(17, 15, 'OTHER', 5, '2025-12-14 20:55:14', 20),
(18, 15, 'PA', 5, '2025-12-14 20:55:14', 7),
(19, 15, 'PC', 6, '2025-12-14 20:55:14', 8),
(20, 15, 'RUBBER', 4, '2025-12-14 20:55:14', 18),
(21, 15, 'PLA', 4, '2025-12-14 20:55:14', 9),
(22, 15, 'ABS', 7, '2025-12-14 20:55:14', 10),
(23, 15, 'EVA', 6, '2025-12-14 20:55:14', 11),
(24, 15, 'PB', 6, '2025-12-14 20:55:14', 12),
(25, 15, 'PE_UHMW', 2, '2025-12-14 20:55:14', 13),
(26, 15, 'PMMA', 3, '2025-12-14 20:55:14', 14),
(27, 15, 'HIPS', 5, '2025-12-14 20:55:14', 15),
(28, 15, 'EPS', 1, '2025-12-14 20:55:14', 16),
(29, 15, 'BITUMEN', 5, '2025-12-14 20:55:14', 19),
(30, 15, 'PAN', 2, '2025-12-14 20:55:14', 17),
(31, 16, 'PETE', 10, '2025-12-14 21:25:29', 1),
(32, 16, 'HDPE', 5, '2025-12-14 21:25:29', 2),
(33, 16, 'PVC', 5, '2025-12-14 21:25:29', 3),
(34, 16, 'LDPE', 10, '2025-12-14 21:25:29', 4),
(35, 16, 'PP', 4, '2025-12-14 21:25:29', 5),
(36, 16, 'PS', 5, '2025-12-14 21:25:29', 6),
(37, 16, 'OTHER', 5, '2025-12-14 21:25:29', 20),
(38, 16, 'PA', 5, '2025-12-14 21:25:29', 7),
(39, 16, 'PC', 6, '2025-12-14 21:25:29', 8),
(40, 16, 'RUBBER', 4, '2025-12-14 21:25:29', 18),
(41, 16, 'PLA', 4, '2025-12-14 21:25:29', 9),
(42, 16, 'ABS', 7, '2025-12-14 21:25:29', 10),
(43, 16, 'EVA', 6, '2025-12-14 21:25:29', 11),
(44, 16, 'PB', 6, '2025-12-14 21:25:29', 12),
(45, 16, 'PE_UHMW', 2, '2025-12-14 21:25:29', 13),
(46, 16, 'PMMA', 3, '2025-12-14 21:25:29', 14),
(47, 16, 'HIPS', 5, '2025-12-14 21:25:29', 15),
(48, 16, 'EPS', 1, '2025-12-14 21:25:29', 16),
(49, 16, 'BITUMEN', 5, '2025-12-14 21:25:29', 19),
(50, 16, 'PAN', 2, '2025-12-14 21:25:29', 17),
(51, 17, 'PETE', 5, '2025-12-23 05:29:36', 1),
(52, 17, 'HDPE', 5, '2025-12-23 05:29:36', 2),
(53, 17, 'PVC', 2, '2025-12-23 05:29:36', 3),
(54, 17, 'LDPE', 3, '2025-12-23 05:29:36', 4),
(55, 17, 'PP', 3, '2025-12-23 05:29:36', 5),
(56, 17, 'PS', 2, '2025-12-23 05:29:36', 6),
(57, 17, 'OTHER', 3, '2025-12-23 05:29:36', 20),
(58, 17, 'PA', 1, '2025-12-23 05:29:36', 7),
(59, 17, 'PC', 5, '2025-12-23 05:29:36', 8),
(60, 17, 'RUBBER', 5, '2025-12-23 05:29:36', 18),
(61, 17, 'PLA', 5, '2025-12-23 05:29:36', 9),
(62, 17, 'ABS', 10, '2025-12-23 05:29:36', 10),
(63, 17, 'EVA', 3, '2025-12-23 05:29:36', 11),
(64, 17, 'PB', 7, '2025-12-23 05:29:36', 12),
(65, 17, 'PE_UHMW', 8, '2025-12-23 05:29:36', 13),
(66, 17, 'PMMA', 9, '2025-12-23 05:29:36', 14),
(67, 17, 'HIPS', 1, '2025-12-23 05:29:36', 15),
(68, 17, 'EPS', 10, '2025-12-23 05:29:36', 16),
(69, 17, 'BITUMEN', 3, '2025-12-23 05:29:36', 19),
(70, 17, 'PAN', 10, '2025-12-23 05:29:36', 17),
(71, 18, 'PETE', 5, '2025-12-23 05:44:14', 1),
(72, 18, 'HDPE', 5, '2025-12-23 05:44:14', 2),
(73, 18, 'PVC', 2, '2025-12-23 05:44:14', 3),
(74, 18, 'LDPE', 3, '2025-12-23 05:44:15', 4),
(75, 18, 'PP', 3, '2025-12-23 05:44:15', 5),
(76, 18, 'PS', 2, '2025-12-23 05:44:15', 6),
(77, 18, 'OTHER', 3, '2025-12-23 05:44:15', 20),
(78, 18, 'PA', 1, '2025-12-23 05:44:15', 7),
(79, 18, 'PC', 5, '2025-12-23 05:44:15', 8),
(80, 18, 'RUBBER', 5, '2025-12-23 05:44:15', 18),
(81, 18, 'PLA', 5, '2025-12-23 05:44:15', 9),
(82, 18, 'ABS', 10, '2025-12-23 05:44:15', 10),
(83, 18, 'EVA', 3, '2025-12-23 05:44:15', 11),
(84, 18, 'PB', 7, '2025-12-23 05:44:15', 12),
(85, 18, 'PE_UHMW', 8, '2025-12-23 05:44:15', 13),
(86, 18, 'PMMA', 9, '2025-12-23 05:44:15', 14),
(87, 18, 'HIPS', 1, '2025-12-23 05:44:15', 15),
(88, 18, 'EPS', 10, '2025-12-23 05:44:15', 16),
(89, 18, 'BITUMEN', 3, '2025-12-23 05:44:15', 19),
(90, 18, 'PAN', 10, '2025-12-23 05:44:15', 17),
(91, 19, 'PETE', 10, '2025-12-23 05:49:14', 1),
(92, 19, 'HDPE', 10, '2025-12-23 05:49:14', 2),
(93, 19, 'PVC', 3, '2025-12-23 05:49:14', 3),
(94, 19, 'LDPE', 2, '2025-12-23 05:49:14', 4),
(95, 19, 'PP', 6, '2025-12-23 05:49:14', 5),
(96, 19, 'PS', 8, '2025-12-23 05:49:14', 6),
(97, 19, 'OTHER', 8, '2025-12-23 05:49:14', 20),
(98, 19, 'PA', 3, '2025-12-23 05:49:14', 7),
(99, 19, 'PC', 2, '2025-12-23 05:49:14', 8),
(100, 19, 'RUBBER', 5, '2025-12-23 05:49:14', 18),
(101, 19, 'PLA', 1, '2025-12-23 05:49:14', 9),
(102, 19, 'ABS', 3, '2025-12-23 05:49:14', 10),
(103, 19, 'EVA', 4, '2025-12-23 05:49:14', 11),
(104, 19, 'PB', 6, '2025-12-23 05:49:14', 12),
(105, 19, 'PE_UHMW', 2, '2025-12-23 05:49:14', 13),
(106, 19, 'PMMA', 4, '2025-12-23 05:49:14', 14),
(107, 19, 'HIPS', 3, '2025-12-23 05:49:14', 15),
(108, 19, 'EPS', 7, '2025-12-23 05:49:14', 16),
(109, 19, 'BITUMEN', 5, '2025-12-23 05:49:14', 19),
(110, 19, 'PAN', 8, '2025-12-23 05:49:14', 17);

-- --------------------------------------------------------

--
-- Table structure for table `Location`
--

DROP TABLE IF EXISTS `Location`;
CREATE TABLE `Location` (
  `Loc_UniqueID` int(11) NOT NULL COMMENT 'Automatically generated unique location identifier to enter into SamplingEvent table based on drop-down menu selection',
  `UserLocID_txt` text DEFAULT NULL COMMENT 'User-defined short text and numbers to ID location, to be displayed in drop-down menu for location selection',
  `LocationName` varchar(255) NOT NULL COMMENT 'Short user-defined name to ID location, to be displayed in drop-down menu for location selection',
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
  `UserCreated` text NOT NULL COMMENT '	Automatically enter logged-in UserID who is entering this location information',
  `LandUseCover` varchar(255) DEFAULT NULL COMMENT 'Land use and land cover selection'
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `Location`
--

INSERT INTO `Location` (`Loc_UniqueID`, `UserLocID_txt`, `LocationName`, `Location_Desc`, `Env-Indoor_SelectID`, `Lat-DecimalDegree`, `Long-DecimalDegree`, `Area-acres`, `StreetAddress`, `City`, `State`, `Country`, `ZipCode`, `LocationType-Environment`, `LocationType-Indoor`, `DateCreated`, `UserCreated`, `LandUseCover`) VALUES
(1, 'Pipe_Outlet_AllenCreek', 'Allen Creek Outlet', 'In pipe at outlet of Allen Creek to Huron River', 1, 42.289879, -83.746010, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-05-19 14:27:59', 'admin', NULL),
(2, 'CB_1st_Ann', 'Catch-Basin First Street at Ann', 'Storm Drain on west side of 1st, south of Ann Street, Ann Arbor', 1, 42.282352, -83.750996, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-05-21 13:49:07', 'admin', NULL),
(3, NULL, 'test1', 'test1', 1, NULL, NULL, NULL, '520 Cobble Creek Curv', 'Newark', 'DE', 'United States', 19702, NULL, NULL, '2025-06-08 20:24:55', 'admin', NULL),
(4, NULL, 'test2', 'desc', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 48200, NULL, NULL, '2025-06-09 11:40:30', 'admin', NULL),
(5, NULL, 'ytest4', 'sdsf', 1, 41.668809, -83.742810, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-06-16 17:43:45', 'admin', NULL),
(6, 'test4', 'test6', 'test5', 1, 44.116892, -83.609135, NULL, NULL, NULL, NULL, NULL, 48201, NULL, NULL, '2025-06-18 11:37:15', 'admin', NULL),
(7, 'GSI', 'test YW', 'Green stormwater infrastructure', 1, 42.483745, -83.131881, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-06-29 22:36:13', 'admin', NULL),
(8, 'GSI', 'test YW2', 'green stormwater infrastructure', 1, 42.718585, -83.197182, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-06-30 09:27:08', 'admin', NULL),
(9, 'qw', 'testQW', 'test test', 1, 42.299405, -83.082701, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-07-10 13:47:54', 'admin', NULL),
(10, 'FI', 'test3', 'Detroit', 1, 42.329959, -83.031794, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-07-11 09:39:41', 'admin', NULL),
(11, 'FI', 'test4', 'Detroit', 1, 42.327293, -83.041171, NULL, NULL, NULL, NULL, NULL, 48127, NULL, NULL, '2025-07-11 10:49:49', 'admin', NULL),
(12, 'FI', 'test 5', 'Detroit', 1, 42.326645, -83.042733, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-07-11 15:11:34', 'admin', NULL),
(13, '7', 'test', 'Detroit', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 48127, NULL, NULL, '2025-07-11 17:59:54', 'admin', NULL),
(14, 'MI-R&IL', 'MI River and Inland Lakes', 'Rivers and inland lakes', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 48169, NULL, NULL, '2025-07-27 13:41:17', 'admin', NULL),
(15, 'Lake', 'Baseline Lake Influent', 'In land lake', 1, 42.410979, -84.063205, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-08-11 22:16:35', 'admin', NULL),
(16, 'river near outfall #51', 'Red jacket park', 'fishing area near CSO', 1, 42.863036, -78.849940, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-08-19 16:23:21', 'BNW2025', NULL),
(17, 'test 6', 'test 6', 'test 6', 1, 43.955260, -84.242483, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-08-20 11:52:40', 'admin', NULL),
(18, 'test', 'test8/29', 'test', 1, 47.381738, -86.395574, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-08-29 10:08:43', 'admin', NULL),
(19, 'test', 'test8/29_2', 'test', 1, 44.000191, -86.897176, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-08-29 10:15:33', 'ktangen', NULL),
(20, 'Lake', 'Test YW10', 'Inland lakes', 1, 49.000000, -65.000000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-09-29 14:53:05', 'admin', NULL),
(21, 'River', 'Detroit', 'Sampling site located along the Detroit River', 1, 42.329766, -83.029019, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-11-11 16:13:30', 'FatimaIqbal', NULL),
(22, 'DET_RIV', 'Detroit River', 'Sampling site located along the Detroit River', 1, 42.326212, -83.042325, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-11-12 15:21:55', 'FatimaIqbal', NULL),
(23, 'LAK_CLR', 'Lake Saint Clair', 'Sample site located in center of Lake Saint Clair', 1, 42.521387, -82.782778, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-11-17 15:12:12', 'FatimaIqbal', NULL),
(24, 'Neighborhood Park', 'Martin Luther Memorial Park', 'MLK Park', 1, 42.351463, -83.105407, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-11-17 15:59:43', 'FatimaIqbal', NULL),
(25, 'MLK Park', 'Martin Luther King Jr. Memorial Park', 'Neighborhood Park', 1, 42.327735, -83.063657, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-11-17 16:10:29', 'FatimaIqbal', NULL),
(26, 'LAK_ONT', 'Lake ontario', 'Sediment sample collected from lake ontario', 1, 43.671348, -78.756509, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-11-17 16:18:16', 'FatimaIqbal', NULL),
(27, 'Huron', 'Lake', 'Sampling site located along the Lake Huron', 1, 43.655391, -82.489359, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-11-21 19:44:26', 'FatimaIqbal', NULL),
(28, 'LAK-ONT', 'LakeOntario', 'Sampling Site located at the center of the lake', 1, 43.400708, -77.541661, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-12-02 23:05:46', 'FatimaIqbal', NULL),
(29, 'LAK-HUR', 'LakeHuron', 'Sampling site located in between the Lake', 1, 44.446328, -82.848559, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-12-02 23:18:53', 'FatimaIqbal', NULL),
(30, 'Park', 'Key Park', 'Sampling location within Oak Park', 1, 42.462149, -83.173021, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-12-02 23:33:26', 'FatimaIqbal', NULL),
(31, 'LHURON', 'Lake Huron', 'Large freshwater lake in the Great Lakes system, located between Michigan (USA) and Ontario (Canada).', 1, 44.790647, -82.024184, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-12-14 12:32:54', 'FatimaIqbal', NULL),
(32, 'LAK_MI', 'Lake Michigan', 'Freshwater lake within the Great Lakes system, bordered by the U.S. states of Michigan, Wisconsin, Illinois, and Indiana.', 1, 43.637353, -86.833292, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-12-14 20:48:22', 'FatimaIqbal', NULL),
(33, 'Lake', 'LAK_MIC', 'Sampling location located at middle of Lake Michigan', 1, 43.439567, -86.560420, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-12-22 14:54:27', 'FatimaIqbal', NULL),
(34, 'LAKE_SED', 'Lake Superior', 'Surface Sediment collected from the nearshore zone of the Lake Superior', 1, 47.295822, -87.378627, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-12-23 05:22:05', 'FatimaIqbal', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `LocType_Env-Indoor_Ref`
--

DROP TABLE IF EXISTS `LocType_Env-Indoor_Ref`;
CREATE TABLE `LocType_Env-Indoor_Ref` (
  `LocTypeUniqueID` int(11) NOT NULL,
  `LocType_Desc` text NOT NULL COMMENT 'Use this and other TBD fields in this table to drive location drop-down menus',
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

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

DROP TABLE IF EXISTS `MediaType_WithinLitterWaterSoil_Ref`;
CREATE TABLE `MediaType_WithinLitterWaterSoil_Ref` (
  `MediaTypeUniqueID` int(11) NOT NULL COMMENT 'Identifier to be inserted into SamplingEvent table upon selection of MediaType from dropdown',
  `MediaTypeOverall` text NOT NULL COMMENT 'Display in drop-down for selection of media type (In Water, In Soil/Sediment, On Soil, Mixed Media)',
  `MediaTypeDetail` text NOT NULL COMMENT 'Describe in greater detail, to be displayed to help in selection',
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

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

DROP TABLE IF EXISTS `MicroplasticsInSample`;
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
  `DateEntered` date NOT NULL DEFAULT current_timestamp(),
  `PercentColor_Clear` int(11) DEFAULT NULL COMMENT 'Percentage of clear color',
  `PercentColor_OpaqueLight` int(11) DEFAULT NULL COMMENT 'Percentage of opaque light color',
  `PercentColor_OpaqueDark` int(11) DEFAULT NULL COMMENT 'Percentage of opaque dark color',
  `PercentColor_Mixed` int(11) DEFAULT NULL COMMENT 'Percentage of mixed color'
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `MicroplasticsInSample`
--

INSERT INTO `MicroplasticsInSample` (`Micro_UniqueID`, `SampleDetails_Num`, `PercentSize_<1um`, `PercentSize_1-20um`, `PercentSize_20-100um`, `PercentSize_100um-1mm`, `PercentSize_1-5mm`, `PercentForm_fiber`, `PercentForm_Pellet`, `PercentForm_Fragment`, `Method_Desc`, `DateEntered`, `PercentColor_Clear`, `PercentColor_OpaqueLight`, `PercentColor_OpaqueDark`, `PercentColor_Mixed`) VALUES
(1, 6, 100, NULL, NULL, NULL, NULL, 97, NULL, NULL, NULL, '2025-08-14', NULL, NULL, NULL, NULL),
(2, 21, NULL, NULL, NULL, NULL, NULL, 20, 50, 30, 'Raman spectroscopy', '2025-08-29', NULL, NULL, NULL, NULL),
(3, 22, 50, NULL, 40, 10, 0, 40, 50, 10, NULL, '2025-08-29', NULL, NULL, NULL, NULL),
(4, 23, NULL, 50, NULL, 50, NULL, 50, NULL, 50, NULL, '2025-08-29', NULL, NULL, NULL, NULL),
(5, 32, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-09-30', NULL, NULL, NULL, NULL),
(6, 51, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-10-28', NULL, NULL, NULL, NULL),
(7, 52, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-10-28', NULL, NULL, NULL, NULL),
(8, 53, 1, 2, 1, 2, 94, NULL, NULL, NULL, NULL, '2025-11-17', NULL, NULL, NULL, NULL),
(9, 54, 1, 2, 1, 2, 94, NULL, NULL, NULL, NULL, '2025-11-17', NULL, NULL, NULL, NULL),
(10, 57, 50, 50, NULL, NULL, NULL, 50, 50, NULL, NULL, '2025-11-21', NULL, NULL, NULL, NULL),
(11, 58, 50, 50, NULL, NULL, NULL, 50, 50, NULL, NULL, '2025-12-02', 50, NULL, NULL, 50),
(12, 59, 20, 40, 40, NULL, NULL, 50, 30, 20, NULL, '2025-12-02', NULL, NULL, NULL, NULL),
(13, 60, NULL, 40, 30, 30, NULL, 30, 10, 60, NULL, '2025-12-02', NULL, NULL, NULL, NULL),
(14, 62, 10, 20, 30, 20, 20, 30, 50, 20, NULL, '2025-12-14', NULL, NULL, NULL, NULL),
(15, 63, 10, 20, 30, 20, 20, 30, 50, 20, NULL, '2025-12-14', NULL, NULL, NULL, NULL),
(16, 64, 10, 15, 60, 10, 5, 20, 60, 20, NULL, '2025-12-23', NULL, NULL, NULL, NULL),
(17, 65, 10, 15, 60, 10, 5, 20, 60, 20, NULL, '2025-12-23', NULL, NULL, NULL, NULL),
(18, 66, 10, 20, 40, 10, 20, 20, 30, 50, NULL, '2025-12-23', NULL, NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `MicroplasticsPolymerDetails`
--

DROP TABLE IF EXISTS `MicroplasticsPolymerDetails`;
CREATE TABLE `MicroplasticsPolymerDetails` (
  `ID` int(11) NOT NULL,
  `Micro_UniqueID` int(11) NOT NULL,
  `PolymerType_Legacy` varchar(50) DEFAULT NULL,
  `Percentage` int(11) DEFAULT NULL,
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp(),
  `PolymerID_Num` int(11) DEFAULT NULL COMMENT '外键：指向 PolymerType_Ref'
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `MicroplasticsPolymerDetails`
--

INSERT INTO `MicroplasticsPolymerDetails` (`ID`, `Micro_UniqueID`, `PolymerType_Legacy`, `Percentage`, `DateEntered`, `PolymerID_Num`) VALUES
(1, 1, 'PETE', 100, '2025-08-14 18:21:37', 1),
(2, 2, 'PETE', 96, '2025-08-29 10:40:37', 1),
(3, 2, 'OTHER', 4, '2025-08-29 10:40:37', 20),
(4, 3, 'PETE', 60, '2025-08-29 10:48:40', 1),
(5, 3, 'PA', 40, '2025-08-29 10:48:40', 7),
(6, 4, 'PETE', 50, '2025-08-29 12:06:46', 1),
(7, 4, 'PVC', 50, '2025-08-29 12:06:46', 3),
(8, 5, 'OTHER', 60, '2025-09-30 14:53:08', 20),
(9, 5, 'RUBBER', 5, '2025-09-30 14:53:08', 18),
(10, 5, 'HIPS', 20, '2025-09-30 14:53:08', 15),
(11, 5, 'EPS', 5, '2025-09-30 14:53:08', 16),
(12, 5, 'BITUMEN', 10, '2025-09-30 14:53:08', 19),
(13, 10, 'PETE', 50, '2025-11-21 20:01:56', 1),
(14, 10, 'HDPE', 50, '2025-11-21 20:01:56', 2),
(15, 11, 'PETE', 50, '2025-12-02 21:52:37', 1),
(16, 11, 'HDPE', 50, '2025-12-02 21:52:37', 2),
(17, 12, 'PETE', 20, '2025-12-02 23:16:14', 1),
(18, 12, 'HDPE', 10, '2025-12-02 23:16:14', 2),
(19, 12, 'PVC', 40, '2025-12-02 23:16:14', 3),
(20, 12, 'PP', 30, '2025-12-02 23:16:14', 5),
(21, 13, 'PETE', 20, '2025-12-02 23:21:44', 1),
(22, 13, 'HDPE', 40, '2025-12-02 23:21:44', 2),
(23, 13, 'PVC', 20, '2025-12-02 23:21:44', 3),
(24, 13, 'LDPE', 20, '2025-12-02 23:21:44', 4),
(25, 14, 'PETE', 5, '2025-12-14 20:55:14', 1),
(26, 14, 'HDPE', 8, '2025-12-14 20:55:14', 2),
(27, 14, 'PVC', 2, '2025-12-14 20:55:14', 3),
(28, 14, 'LDPE', 4, '2025-12-14 20:55:14', 4),
(29, 14, 'PP', 4, '2025-12-14 20:55:14', 5),
(30, 14, 'PS', 10, '2025-12-14 20:55:14', 6),
(31, 14, 'OTHER', 8, '2025-12-14 20:55:14', 20),
(32, 14, 'PA', 3, '2025-12-14 20:55:14', 7),
(33, 14, 'PC', 2, '2025-12-14 20:55:14', 8),
(34, 14, 'RUBBER', 5, '2025-12-14 20:55:14', 18),
(35, 14, 'PLA', 6, '2025-12-14 20:55:14', 9),
(36, 14, 'ABS', 5, '2025-12-14 20:55:14', 10),
(37, 14, 'EVA', 4, '2025-12-14 20:55:14', 11),
(38, 14, 'PB', 4, '2025-12-14 20:55:14', 12),
(39, 14, 'PE_UHMW', 3, '2025-12-14 20:55:14', 13),
(40, 14, 'PMMA', 8, '2025-12-14 20:55:14', 14),
(41, 14, 'HIPS', 5, '2025-12-14 20:55:14', 15),
(42, 14, 'EPS', 5, '2025-12-14 20:55:14', 16),
(43, 14, 'BITUMEN', 4, '2025-12-14 20:55:14', 19),
(44, 14, 'PAN', 5, '2025-12-14 20:55:14', 17),
(45, 15, 'PETE', 5, '2025-12-14 21:25:29', 1),
(46, 15, 'HDPE', 8, '2025-12-14 21:25:29', 2),
(47, 15, 'PVC', 2, '2025-12-14 21:25:29', 3),
(48, 15, 'LDPE', 4, '2025-12-14 21:25:29', 4),
(49, 15, 'PP', 4, '2025-12-14 21:25:29', 5),
(50, 15, 'PS', 10, '2025-12-14 21:25:29', 6),
(51, 15, 'OTHER', 8, '2025-12-14 21:25:29', 20),
(52, 15, 'PA', 3, '2025-12-14 21:25:29', 7),
(53, 15, 'PC', 2, '2025-12-14 21:25:29', 8),
(54, 15, 'RUBBER', 5, '2025-12-14 21:25:29', 18),
(55, 15, 'PLA', 6, '2025-12-14 21:25:29', 9),
(56, 15, 'ABS', 5, '2025-12-14 21:25:29', 10),
(57, 15, 'EVA', 4, '2025-12-14 21:25:29', 11),
(58, 15, 'PB', 4, '2025-12-14 21:25:29', 12),
(59, 15, 'PE_UHMW', 3, '2025-12-14 21:25:29', 13),
(60, 15, 'PMMA', 8, '2025-12-14 21:25:29', 14),
(61, 15, 'HIPS', 5, '2025-12-14 21:25:29', 15),
(62, 15, 'EPS', 5, '2025-12-14 21:25:29', 16),
(63, 15, 'BITUMEN', 4, '2025-12-14 21:25:29', 19),
(64, 15, 'PAN', 5, '2025-12-14 21:25:29', 17),
(65, 16, 'PETE', 4, '2025-12-23 05:29:36', 1),
(66, 16, 'HDPE', 4, '2025-12-23 05:29:36', 2),
(67, 16, 'PVC', 8, '2025-12-23 05:29:36', 3),
(68, 16, 'LDPE', 6, '2025-12-23 05:29:36', 4),
(69, 16, 'PP', 10, '2025-12-23 05:29:36', 5),
(70, 16, 'PS', 5, '2025-12-23 05:29:36', 6),
(71, 16, 'OTHER', 5, '2025-12-23 05:29:36', 20),
(72, 16, 'PA', 9, '2025-12-23 05:29:36', 7),
(73, 16, 'PC', 12, '2025-12-23 05:29:36', 8),
(74, 16, 'RUBBER', 5, '2025-12-23 05:29:36', 18),
(75, 16, 'PLA', 5, '2025-12-23 05:29:36', 9),
(76, 16, 'ABS', 2, '2025-12-23 05:29:36', 10),
(77, 16, 'EVA', 4, '2025-12-23 05:29:36', 11),
(78, 16, 'PB', 3, '2025-12-23 05:29:36', 12),
(79, 16, 'PE_UHMW', 2, '2025-12-23 05:29:36', 13),
(80, 16, 'PMMA', 1, '2025-12-23 05:29:36', 14),
(81, 16, 'HIPS', 4, '2025-12-23 05:29:36', 15),
(82, 16, 'EPS', 4, '2025-12-23 05:29:36', 16),
(83, 16, 'BITUMEN', 5, '2025-12-23 05:29:36', 19),
(84, 16, 'PAN', 2, '2025-12-23 05:29:36', 17),
(85, 17, 'PETE', 4, '2025-12-23 05:44:14', 1),
(86, 17, 'HDPE', 4, '2025-12-23 05:44:14', 2),
(87, 17, 'PVC', 8, '2025-12-23 05:44:14', 3),
(88, 17, 'LDPE', 6, '2025-12-23 05:44:14', 4),
(89, 17, 'PP', 10, '2025-12-23 05:44:14', 5),
(90, 17, 'PS', 5, '2025-12-23 05:44:14', 6),
(91, 17, 'OTHER', 5, '2025-12-23 05:44:14', 20),
(92, 17, 'PA', 9, '2025-12-23 05:44:14', 7),
(93, 17, 'PC', 12, '2025-12-23 05:44:14', 8),
(94, 17, 'RUBBER', 5, '2025-12-23 05:44:14', 18),
(95, 17, 'PLA', 5, '2025-12-23 05:44:14', 9),
(96, 17, 'ABS', 2, '2025-12-23 05:44:14', 10),
(97, 17, 'EVA', 4, '2025-12-23 05:44:14', 11),
(98, 17, 'PB', 3, '2025-12-23 05:44:14', 12),
(99, 17, 'PE_UHMW', 2, '2025-12-23 05:44:14', 13),
(100, 17, 'PMMA', 1, '2025-12-23 05:44:14', 14),
(101, 17, 'HIPS', 4, '2025-12-23 05:44:14', 15),
(102, 17, 'EPS', 4, '2025-12-23 05:44:14', 16),
(103, 17, 'BITUMEN', 5, '2025-12-23 05:44:14', 19),
(104, 17, 'PAN', 2, '2025-12-23 05:44:14', 17),
(105, 18, 'PETE', 5, '2025-12-23 05:49:14', 1),
(106, 18, 'HDPE', 5, '2025-12-23 05:49:14', 2),
(107, 18, 'PVC', 5, '2025-12-23 05:49:14', 3),
(108, 18, 'LDPE', 5, '2025-12-23 05:49:14', 4),
(109, 18, 'PP', 5, '2025-12-23 05:49:14', 5),
(110, 18, 'PS', 5, '2025-12-23 05:49:14', 6),
(111, 18, 'OTHER', 5, '2025-12-23 05:49:14', 20),
(112, 18, 'PA', 5, '2025-12-23 05:49:14', 7),
(113, 18, 'PC', 5, '2025-12-23 05:49:14', 8),
(114, 18, 'RUBBER', 5, '2025-12-23 05:49:14', 18),
(115, 18, 'PLA', 5, '2025-12-23 05:49:14', 9),
(116, 18, 'ABS', 5, '2025-12-23 05:49:14', 10),
(117, 18, 'EVA', 5, '2025-12-23 05:49:14', 11),
(118, 18, 'PB', 5, '2025-12-23 05:49:14', 12),
(119, 18, 'PE_UHMW', 5, '2025-12-23 05:49:14', 13),
(120, 18, 'PMMA', 5, '2025-12-23 05:49:14', 14),
(121, 18, 'HIPS', 5, '2025-12-23 05:49:14', 15),
(122, 18, 'EPS', 5, '2025-12-23 05:49:14', 16),
(123, 18, 'BITUMEN', 5, '2025-12-23 05:49:14', 19),
(124, 18, 'PAN', 5, '2025-12-23 05:49:14', 17);

-- --------------------------------------------------------

--
-- Table structure for table `PackageCategoryDetails`
--

DROP TABLE IF EXISTS `PackageCategoryDetails`;
CREATE TABLE `PackageCategoryDetails` (
  `DetailID` int(11) NOT NULL,
  `SampleDetails_Num` int(11) NOT NULL COMMENT 'Link to SampleDetails',
  `PurposeCategory` varchar(50) NOT NULL COMMENT 'Category: single_use, multi_use, other_container, bag, packing, other_purpose, unknown_purpose',
  `CategoryCount` int(11) DEFAULT 0 COMMENT 'Total count for this category',
  `RecycleCode_0` int(11) DEFAULT 0 COMMENT 'Count of Unknown recycle code',
  `RecycleCode_1` int(11) DEFAULT 0 COMMENT 'Count of PET (#1)',
  `RecycleCode_2` int(11) DEFAULT 0 COMMENT 'Count of HDPE (#2)',
  `RecycleCode_3` int(11) DEFAULT 0 COMMENT 'Count of PVC (#3)',
  `RecycleCode_4` int(11) DEFAULT 0 COMMENT 'Count of LDPE (#4)',
  `RecycleCode_5` int(11) DEFAULT 0 COMMENT 'Count of PP (#5)',
  `RecycleCode_6` int(11) DEFAULT 0 COMMENT 'Count of PS (#6)',
  `RecycleCode_7` int(11) DEFAULT 0 COMMENT 'Count of Other (#7)',
  `Color_Clear` int(11) DEFAULT 0,
  `Color_Black` int(11) DEFAULT 0,
  `Color_Blue` int(11) DEFAULT 0,
  `Color_Green` int(11) DEFAULT 0,
  `Color_Pink` int(11) DEFAULT 0,
  `Color_Purple` int(11) DEFAULT 0,
  `Color_Red` int(11) DEFAULT 0,
  `Color_White` int(11) DEFAULT 0,
  `Color_Yellow` int(11) DEFAULT 0,
  `Color_Other` int(11) DEFAULT 0,
  `Opacity_Clear` int(11) DEFAULT 0,
  `Opacity_Light` int(11) DEFAULT 0 COMMENT 'Opaque-Light',
  `Opacity_Dark` int(11) DEFAULT 0 COMMENT 'Opaque-Dark',
  `Opacity_Mixed` int(11) DEFAULT 0,
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `PackageColors`
--

DROP TABLE IF EXISTS `PackageColors`;
CREATE TABLE `PackageColors` (
  `PackageColorsUniqueID` int(11) NOT NULL COMMENT 'Automatically assign',
  `PackageDetails_Num` int(11) NOT NULL COMMENT 'Unique_ID linked to PackageDetails',
  `PackageColor` text CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL COMMENT 'Choose from drop-down menu driven by PackageColor_Ref',
  `DateEntered` date NOT NULL DEFAULT current_timestamp() COMMENT 'Enter automatically'
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- --------------------------------------------------------

--
-- Table structure for table `PackageDetails`
--

DROP TABLE IF EXISTS `PackageDetails`;
CREATE TABLE `PackageDetails` (
  `PackageDetailsUniqueID` int(11) NOT NULL COMMENT 'Automatically assign',
  `PackagesInSample_Num` int(11) NOT NULL COMMENT 'Unique_ID linked to PackagesInSample',
  `CountCode_1PETE` int(10) DEFAULT NULL COMMENT 'Count items of #1 Recycle code PETE',
  `CountCode_2HDPE` int(11) DEFAULT NULL COMMENT 'Count items of #2 Recycle code HDPE',
  `CountCode_3PVC` int(11) DEFAULT NULL COMMENT 'Count items of #3 Recycle code PVC',
  `CountCode_4LDPE` int(11) DEFAULT NULL COMMENT 'Count items of #4 Recycle code LDPE',
  `CountCode_5PP` int(11) DEFAULT NULL COMMENT 'Count items of #5 Recycle code PP',
  `CountCode_6PS` int(11) DEFAULT NULL COMMENT 'Count items of #6 Recycle code PS',
  `CountCode_7Other` int(11) DEFAULT NULL COMMENT 'Count items of #7 Recycle code OTHER',
  `CountCode_Unknown` int(11) DEFAULT NULL COMMENT 'Count items of unknown Recycle code',
  `CountColorType_Clear` int(11) DEFAULT NULL COMMENT 'Count number of items of color opacity type: Clear',
  `CountColorType_Opaque-Lt` int(11) DEFAULT NULL COMMENT 'Count number of items of color opacity type: Opaque-light',
  `CountColorType_Opaque-Dk` int(11) DEFAULT NULL COMMENT 'Count number of items of color opacity type: Opaque-dark',
  `CountColorType_Mixed` int(11) DEFAULT NULL COMMENT 'Count number of items of color opacity type: Mixed',
  `DateEntered` date NOT NULL DEFAULT current_timestamp() COMMENT 'Enter automatically'
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- --------------------------------------------------------

--
-- Table structure for table `PackagesInSample`
--

DROP TABLE IF EXISTS `PackagesInSample`;
CREATE TABLE `PackagesInSample` (
  `PackagesInSampleUniqueID` int(11) NOT NULL COMMENT 'Automatically assign',
  `SampleDetails_Num` int(11) NOT NULL COMMENT 'Unique_ID linked to SampleDetails',
  `Purpose_SelectID` int(11) DEFAULT NULL COMMENT 'Select general purpose of this set of packaging items from drop-down list',
  `Purpose_Count` int(11) DEFAULT NULL COMMENT 'Total number of items collected of this purpose',
  `DateEntered` date NOT NULL DEFAULT current_timestamp() COMMENT 'Enter automatically'
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `PackagesInSample`
--

INSERT INTO `PackagesInSample` (`PackagesInSampleUniqueID`, `SampleDetails_Num`, `Purpose_SelectID`, `Purpose_Count`, `DateEntered`) VALUES
(1, 6, NULL, NULL, '2025-12-23'),
(2, 7, NULL, NULL, '2025-12-23'),
(3, 10, NULL, NULL, '2025-12-23'),
(4, 21, NULL, NULL, '2025-12-23'),
(5, 22, NULL, NULL, '2025-12-23'),
(6, 22, NULL, NULL, '2025-12-23'),
(7, 22, NULL, NULL, '2025-12-23'),
(8, 22, NULL, NULL, '2025-12-23'),
(9, 22, NULL, NULL, '2025-12-23'),
(10, 23, NULL, NULL, '2025-12-23'),
(11, 23, NULL, NULL, '2025-12-23'),
(12, 32, NULL, NULL, '2025-12-23'),
(13, 32, NULL, NULL, '2025-12-23'),
(14, 32, NULL, NULL, '2025-12-23'),
(15, 32, NULL, NULL, '2025-12-23'),
(16, 32, NULL, NULL, '2025-12-23'),
(17, 33, NULL, NULL, '2025-12-23'),
(18, 34, NULL, NULL, '2025-12-23'),
(19, 35, NULL, NULL, '2025-12-23'),
(20, 39, NULL, NULL, '2025-12-23'),
(21, 40, NULL, NULL, '2025-12-23'),
(22, 41, NULL, NULL, '2025-12-23'),
(23, 42, NULL, NULL, '2025-12-23'),
(24, 43, NULL, NULL, '2025-12-23'),
(25, 44, NULL, NULL, '2025-12-23'),
(26, 45, NULL, NULL, '2025-12-23'),
(27, 47, NULL, NULL, '2025-12-23'),
(28, 48, NULL, NULL, '2025-12-23'),
(29, 49, NULL, NULL, '2025-12-23'),
(30, 50, NULL, NULL, '2025-12-23'),
(31, 51, NULL, NULL, '2025-12-23'),
(32, 52, NULL, NULL, '2025-12-23'),
(33, 53, NULL, NULL, '2025-12-23'),
(34, 54, NULL, NULL, '2025-12-23'),
(35, 57, NULL, NULL, '2025-12-23'),
(36, 57, NULL, NULL, '2025-12-23'),
(37, 58, NULL, NULL, '2025-12-23'),
(38, 58, NULL, NULL, '2025-12-23'),
(39, 61, NULL, NULL, '2025-12-23'),
(40, 61, NULL, NULL, '2025-12-23'),
(41, 61, NULL, NULL, '2025-12-23'),
(42, 61, NULL, NULL, '2025-12-23'),
(43, 62, NULL, NULL, '2025-12-23'),
(44, 62, NULL, NULL, '2025-12-23'),
(45, 63, NULL, NULL, '2025-12-23'),
(46, 63, NULL, NULL, '2025-12-23');

-- --------------------------------------------------------

--
-- Table structure for table `password_reset_tokens`
--

DROP TABLE IF EXISTS `password_reset_tokens`;
CREATE TABLE `password_reset_tokens` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `email` varchar(100) NOT NULL,
  `token` varchar(64) NOT NULL,
  `expires_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `used` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `password_reset_tokens`
--

INSERT INTO `password_reset_tokens` (`id`, `user_id`, `email`, `token`, `expires_at`, `used`, `created_at`) VALUES
(7, 4, 'hw5667@wayne.edu', 'c0a219391ba752620447b99bdc13f895a618e57d978dad60dc06c0dfc74571c6', '2025-11-12 02:53:39', 0, '2025-11-11 20:53:39');

-- --------------------------------------------------------

--
-- Table structure for table `PolymerType_Ref`
--

DROP TABLE IF EXISTS `PolymerType_Ref`;
CREATE TABLE `PolymerType_Ref` (
  `PolymerUniqueID` int(11) NOT NULL,
  `Polymer_Code` varchar(50) NOT NULL COMMENT '简写代码，如 PETE',
  `Polymer_FullName` varchar(255) NOT NULL COMMENT '全称',
  `RecycleCode` int(11) DEFAULT NULL COMMENT '回收标识码 (1-7)',
  `Category` varchar(50) DEFAULT 'Synthetic' COMMENT '分类 (Synthetic, Rubber, etc.)',
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `PolymerType_Ref`
--

INSERT INTO `PolymerType_Ref` (`PolymerUniqueID`, `Polymer_Code`, `Polymer_FullName`, `RecycleCode`, `Category`, `DateEntered`) VALUES
(1, 'PETE', 'Polyethylene Terephthalate', 1, 'Synthetic', '2026-01-08 23:39:02'),
(2, 'HDPE', 'High-Density Polyethylene', 2, 'Synthetic', '2026-01-08 23:39:02'),
(3, 'PVC', 'Polyvinyl Chloride', 3, 'Synthetic', '2026-01-08 23:39:02'),
(4, 'LDPE', 'Low-Density Polyethylene', 4, 'Synthetic', '2026-01-08 23:39:02'),
(5, 'PP', 'Polypropylene', 5, 'Synthetic', '2026-01-08 23:39:02'),
(6, 'PS', 'Polystyrene', 6, 'Synthetic', '2026-01-08 23:39:02'),
(7, 'PA', 'Polyamide / Nylon', NULL, 'Synthetic', '2026-01-08 23:39:02'),
(8, 'PC', 'Polycarbonate', NULL, 'Synthetic', '2026-01-08 23:39:02'),
(9, 'PLA', 'Polylactic Acid', NULL, 'Synthetic', '2026-01-08 23:39:02'),
(10, 'ABS', 'Acrylonitrile Butadiene Styrene', NULL, 'Synthetic', '2026-01-08 23:39:02'),
(11, 'EVA', 'Ethylene-vinyl Acetate', NULL, 'Synthetic', '2026-01-08 23:39:02'),
(12, 'PB', 'Polybutylene', NULL, 'Synthetic', '2026-01-08 23:39:02'),
(13, 'PE_UHMW', 'Ultra-high-molecular-weight Polyethylene', NULL, 'Synthetic', '2026-01-08 23:39:02'),
(14, 'PMMA', 'Polymethyl Methacrylate/Acrylic/Plexiglass', NULL, 'Synthetic', '2026-01-08 23:39:02'),
(15, 'HIPS', 'High Impact Polystyrene', NULL, 'Synthetic', '2026-01-08 23:39:02'),
(16, 'EPS', 'Expanded Polystyrene', NULL, 'Synthetic', '2026-01-08 23:39:02'),
(17, 'PAN', 'Polyacrylonitrile', NULL, 'Synthetic', '2026-01-08 23:39:02'),
(18, 'Rubber', 'Synthetic Rubber', NULL, 'Rubber', '2026-01-08 23:39:02'),
(19, 'Bitumen', 'Bitumen/Asphalt', NULL, 'Bituminous', '2026-01-08 23:39:02'),
(20, 'Other', 'Other (specify in method)', 7, 'Other', '2026-01-08 23:39:02');

-- --------------------------------------------------------

--
-- Table structure for table `Purpose_Ref`
--

DROP TABLE IF EXISTS `Purpose_Ref`;
CREATE TABLE `Purpose_Ref` (
  `PurposeUniqueID` int(11) NOT NULL,
  `Purpose_Code` varchar(50) NOT NULL,
  `Purpose_Name` varchar(255) NOT NULL,
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp(),
  `Purpose_Desc` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `Purpose_Ref`
--

INSERT INTO `Purpose_Ref` (`PurposeUniqueID`, `Purpose_Code`, `Purpose_Name`, `DateEntered`, `Purpose_Desc`) VALUES
(1, 'single_use', 'Single-Use Food/Beverage Container', '2026-01-08 23:39:03', 'Containers intended for one-time use'),
(2, 'multi_use', 'Multi-Use Food/Beverage Container', '2026-01-08 23:39:03', 'Containers intended for repeated use'),
(3, 'other_container', 'Other Container', '2026-01-08 23:39:03', 'Other types of containers'),
(4, 'bag', 'Bag', '2026-01-08 23:39:03', 'Plastic bags'),
(5, 'packing', 'Packing Materials', '2026-01-08 23:39:03', 'Packing peanuts, wrap, etc.'),
(6, 'other_purpose', 'Other', '2026-01-08 23:39:03', 'Other purposes'),
(7, 'unknown_purpose', 'Unknown purpose', '2026-01-08 23:39:03', 'Unknown purpose');

-- --------------------------------------------------------

--
-- Table structure for table `RamanDetails`
--

DROP TABLE IF EXISTS `RamanDetails`;
CREATE TABLE `RamanDetails` (
  `Raman_UniqueID` int(11) NOT NULL,
  `SampleDetails_Num` int(11) NOT NULL,
  `Wavelength` int(11) NOT NULL COMMENT 'Select from the drop-down the wavelength used to obtain this Raman spectra',
  `DateEntered` date DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- --------------------------------------------------------

--
-- Table structure for table `SampleDetails`
--

DROP TABLE IF EXISTS `SampleDetails`;
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
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp(),
  `MediaSubType` varchar(100) DEFAULT NULL COMMENT 'Specific media subtype (water_type, sediment_type, etc.)',
  `WaterTypeOtherDescription` text DEFAULT NULL COMMENT 'Description when water type is Other',
  `SedimentTypeOtherDescription` text DEFAULT NULL COMMENT 'Description when sediment type is Other',
  `MediaAdditionalNotes` text DEFAULT NULL COMMENT 'Additional notes specific to the media type',
  `LandscapeType` varchar(100) DEFAULT NULL COMMENT 'Landscape type for soil/surface samples',
  `MixedMediaDescription` text DEFAULT NULL COMMENT 'Description of mixed media composition',
  `VolumeSampled` decimal(10,3) DEFAULT NULL COMMENT 'Volume sampled in liters',
  `WaterDepth` decimal(10,2) DEFAULT NULL COMMENT 'Water depth in meters',
  `SampleWaterDepth` decimal(10,2) DEFAULT NULL COMMENT 'Water depth where sample is collected (m)',
  `FlowVelocity` decimal(10,2) DEFAULT NULL COMMENT 'Water flow velocity',
  `SuspendedSolids` decimal(10,2) DEFAULT NULL COMMENT 'Total suspended solids mg/L',
  `Conductivity` decimal(10,2) DEFAULT NULL COMMENT 'Conductivity uS/cm',
  `Turbidity` decimal(10,2) DEFAULT NULL COMMENT 'Turbidity in NTU',
  `DissolvedOxygen` decimal(10,2) DEFAULT NULL COMMENT 'Dissolved oxygen in mg/L',
  `SoilDryWeight` decimal(10,2) DEFAULT NULL COMMENT 'Soil dry weight in grams',
  `SoilOrganicMatter` decimal(5,2) DEFAULT NULL COMMENT 'Soil organic matter percentage',
  `SoilSand` decimal(5,2) DEFAULT NULL COMMENT 'Soil sand percentage',
  `SoilSilt` decimal(5,2) DEFAULT NULL COMMENT 'Soil silt percentage',
  `SoilClay` decimal(5,2) DEFAULT NULL COMMENT 'Soil clay percentage',
  `SurfaceAreaSampled` decimal(10,4) DEFAULT NULL COMMENT 'Area sampled in km² for surface samples',
  `PermeableSurfaces` decimal(5,2) DEFAULT NULL COMMENT 'Percentage of permeable surfaces',
  `ImpermeableSurfaces` decimal(5,2) DEFAULT NULL COMMENT 'Percentage of impermeable surfaces',
  `ReplicatesCount` int(11) DEFAULT NULL COMMENT 'Number of replicates',
  `MicroplasticsSampleAmount` decimal(10,3) DEFAULT NULL COMMENT 'Sample amount for microplastics',
  `MicroplasticsSampleUnit` varchar(20) DEFAULT NULL COMMENT 'Unit for microplastics sample amount',
  `FragmentsSampleAmount` decimal(10,3) DEFAULT NULL COMMENT 'Sample amount for fragments',
  `FragmentsSampleUnit` varchar(20) DEFAULT NULL COMMENT 'Unit for fragments sample amount',
  `PackagingSampleAmount` decimal(10,3) DEFAULT NULL COMMENT 'Sample amount for packaging',
  `PackagingSampleUnit` varchar(20) DEFAULT NULL COMMENT 'Unit for packaging sample amount',
  `SamplingDepth` decimal(10,2) DEFAULT NULL COMMENT 'Depth of sample collection in meters'
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `SampleDetails`
--

INSERT INTO `SampleDetails` (`SampleUniqueID`, `SamplingEvent_Num`, `MediaType_SelectID`, `WholePkg_Count`, `FragLargerThan5mm_Count`, `Micro5mmAndSmaller_Count`, `WaterEnvType_SelectID`, `SoilMoisture%`, `StorageLocation`, `DateEntered`, `MediaSubType`, `WaterTypeOtherDescription`, `SedimentTypeOtherDescription`, `MediaAdditionalNotes`, `LandscapeType`, `MixedMediaDescription`, `VolumeSampled`, `WaterDepth`, `SampleWaterDepth`, `FlowVelocity`, `SuspendedSolids`, `Conductivity`, `Turbidity`, `DissolvedOxygen`, `SoilDryWeight`, `SoilOrganicMatter`, `SoilSand`, `SoilSilt`, `SoilClay`, `SurfaceAreaSampled`, `PermeableSurfaces`, `ImpermeableSurfaces`, `ReplicatesCount`, `MicroplasticsSampleAmount`, `MicroplasticsSampleUnit`, `FragmentsSampleAmount`, `FragmentsSampleUnit`, `PackagingSampleAmount`, `PackagingSampleUnit`, `SamplingDepth`) VALUES
(6, 1, 1, 1, 1, 1, NULL, NULL, 1, '2025-08-14 18:21:37', 'stormwater', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, 1.000, 'L', 1.000, 'g', 1.000, 'km2', NULL),
(7, 2, 2, 1, NULL, NULL, NULL, NULL, 1, '2025-08-15 00:35:09', 'river_stream', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2.000, 'L', NULL),
(8, 3, 3, NULL, NULL, NULL, NULL, NULL, 1, '2025-08-15 02:33:16', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(9, 4, 2, NULL, 1, NULL, NULL, NULL, 1, '2025-08-15 03:28:54', 'river_stream', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(10, 5, 1, 1, NULL, NULL, NULL, NULL, 1, '2025-08-15 05:15:34', 'river_stream', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(11, 6, 1, NULL, NULL, NULL, NULL, NULL, 1, '2025-08-15 19:43:05', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(12, 7, 2, NULL, NULL, NULL, NULL, NULL, 1, '2025-08-15 19:43:38', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(13, 8, 2, NULL, NULL, NULL, NULL, NULL, 1, '2025-08-15 19:43:58', 'sludge_wastewater', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(14, 9, 1, NULL, 1, NULL, NULL, NULL, 1, '2025-08-15 19:52:05', 'lake', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(15, 10, 1, NULL, NULL, NULL, NULL, NULL, 1, '2025-08-19 16:36:21', 'river_stream', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(16, 11, 2, NULL, NULL, NULL, NULL, NULL, 1, '2025-08-25 11:22:02', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(17, 12, 2, NULL, NULL, NULL, NULL, NULL, 1, '2025-08-25 11:26:36', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(18, 13, 2, NULL, NULL, NULL, NULL, NULL, 1, '2025-08-29 10:18:03', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(19, 14, 2, NULL, NULL, NULL, NULL, NULL, 1, '2025-08-29 10:18:19', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(20, 15, 1, 1, 4, 2, NULL, NULL, 1, '2025-08-29 10:18:22', 'river_stream', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2.000, 'L', 3.000, 'km2', 3.000, 'km2', NULL),
(21, 16, 1, 1, 20, 70, NULL, NULL, 1, '2025-08-29 10:40:37', 'lake', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1.000, 'L', 1.000, 'L', NULL, 'L', NULL),
(22, 17, 1, 5, 0, 100, NULL, NULL, 1, '2025-08-29 10:48:40', 'river_stream', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1.000, 'L', NULL, NULL, 10.000, 'L', NULL),
(23, 18, 1, 2, 2, 2, NULL, NULL, 1, '2025-08-29 12:06:46', 'river_stream', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0.15, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 4.000, 'L', 4.000, 'km2', 4.000, 'km2', NULL),
(24, 19, 1, NULL, NULL, NULL, NULL, NULL, 1, '2025-08-29 12:09:27', 'lake', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(25, 20, 1, NULL, NULL, NULL, NULL, NULL, 1, '2025-08-29 12:10:47', 'drinking_water_raw', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(26, 21, 2, NULL, NULL, NULL, NULL, NULL, 1, '2025-08-29 12:11:30', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(27, 22, 2, NULL, NULL, NULL, NULL, NULL, 1, '2025-08-29 12:12:16', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(28, 23, 2, NULL, NULL, NULL, NULL, NULL, 1, '2025-08-29 12:12:58', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(29, 24, 1, NULL, NULL, NULL, NULL, NULL, 1, '2025-08-29 12:16:02', 'lake', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(30, 25, 1, NULL, NULL, NULL, NULL, NULL, 1, '2025-08-29 12:16:06', 'lake', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(31, 26, 2, NULL, NULL, NULL, NULL, NULL, 1, '2025-08-29 16:03:01', 'river_stream', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(32, 27, 1, 5, 10, 100, NULL, NULL, 1, '2025-09-30 14:53:08', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1.000, 'L', 1.000, 'L', 10.000, 'L', NULL),
(33, 28, 1, 1, NULL, NULL, NULL, NULL, 1, '2025-10-14 14:27:46', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(34, 29, 1, 1, NULL, NULL, NULL, NULL, 1, '2025-10-14 15:27:10', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(35, 30, 1, 1, NULL, NULL, NULL, NULL, 1, '2025-10-14 15:27:36', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(36, 31, 1, NULL, NULL, NULL, NULL, NULL, 1, '2025-10-14 15:34:30', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(37, 32, 1, NULL, NULL, NULL, NULL, NULL, 1, '2025-10-14 15:38:04', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(38, 33, 2, NULL, NULL, NULL, NULL, NULL, 1, '2025-10-14 15:39:37', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(39, 34, 1, 1, NULL, NULL, NULL, NULL, 1, '2025-10-14 16:04:08', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1.000, 'L', NULL),
(40, 35, 1, 1, NULL, NULL, NULL, NULL, 1, '2025-10-14 16:04:08', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1.000, 'L', NULL),
(41, 36, 1, 1, NULL, NULL, NULL, NULL, 1, '2025-10-14 16:06:49', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1.000, 'L', NULL),
(42, 38, 1, 1, NULL, NULL, NULL, NULL, 1, '2025-10-14 16:11:35', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1.000, 'L', NULL),
(43, 39, 1, 1, NULL, NULL, NULL, NULL, 1, '2025-10-14 16:11:35', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1.000, 'L', NULL),
(44, 40, 2, 1, NULL, NULL, NULL, NULL, 1, '2025-10-14 16:16:04', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1.000, 'g', NULL),
(45, 41, 2, 1, NULL, NULL, NULL, NULL, 1, '2025-10-14 16:16:04', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1.000, 'g', NULL),
(46, 42, 1, NULL, NULL, NULL, NULL, NULL, 1, '2025-10-14 16:18:16', 'river_stream', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(47, 43, 1, 1, NULL, NULL, NULL, NULL, 1, '2025-10-14 16:23:46', 'river_stream', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1.000, 'L', NULL),
(48, 44, 1, 1, NULL, NULL, NULL, NULL, 1, '2025-10-14 16:23:50', 'river_stream', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1.000, 'L', NULL),
(49, 45, 1, 1, NULL, NULL, NULL, NULL, 1, '2025-10-15 23:45:55', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1.000, 'L', NULL),
(50, 46, 1, 1, NULL, NULL, NULL, NULL, 1, '2025-10-15 23:46:00', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1.000, 'L', NULL),
(51, 47, 1, 1, 1, 1, NULL, NULL, 1, '2025-10-28 13:59:58', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1.000, 'L', 1.000, 'L', 1.000, 'L', NULL),
(52, 48, 1, 1, 1, 1, NULL, NULL, 1, '2025-10-28 14:00:00', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1.000, 'L', 1.000, 'L', 1.000, 'L', NULL),
(53, 49, 1, 1, 1, 1, NULL, NULL, 1, '2025-11-17 13:47:13', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1.000, 'L', 1.000, 'L', 1.000, 'L', NULL),
(54, 50, 1, 1, 1, 1, NULL, NULL, 1, '2025-11-17 13:47:24', 'pond', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1.000, 'L', 1.000, 'L', 1.000, 'L', NULL),
(55, 51, 1, NULL, NULL, NULL, NULL, NULL, 1, '2025-11-17 14:11:31', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(56, 52, 1, NULL, NULL, NULL, NULL, NULL, 1, '2025-11-17 14:16:44', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
(57, 53, 1, 2, 2, 2, 6, NULL, 1, '2025-11-21 20:01:56', 'lake', NULL, NULL, NULL, NULL, NULL, 20.000, 1.00, NULL, 1.40, 85.00, 80.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 5.000, 'L', 5.000, 'L', 5.000, 'km2', NULL),
(58, 54, 1, 2, 2, 2, 6, NULL, 1, '2025-12-02 21:52:37', 'lake', NULL, NULL, NULL, NULL, NULL, 20.000, 1.00, NULL, 1.40, 85.00, 80.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 5.000, 'L', 5.000, 'L', 5.000, 'km2', NULL),
(59, 55, 1, NULL, 1, 10, 6, NULL, 1, '2025-12-02 23:16:14', NULL, NULL, NULL, NULL, NULL, NULL, 15.000, 1.40, NULL, 1.00, 100.00, 90.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2.000, 'L', 2.000, 'L', NULL, NULL, NULL),
(60, 56, 1, NULL, 2, 15, 6, NULL, 1, '2025-12-02 23:21:44', 'lake', NULL, NULL, NULL, NULL, NULL, 30.000, 1.50, NULL, 1.00, 100.00, 90.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2.000, 'L', 2.000, 'L', NULL, NULL, NULL),
(61, 57, 3, 4, NULL, NULL, NULL, NULL, 1, '2025-12-02 23:40:31', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 5.000, 'km2', NULL),
(62, 58, 1, 2, 10, 14, 6, NULL, 1, '2025-12-14 20:55:14', 'lake', NULL, NULL, NULL, NULL, NULL, 40.000, 0.50, NULL, 1.00, 40.00, 100.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 5.000, 'L', 5.000, 'L', 15.000, 'km2', NULL),
(63, 59, 1, 2, 10, 14, 6, NULL, 1, '2025-12-14 21:25:29', 'lake', NULL, NULL, NULL, NULL, NULL, 40.000, 0.50, NULL, 1.00, 40.00, 100.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 5.000, 'L', 5.000, 'L', 15.000, 'km2', NULL),
(64, 60, 2, NULL, 15, 10, NULL, 25, 1, '2025-12-23 05:29:36', 'lake', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 50.00, 3.00, 40.00, 40.00, 20.00, NULL, NULL, NULL, NULL, 14.000, 'g', 5.000, 'g', NULL, NULL, NULL),
(65, 61, 2, NULL, 15, 10, NULL, 25, 1, '2025-12-23 05:44:14', 'lake', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 50.00, 3.00, 40.00, 40.00, 20.00, NULL, NULL, NULL, NULL, 14.000, 'g', 5.000, 'g', NULL, NULL, NULL),
(66, 62, 2, NULL, 20, 30, NULL, NULL, 1, '2025-12-23 05:49:14', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 5.000, 'g', 10.000, 'g', NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `SamplingEvent`
--

DROP TABLE IF EXISTS `SamplingEvent`;
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
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp(),
  `DeviceInstallationPeriod` enum('no','yes') DEFAULT 'no' COMMENT 'Whether sample came from device installed for a period',
  `DeviceStartDate` date DEFAULT NULL COMMENT 'Device installation start date',
  `DeviceEndDate` date DEFAULT NULL COMMENT 'Device removal/end date',
  `SampleTime` time DEFAULT NULL COMMENT 'Collection time',
  `WeatherPrecedent24` int(11) DEFAULT NULL COMMENT 'Precedent 24 hour weather pattern',
  `AdditionalNotes` text DEFAULT NULL COMMENT 'Additional notes from review page'
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `SamplingEvent`
--

INSERT INTO `SamplingEvent` (`SamplingEventUniqueID`, `LocationID_Num`, `SamplingDate`, `UserSamplingID`, `AirTemp-C`, `Weather-Current`, `Weather-Precedent24`, `Rainfall-cm-Precedent24`, `SamplerNames`, `DateEntered`, `DeviceInstallationPeriod`, `DeviceStartDate`, `DeviceEndDate`, `SampleTime`, `WeatherPrecedent24`, `AdditionalNotes`) VALUES
(1, 1, '2025-08-07', '1', NULL, NULL, NULL, NULL, NULL, '2025-08-14 18:21:37', 'no', NULL, NULL, NULL, NULL, NULL),
(2, 15, '2025-08-07', '1', NULL, NULL, NULL, NULL, NULL, '2025-08-15 00:35:09', 'no', NULL, NULL, NULL, NULL, NULL),
(3, 1, '2025-08-01', '1', NULL, NULL, NULL, NULL, NULL, '2025-08-15 02:33:16', 'no', NULL, NULL, NULL, NULL, NULL),
(4, 15, '2025-08-07', '1', NULL, NULL, NULL, NULL, NULL, '2025-08-15 03:28:54', 'no', NULL, NULL, NULL, NULL, NULL),
(5, 15, '2025-08-01', '1', NULL, NULL, NULL, NULL, NULL, '2025-08-15 05:15:34', 'no', NULL, NULL, NULL, NULL, NULL),
(6, 14, '2025-07-29', '1', NULL, NULL, NULL, NULL, NULL, '2025-08-15 19:43:05', 'no', NULL, NULL, NULL, NULL, NULL),
(7, 1, '2025-08-06', '1', NULL, NULL, NULL, NULL, NULL, '2025-08-15 19:43:38', 'no', NULL, NULL, NULL, NULL, NULL),
(8, 1, '2025-08-06', '1', NULL, NULL, NULL, NULL, NULL, '2025-08-15 19:43:58', 'no', NULL, NULL, NULL, NULL, NULL),
(9, 14, '2025-07-31', '1', NULL, NULL, NULL, NULL, NULL, '2025-08-15 19:52:05', 'no', NULL, NULL, NULL, NULL, NULL),
(10, 16, '2025-08-19', '2', 75, 3, NULL, 0, NULL, '2025-08-19 16:36:21', 'no', NULL, NULL, NULL, NULL, NULL),
(11, 15, '2025-08-06', '1', NULL, NULL, NULL, NULL, NULL, '2025-08-25 11:22:02', 'no', NULL, NULL, NULL, NULL, NULL),
(12, 15, '2025-08-06', '1', NULL, NULL, NULL, NULL, NULL, '2025-08-25 11:26:36', 'no', NULL, NULL, NULL, NULL, NULL),
(13, 9, '2025-08-07', '3', NULL, NULL, NULL, NULL, NULL, '2025-08-29 10:18:03', 'no', NULL, NULL, NULL, NULL, NULL),
(14, 9, '2025-08-07', '3', NULL, NULL, NULL, NULL, NULL, '2025-08-29 10:18:19', 'no', NULL, NULL, NULL, NULL, NULL),
(15, 12, '2025-08-22', '4', 25, 2, NULL, NULL, NULL, '2025-08-29 10:18:22', 'no', NULL, NULL, NULL, NULL, NULL),
(16, 14, '2025-07-30', '1', 32, 1, NULL, 0, 'Grab water samples', '2025-08-29 10:40:37', 'no', NULL, NULL, NULL, NULL, NULL),
(17, 14, '2025-07-30', '1', NULL, NULL, NULL, NULL, NULL, '2025-08-29 10:48:40', 'no', NULL, NULL, NULL, NULL, NULL),
(18, 12, '2025-08-21', '4', 23, 2, NULL, NULL, NULL, '2025-08-29 12:06:46', 'no', NULL, NULL, NULL, NULL, NULL),
(19, 11, '2025-08-01', '4', NULL, NULL, NULL, NULL, NULL, '2025-08-29 12:09:27', 'no', NULL, NULL, NULL, NULL, NULL),
(20, 11, '2025-08-08', '4', 25, 2, NULL, NULL, NULL, '2025-08-29 12:10:47', 'no', NULL, NULL, NULL, NULL, NULL),
(21, 11, '2025-08-08', '4', NULL, NULL, NULL, NULL, NULL, '2025-08-29 12:11:30', 'no', NULL, NULL, NULL, NULL, NULL),
(22, 11, '2025-08-08', '4', NULL, NULL, NULL, NULL, NULL, '2025-08-29 12:12:16', 'no', NULL, NULL, NULL, NULL, NULL),
(23, 11, '2025-08-08', '4', NULL, NULL, NULL, NULL, NULL, '2025-08-29 12:12:58', 'no', NULL, NULL, NULL, NULL, NULL),
(24, 11, '2025-08-21', '4', 23, NULL, NULL, NULL, NULL, '2025-08-29 12:16:02', 'no', NULL, NULL, NULL, NULL, NULL),
(25, 11, '2025-08-21', '4', NULL, NULL, NULL, NULL, NULL, '2025-08-29 12:16:06', 'no', NULL, NULL, NULL, NULL, NULL),
(26, 12, '2025-08-29', '1', NULL, NULL, NULL, NULL, NULL, '2025-08-29 16:03:01', 'no', NULL, NULL, NULL, NULL, NULL),
(27, 1, '2025-09-30', '1', NULL, NULL, NULL, NULL, NULL, '2025-09-30 14:53:08', 'no', NULL, NULL, NULL, NULL, NULL),
(28, 15, '2025-10-14', '1', NULL, NULL, NULL, NULL, NULL, '2025-10-14 14:27:46', 'no', NULL, NULL, NULL, NULL, NULL),
(29, 13, '2025-10-14', '1', NULL, NULL, NULL, NULL, NULL, '2025-10-14 15:27:10', 'no', NULL, NULL, NULL, NULL, NULL),
(30, 13, '2025-10-14', '1', NULL, NULL, NULL, NULL, NULL, '2025-10-14 15:27:36', 'no', NULL, NULL, NULL, NULL, NULL),
(31, 14, '2025-10-14', '1', NULL, NULL, NULL, NULL, NULL, '2025-10-14 15:34:30', 'no', NULL, NULL, NULL, NULL, NULL),
(32, 1, '2025-10-14', '1', NULL, NULL, NULL, NULL, NULL, '2025-10-14 15:38:03', 'no', NULL, NULL, NULL, NULL, NULL),
(33, 15, '2025-10-14', '1', NULL, NULL, NULL, NULL, NULL, '2025-10-14 15:39:37', 'no', NULL, NULL, NULL, NULL, NULL),
(34, 2, '2025-10-14', '1', NULL, NULL, NULL, NULL, NULL, '2025-10-14 16:04:08', 'no', NULL, NULL, NULL, NULL, NULL),
(35, 2, '2025-10-14', '1', NULL, NULL, NULL, NULL, NULL, '2025-10-14 16:04:08', 'no', NULL, NULL, NULL, NULL, NULL),
(36, 15, '2025-10-14', '1', 12, NULL, NULL, NULL, NULL, '2025-10-14 16:06:49', 'no', NULL, NULL, NULL, NULL, NULL),
(37, 15, '2025-10-14', '1', 12, NULL, NULL, NULL, NULL, '2025-10-14 16:06:49', 'no', NULL, NULL, NULL, NULL, NULL),
(38, 15, '2025-10-14', '1', 11, NULL, NULL, NULL, NULL, '2025-10-14 16:11:35', 'no', NULL, NULL, NULL, NULL, NULL),
(39, 15, '2025-10-14', '1', 11, NULL, NULL, NULL, NULL, '2025-10-14 16:11:35', 'no', NULL, NULL, NULL, NULL, NULL),
(40, 15, '2025-10-14', '1', 11, NULL, NULL, NULL, NULL, '2025-10-14 16:16:04', 'no', NULL, NULL, NULL, NULL, NULL),
(41, 15, '2025-10-14', '1', 11, NULL, NULL, NULL, NULL, '2025-10-14 16:16:04', 'no', NULL, NULL, NULL, NULL, NULL),
(42, 15, '2025-10-14', '1', 14, NULL, NULL, NULL, NULL, '2025-10-14 16:18:16', 'no', NULL, NULL, NULL, NULL, NULL),
(43, 15, '2025-10-14', '1', NULL, NULL, NULL, NULL, NULL, '2025-10-14 16:23:46', 'no', NULL, NULL, NULL, NULL, NULL),
(44, 15, '2025-10-14', '1', NULL, NULL, NULL, NULL, NULL, '2025-10-14 16:23:50', 'no', NULL, NULL, NULL, NULL, NULL),
(45, 15, '2025-10-15', '1', 14, NULL, NULL, NULL, NULL, '2025-10-15 23:45:54', 'no', NULL, NULL, NULL, NULL, NULL),
(46, 15, '2025-10-15', '1', 14, NULL, NULL, NULL, NULL, '2025-10-15 23:45:59', 'no', NULL, NULL, NULL, NULL, NULL),
(47, 1, '2025-10-28', '1', 12, NULL, NULL, NULL, NULL, '2025-10-28 13:59:58', 'no', NULL, NULL, NULL, NULL, NULL),
(48, 1, '2025-10-28', '1', 12, NULL, NULL, NULL, NULL, '2025-10-28 14:00:00', 'no', NULL, NULL, NULL, NULL, NULL),
(49, 15, '2025-11-17', '1', 13, NULL, NULL, NULL, NULL, '2025-11-17 13:47:13', 'no', NULL, NULL, NULL, NULL, NULL),
(50, 15, '2025-11-17', '1', 13, NULL, NULL, NULL, NULL, '2025-11-17 13:47:24', 'no', NULL, NULL, NULL, NULL, NULL),
(51, 15, '2025-11-18', '1', NULL, NULL, NULL, NULL, NULL, '2025-11-17 14:11:31', 'no', NULL, NULL, NULL, NULL, NULL),
(52, 15, '2025-11-18', '1', NULL, NULL, NULL, NULL, NULL, '2025-11-17 14:16:44', 'no', NULL, NULL, NULL, NULL, NULL),
(53, 27, '2025-11-13', '6', 23, 1, NULL, NULL, NULL, '2025-11-21 20:01:56', 'no', NULL, NULL, '08:00:00', NULL, NULL),
(54, 27, '2025-12-02', '1', 23, 1, NULL, NULL, NULL, '2025-12-02 21:52:37', 'no', NULL, NULL, '21:48:00', NULL, NULL),
(55, 28, '2025-12-01', '6', 20, 1, NULL, NULL, NULL, '2025-12-02 23:16:14', 'no', NULL, NULL, '23:05:00', NULL, NULL),
(56, 29, '2025-12-01', '6', 20, 1, NULL, NULL, NULL, '2025-12-02 23:21:44', 'no', NULL, NULL, NULL, NULL, NULL),
(57, 30, '2025-12-01', '6', 10, 2, NULL, NULL, NULL, '2025-12-02 23:40:31', 'no', NULL, NULL, '13:35:00', NULL, NULL),
(58, 32, '2025-11-12', '6', 18, 1, NULL, NULL, NULL, '2025-12-14 20:55:14', 'no', NULL, NULL, '12:00:00', NULL, NULL),
(59, 32, '2025-11-12', '6', 18, 1, NULL, NULL, NULL, '2025-12-14 21:25:29', 'no', NULL, NULL, '12:00:00', NULL, NULL),
(60, 34, '2025-12-03', '6', 10, 2, NULL, NULL, NULL, '2025-12-23 05:29:36', 'no', NULL, NULL, '09:26:00', NULL, NULL),
(61, 34, '2025-12-03', '6', 10, 2, NULL, NULL, NULL, '2025-12-23 05:44:14', 'no', NULL, NULL, '09:26:00', NULL, NULL),
(62, 34, '2025-12-03', '6', 19, 1, NULL, NULL, NULL, '2025-12-23 05:49:14', 'no', NULL, NULL, '09:26:00', NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `SizeClass_Ref`
--

DROP TABLE IF EXISTS `SizeClass_Ref`;
CREATE TABLE `SizeClass_Ref` (
  `SizeUniqueID` int(11) NOT NULL,
  `Size_Code` varchar(50) NOT NULL,
  `Size_Label` varchar(50) NOT NULL COMMENT '显示标签，如 < 1 μm',
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `SizeClass_Ref`
--

INSERT INTO `SizeClass_Ref` (`SizeUniqueID`, `Size_Code`, `Size_Label`, `DateEntered`) VALUES
(1, 'lt_1um', '< 1 μm', '2026-01-08 23:39:02'),
(2, '1_20um', '1 - 20 μm', '2026-01-08 23:39:02'),
(3, '20_100um', '20 - 100 μm', '2026-01-08 23:39:02'),
(4, '100um_1mm', '100 μm - 1 mm', '2026-01-08 23:39:02'),
(5, '1_5mm', '1 - 5 mm', '2026-01-08 23:39:02');

-- --------------------------------------------------------

--
-- Table structure for table `StorageLoc_Ref`
--

DROP TABLE IF EXISTS `StorageLoc_Ref`;
CREATE TABLE `StorageLoc_Ref` (
  `StorageLocUniqueID` int(11) NOT NULL,
  `StorageLoc_Desc` text NOT NULL,
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

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

DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `User_UniqueID` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `first_name` varchar(50) DEFAULT NULL,
  `last_name` varchar(50) DEFAULT NULL,
  `organization` varchar(100) DEFAULT NULL,
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

INSERT INTO `users` (`User_UniqueID`, `username`, `email`, `password`, `first_name`, `last_name`, `organization`, `role`, `is_active`, `email_verified`, `password_reset_token`, `password_reset_expires`, `last_login`, `created_at`, `updated_at`) VALUES
(1, 'admin', 'yongtao@udel.edu', '$2a$12$QEb/dp8TPoVHrkWVKP7nyu7MZMnG3WPDfP0vjZRQr0smnIfwJpAU.', NULL, NULL, 'Wayne State Database Development Team', 'user', 1, 0, NULL, NULL, NULL, '2025-08-14 13:23:42', '2025-12-23 15:46:49'),
(2, 'BNW2025', 'rcoady@bnwaterkeeper.org', '$2a$12$vxYaLykhr4IXE9Dn.UKNAODjedZyOHZ38WHIeFLiqooEFbmUb3Yva', NULL, NULL, 'Buffalo Niagara Waterkeeper', 'user', 1, 0, NULL, NULL, NULL, '2025-08-19 16:04:03', '2025-12-23 15:47:58'),
(3, 'wangqisen1998', 'hp4198@wayne.edu', '$2a$12$FtZzggBH12lC5yzTf/Tdh.vQaqrF5at/80hwnOr8fXybaXBqcGeYy', NULL, NULL, 'Wayne State Database Development Team', 'user', 1, 0, NULL, NULL, NULL, '2025-08-29 10:06:32', '2025-12-23 15:47:06'),
(4, 'fatima0313', 'hw5667@wayne.edu', '$2a$12$4nmtsYML4jDtNVboRf8VbOoHRwgvPWOKCJ9dzIlHFwlIrKNhqQ/Ba', NULL, NULL, 'Wayne State Database Development Team', 'user', 1, 0, NULL, NULL, NULL, '2025-08-29 10:08:57', '2025-12-23 15:47:17'),
(5, 'ktangen', 'hs6653@wayne.edu', '$2a$12$Ib/mqzPHEAs5t.E7s.VIwetmOX3dlBIQ0iurPHBtoxeVVVHIV5ivG', NULL, NULL, 'Wayne State Database Development Team', 'user', 1, 0, NULL, NULL, NULL, '2025-08-29 10:13:37', '2025-12-23 15:47:28'),
(6, 'FatimaIqbal', 'fatimaiqbal0313@gmail.com', '$2a$12$MvRz7G.8H7BeJk.NPB5pDuwQGyspmrpt2ioE2vUA8AhWeFKjdVldC', NULL, NULL, 'Wayne State Database Development Team', 'user', 1, 0, NULL, NULL, NULL, '2025-11-11 15:57:45', '2025-12-23 15:47:39');

-- --------------------------------------------------------

--
-- Table structure for table `WaterEnvType_Ref`
--

DROP TABLE IF EXISTS `WaterEnvType_Ref`;
CREATE TABLE `WaterEnvType_Ref` (
  `WaterEnv_UniqueID` int(11) NOT NULL,
  `WaterEnv_Name` text NOT NULL COMMENT 'Populate dropdown with: Ocean/Sea, Great Lake, Inland Lake (>=5ac), Pond (<5ac; <30% vegetated), River (>=15m bankfull width), Stream (<15m bankfull width), Wetland (>=30% vegetated)',
  `WaterEnv_Desc` text NOT NULL COMMENT 'Explain definition (see user manual)',
  `DateEntered` date NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

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

DROP TABLE IF EXISTS `Wavelength_Ref`;
CREATE TABLE `Wavelength_Ref` (
  `Wavelength_UniqueID` int(11) NOT NULL,
  `WavelengthRange` text NOT NULL,
  `DateEntered` date DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

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

DROP TABLE IF EXISTS `WeatherType_Ref`;
CREATE TABLE `WeatherType_Ref` (
  `WeatherUniqueID` int(11) NOT NULL,
  `WeatherType` text NOT NULL,
  `WeatherDescription` text NOT NULL,
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

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
-- Indexes for table `ColorType_Ref`
--
ALTER TABLE `ColorType_Ref`
  ADD PRIMARY KEY (`ColorUniqueID`);

--
-- Indexes for table `contact_submissions`
--
ALTER TABLE `contact_submissions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_submission_date` (`submission_date`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_category` (`question_category`),
  ADD KEY `idx_email` (`user_email`);

--
-- Indexes for table `Form_Ref`
--
ALTER TABLE `Form_Ref`
  ADD PRIMARY KEY (`FormUniqueID`);

--
-- Indexes for table `FragmentsInSample`
--
ALTER TABLE `FragmentsInSample`
  ADD PRIMARY KEY (`Fragment_UniqueID`),
  ADD KEY `idx_fragments_sample` (`SampleDetails_Num`);

--
-- Indexes for table `FragmentsPolymerDetails`
--
ALTER TABLE `FragmentsPolymerDetails`
  ADD PRIMARY KEY (`ID`),
  ADD KEY `FK_FragmentPolymer_Fragment` (`Fragment_UniqueID`),
  ADD KEY `FK_Fragment_Polymer` (`PolymerID_Num`);

--
-- Indexes for table `Location`
--
ALTER TABLE `Location`
  ADD PRIMARY KEY (`Loc_UniqueID`),
  ADD UNIQUE KEY `UniqueLocID` (`Loc_UniqueID`),
  ADD UNIQUE KEY `LocationName` (`LocationName`),
  ADD KEY `FK_Location_Type` (`Env-Indoor_SelectID`);

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
  ADD PRIMARY KEY (`Micro_UniqueID`),
  ADD KEY `idx_microplastics_sample` (`SampleDetails_Num`);

--
-- Indexes for table `MicroplasticsPolymerDetails`
--
ALTER TABLE `MicroplasticsPolymerDetails`
  ADD PRIMARY KEY (`ID`),
  ADD KEY `FK_MicroPolymer_Micro` (`Micro_UniqueID`),
  ADD KEY `FK_Micro_Polymer` (`PolymerID_Num`);

--
-- Indexes for table `PackageCategoryDetails`
--
ALTER TABLE `PackageCategoryDetails`
  ADD PRIMARY KEY (`DetailID`),
  ADD KEY `idx_sample_details` (`SampleDetails_Num`),
  ADD KEY `idx_purpose_category` (`PurposeCategory`);

--
-- Indexes for table `PackageColors`
--
ALTER TABLE `PackageColors`
  ADD UNIQUE KEY `ParticleDetailsUniqueID` (`PackageColorsUniqueID`),
  ADD KEY `idx_packages_sample` (`PackageDetails_Num`);

--
-- Indexes for table `PackageDetails`
--
ALTER TABLE `PackageDetails`
  ADD UNIQUE KEY `ParticleDetailsUniqueID` (`PackageDetailsUniqueID`),
  ADD KEY `idx_packages_sample` (`PackagesInSample_Num`);

--
-- Indexes for table `PackagesInSample`
--
ALTER TABLE `PackagesInSample`
  ADD UNIQUE KEY `ParticleDetailsUniqueID` (`PackagesInSampleUniqueID`),
  ADD KEY `idx_packages_sample` (`SampleDetails_Num`),
  ADD KEY `FK_Pkg_Purpose` (`Purpose_SelectID`);

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
-- Indexes for table `PolymerType_Ref`
--
ALTER TABLE `PolymerType_Ref`
  ADD PRIMARY KEY (`PolymerUniqueID`),
  ADD UNIQUE KEY `Unique_Polymer_Code` (`Polymer_Code`);

--
-- Indexes for table `Purpose_Ref`
--
ALTER TABLE `Purpose_Ref`
  ADD PRIMARY KEY (`PurposeUniqueID`),
  ADD UNIQUE KEY `Unique_Purpose_Name` (`Purpose_Name`);

--
-- Indexes for table `RamanDetails`
--
ALTER TABLE `RamanDetails`
  ADD KEY `FK_Raman_Sample` (`SampleDetails_Num`),
  ADD KEY `FK_Raman_Wave` (`Wavelength`);

--
-- Indexes for table `SampleDetails`
--
ALTER TABLE `SampleDetails`
  ADD UNIQUE KEY `SampleUniqueID` (`SampleUniqueID`),
  ADD KEY `idx_sampledetails_event` (`SamplingEvent_Num`),
  ADD KEY `FK_Sample_Media` (`MediaType_SelectID`),
  ADD KEY `FK_Sample_WaterEnv` (`WaterEnvType_SelectID`),
  ADD KEY `FK_Sample_Storage` (`StorageLocation`);

--
-- Indexes for table `SamplingEvent`
--
ALTER TABLE `SamplingEvent`
  ADD UNIQUE KEY `SamplingEventUniqueID` (`SamplingEventUniqueID`),
  ADD KEY `idx_samplingevent_location` (`LocationID_Num`),
  ADD KEY `idx_samplingevent_date` (`SamplingDate`);

--
-- Indexes for table `SizeClass_Ref`
--
ALTER TABLE `SizeClass_Ref`
  ADD PRIMARY KEY (`SizeUniqueID`);

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
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `idx_username` (`username`),
  ADD KEY `idx_email` (`email`),
  ADD KEY `idx_active` (`is_active`);

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
-- AUTO_INCREMENT for table `ColorType_Ref`
--
ALTER TABLE `ColorType_Ref`
  MODIFY `ColorUniqueID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT for table `contact_submissions`
--
ALTER TABLE `contact_submissions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `Form_Ref`
--
ALTER TABLE `Form_Ref`
  MODIFY `FormUniqueID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `FragmentsPolymerDetails`
--
ALTER TABLE `FragmentsPolymerDetails`
  MODIFY `ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=111;

--
-- AUTO_INCREMENT for table `Location`
--
ALTER TABLE `Location`
  MODIFY `Loc_UniqueID` int(11) NOT NULL AUTO_INCREMENT COMMENT 'Automatically generated unique location identifier to enter into SamplingEvent table based on drop-down menu selection', AUTO_INCREMENT=37;

--
-- AUTO_INCREMENT for table `MicroplasticsPolymerDetails`
--
ALTER TABLE `MicroplasticsPolymerDetails`
  MODIFY `ID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=125;

--
-- AUTO_INCREMENT for table `PackageCategoryDetails`
--
ALTER TABLE `PackageCategoryDetails`
  MODIFY `DetailID` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `PolymerType_Ref`
--
ALTER TABLE `PolymerType_Ref`
  MODIFY `PolymerUniqueID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=41;

--
-- AUTO_INCREMENT for table `Purpose_Ref`
--
ALTER TABLE `Purpose_Ref`
  MODIFY `PurposeUniqueID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT for table `SizeClass_Ref`
--
ALTER TABLE `SizeClass_Ref`
  MODIFY `SizeUniqueID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `User_UniqueID` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `FragmentsInSample`
--
ALTER TABLE `FragmentsInSample`
  ADD CONSTRAINT `FK_Frag_Sample` FOREIGN KEY (`SampleDetails_Num`) REFERENCES `SampleDetails` (`SampleUniqueID`);

--
-- Constraints for table `FragmentsPolymerDetails`
--
ALTER TABLE `FragmentsPolymerDetails`
  ADD CONSTRAINT `FK_Fragment_Polymer` FOREIGN KEY (`PolymerID_Num`) REFERENCES `PolymerType_Ref` (`PolymerUniqueID`);

--
-- Constraints for table `Location`
--
ALTER TABLE `Location`
  ADD CONSTRAINT `FK_Location_Type` FOREIGN KEY (`Env-Indoor_SelectID`) REFERENCES `LocType_Env-Indoor_Ref` (`LocTypeUniqueID`);

--
-- Constraints for table `MicroplasticsInSample`
--
ALTER TABLE `MicroplasticsInSample`
  ADD CONSTRAINT `FK_Micro_Sample` FOREIGN KEY (`SampleDetails_Num`) REFERENCES `SampleDetails` (`SampleUniqueID`);

--
-- Constraints for table `MicroplasticsPolymerDetails`
--
ALTER TABLE `MicroplasticsPolymerDetails`
  ADD CONSTRAINT `FK_Micro_Polymer` FOREIGN KEY (`PolymerID_Num`) REFERENCES `PolymerType_Ref` (`PolymerUniqueID`);

--
-- Constraints for table `PackagesInSample`
--
ALTER TABLE `PackagesInSample`
  ADD CONSTRAINT `FK_Pkg_Purpose` FOREIGN KEY (`Purpose_SelectID`) REFERENCES `Purpose_Ref` (`PurposeUniqueID`),
  ADD CONSTRAINT `FK_Pkg_Sample` FOREIGN KEY (`SampleDetails_Num`) REFERENCES `SampleDetails` (`SampleUniqueID`);

--
-- Constraints for table `RamanDetails`
--
ALTER TABLE `RamanDetails`
  ADD CONSTRAINT `FK_Raman_Sample` FOREIGN KEY (`SampleDetails_Num`) REFERENCES `SampleDetails` (`SampleUniqueID`),
  ADD CONSTRAINT `FK_Raman_Wave` FOREIGN KEY (`Wavelength`) REFERENCES `Wavelength_Ref` (`Wavelength_UniqueID`);

--
-- Constraints for table `SampleDetails`
--
ALTER TABLE `SampleDetails`
  ADD CONSTRAINT `FK_Sample_Event` FOREIGN KEY (`SamplingEvent_Num`) REFERENCES `SamplingEvent` (`SamplingEventUniqueID`),
  ADD CONSTRAINT `FK_Sample_Media` FOREIGN KEY (`MediaType_SelectID`) REFERENCES `MediaType_WithinLitterWaterSoil_Ref` (`MediaTypeUniqueID`),
  ADD CONSTRAINT `FK_Sample_Storage` FOREIGN KEY (`StorageLocation`) REFERENCES `StorageLoc_Ref` (`StorageLocUniqueID`),
  ADD CONSTRAINT `FK_Sample_WaterEnv` FOREIGN KEY (`WaterEnvType_SelectID`) REFERENCES `WaterEnvType_Ref` (`WaterEnv_UniqueID`);

--
-- Constraints for table `SamplingEvent`
--
ALTER TABLE `SamplingEvent`
  ADD CONSTRAINT `FK_Event_Location` FOREIGN KEY (`LocationID_Num`) REFERENCES `Location` (`Loc_UniqueID`);
SET FOREIGN_KEY_CHECKS=1;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
