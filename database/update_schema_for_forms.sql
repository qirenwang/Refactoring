-- Database updates to support the comprehensive form data structure
-- Run this script to add missing fields and improve data support

-- Add additional fields to SamplingEvent table for better form support
ALTER TABLE `SamplingEvent` 
ADD COLUMN `DeviceInstallationPeriod` ENUM('no', 'yes') DEFAULT 'no' COMMENT 'Whether sample came from device installed for a period',
ADD COLUMN `DeviceStartDate` DATE NULL COMMENT 'Device installation start date',
ADD COLUMN `DeviceEndDate` DATE NULL COMMENT 'Device removal/end date',
ADD COLUMN `SampleTime` TIME NULL COMMENT 'Collection time',
ADD COLUMN `WeatherPrecedent24` INT(11) NULL COMMENT 'Precedent 24 hour weather pattern',
ADD COLUMN `AdditionalNotes` TEXT NULL COMMENT 'Additional notes from review page';

-- Add additional fields to SampleDetails table for comprehensive media support
ALTER TABLE `SampleDetails` 
ADD COLUMN `MediaSubType` VARCHAR(100) NULL COMMENT 'Specific media subtype (water_type, sediment_type, etc.)',
ADD COLUMN `LandscapeType` VARCHAR(100) NULL COMMENT 'Landscape type for soil/surface samples',
ADD COLUMN `MixedMediaDescription` TEXT NULL COMMENT 'Description of mixed media composition',
ADD COLUMN `VolumeSampled` DECIMAL(10,3) NULL COMMENT 'Volume sampled in liters',
ADD COLUMN `WaterDepth` DECIMAL(10,2) NULL COMMENT 'Water depth in meters',
ADD COLUMN `FlowVelocity` DECIMAL(10,2) NULL COMMENT 'Water flow velocity',
ADD COLUMN `SuspendedSolids` DECIMAL(10,2) NULL COMMENT 'Total suspended solids mg/L',
ADD COLUMN `Conductivity` DECIMAL(10,2) NULL COMMENT 'Conductivity uS/cm',
ADD COLUMN `SoilDryWeight` DECIMAL(10,2) NULL COMMENT 'Soil dry weight in grams',
ADD COLUMN `SoilOrganicMatter` DECIMAL(5,2) NULL COMMENT 'Soil organic matter percentage',
ADD COLUMN `SoilSand` DECIMAL(5,2) NULL COMMENT 'Soil sand percentage',
ADD COLUMN `SoilSilt` DECIMAL(5,2) NULL COMMENT 'Soil silt percentage',
ADD COLUMN `SoilClay` DECIMAL(5,2) NULL COMMENT 'Soil clay percentage',
ADD COLUMN `ReplicatesCount` INT(11) NULL COMMENT 'Number of replicates',
ADD COLUMN `MicroplasticsSampleAmount` DECIMAL(10,3) NULL COMMENT 'Sample amount for microplastics',
ADD COLUMN `MicroplasticsSampleUnit` VARCHAR(20) NULL COMMENT 'Unit for microplastics sample amount',
ADD COLUMN `FragmentsSampleAmount` DECIMAL(10,3) NULL COMMENT 'Sample amount for fragments',
ADD COLUMN `FragmentsSampleUnit` VARCHAR(20) NULL COMMENT 'Unit for fragments sample amount',
ADD COLUMN `PackagingSampleAmount` DECIMAL(10,3) NULL COMMENT 'Sample amount for packaging',
ADD COLUMN `PackagingSampleUnit` VARCHAR(20) NULL COMMENT 'Unit for packaging sample amount';

-- Create table for polymer details in microplastics
CREATE TABLE `MicroplasticsPolymerDetails` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `Micro_UniqueID` int(11) NOT NULL,
  `PolymerType` VARCHAR(50) NOT NULL,
  `Percentage` INT(11) NULL,
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`ID`),
  KEY `FK_MicroPolymer_Micro` (`Micro_UniqueID`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- Create table for polymer details in fragments
CREATE TABLE `FragmentsPolymerDetails` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `Fragment_UniqueID` int(11) NOT NULL,
  `PolymerType` VARCHAR(50) NOT NULL,
  `Percentage` INT(11) NULL,
  `DateEntered` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`ID`),
  KEY `FK_FragmentPolymer_Fragment` (`Fragment_UniqueID`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- Add more fields to MicroplasticsInSample for comprehensive size and color data
ALTER TABLE `MicroplasticsInSample` 
ADD COLUMN `PercentForm_Film` INT(11) NULL COMMENT 'Percentage of film form',
ADD COLUMN `PercentForm_Foam` INT(11) NULL COMMENT 'Percentage of foam form',
ADD COLUMN `PercentColor_Clear` INT(11) NULL COMMENT 'Percentage of clear color',
ADD COLUMN `PercentColor_OpaqueLight` INT(11) NULL COMMENT 'Percentage of opaque light color',
ADD COLUMN `PercentColor_OpaqueDark` INT(11) NULL COMMENT 'Percentage of opaque dark color',
ADD COLUMN `PercentColor_Mixed` INT(11) NULL COMMENT 'Percentage of mixed color';

-- Update PackagesInSample table to support better classification
ALTER TABLE `PackagesInSample` 
ADD COLUMN `UserPieceID` VARCHAR(100) NULL COMMENT 'User defined piece identifier',
ADD COLUMN `PackagingPurpose` VARCHAR(200) NULL COMMENT 'Purpose of packaging',
ADD COLUMN `RecycleCode` VARCHAR(20) NULL COMMENT 'Recycle code',
ADD COLUMN `ColorOpacity` VARCHAR(50) NULL COMMENT 'Color opacity type',
ADD COLUMN `Color` VARCHAR(50) NULL COMMENT 'Color of package';

-- Create indexes for better performance
CREATE INDEX idx_samplingevent_location ON SamplingEvent(LocationID_Num);
CREATE INDEX idx_samplingevent_date ON SamplingEvent(SamplingDate);
CREATE INDEX idx_sampledetails_event ON SampleDetails(SamplingEvent_Num);
CREATE INDEX idx_microplastics_sample ON MicroplasticsInSample(SampleDetails_Num);
CREATE INDEX idx_fragments_sample ON FragmentsInSample(SampleDetails_Num);
CREATE INDEX idx_packages_sample ON PackagesInSample(SampleDetails_Num);
