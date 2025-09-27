-- Database Schema for Node.js Microplastics Data Entry System
-- Simplified version of the original complex normalized schema

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS sweetl23_partner_demo;
USE sweetl23_partner_demo;

-- Users table for authentication
CREATE TABLE IF NOT EXISTS `users` (
  `User_UniqueID` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL UNIQUE,
  `email` varchar(100) NOT NULL UNIQUE,
  `password` varchar(255) NOT NULL,
  `first_name` varchar(50) DEFAULT NULL,
  `last_name` varchar(50) DEFAULT NULL,
  `organization` varchar(100) DEFAULT NULL,
  `role` enum('admin', 'researcher', 'user') DEFAULT 'user',
  `is_active` tinyint(1) DEFAULT 1,
  `email_verified` tinyint(1) DEFAULT 0,
  `password_reset_token` varchar(255) DEFAULT NULL,
  `password_reset_expires` datetime DEFAULT NULL,
  `last_login` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`User_UniqueID`),
  INDEX `idx_username` (`username`),
  INDEX `idx_email` (`email`),
  INDEX `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sample data table (simplified version combining multiple normalized tables)
CREATE TABLE IF NOT EXISTS `sample_data` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `created_by` int(11) NOT NULL,
  
  -- Location information
  `latitude` decimal(10,6) DEFAULT NULL,
  `longitude` decimal(10,6) DEFAULT NULL,
  `location_name` varchar(255) DEFAULT NULL,
  `location_description` text DEFAULT NULL,
  `street_address` varchar(255) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `state` varchar(50) DEFAULT NULL,
  `country` varchar(50) DEFAULT 'USA',
  
  -- Sample collection information
  `collection_date` date DEFAULT NULL,
  `collection_time` time DEFAULT NULL,
  `user_sample_id` varchar(100) DEFAULT NULL,
  `sampler_names` text DEFAULT NULL,
  
  -- Environmental conditions
  `air_temp_f` decimal(5,1) DEFAULT NULL,
  `weather_current` varchar(50) DEFAULT NULL,
  `weather_24h_prior` varchar(50) DEFAULT NULL,
  `rainfall_24h_inches` decimal(5,2) DEFAULT NULL,
  
  -- Sample type and media
  `sample_type` int(11) DEFAULT NULL COMMENT '1-10 representing different sample types',
  `media_type` varchar(50) DEFAULT NULL COMMENT 'Litter, Water, Soil, etc.',
  `media_subtype` varchar(100) DEFAULT NULL,
  
  -- Sample details
  `particle_count` int(11) DEFAULT NULL,
  `particle_size_class` varchar(50) DEFAULT NULL,
  `particle_form` varchar(50) DEFAULT NULL,
  `particle_color` varchar(50) DEFAULT NULL,
  `polymer_code` text DEFAULT NULL,
  `analysis_type` varchar(100) DEFAULT NULL,
  `storage_location` varchar(100) DEFAULT NULL,
  
  -- Additional data and notes
  `notes` text DEFAULT NULL,
  `additional_data` json DEFAULT NULL COMMENT 'For storing any additional form fields as JSON',
  
  -- File attachments
  `uploaded_files` json DEFAULT NULL COMMENT 'Array of uploaded file information',
  
  -- Quality control
  `data_quality_flag` enum('good', 'suspect', 'bad') DEFAULT 'good',
  `reviewed_by` int(11) DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `review_notes` text DEFAULT NULL,
  
  -- Metadata
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `data_source` enum('manual', 'file_upload', 'api') DEFAULT 'manual',
  
  PRIMARY KEY (`id`),
  FOREIGN KEY (`created_by`) REFERENCES `users` (`User_UniqueID`) ON DELETE CASCADE,
  FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`User_UniqueID`) ON DELETE SET NULL,
  INDEX `idx_created_by` (`created_by`),
  INDEX `idx_collection_date` (`collection_date`),
  INDEX `idx_location` (`latitude`, `longitude`),
  INDEX `idx_sample_type` (`sample_type`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_quality_flag` (`data_quality_flag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reference table for sample types (simplified)
CREATE TABLE IF NOT EXISTS `sample_types_ref` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type_name` varchar(100) NOT NULL,
  `type_description` text DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default sample types
INSERT IGNORE INTO `sample_types_ref` (`id`, `type_name`, `type_description`) VALUES
(1, 'Surface Water', 'Water samples collected from surface sources'),
(2, 'Beach Sediment', 'Sediment samples from beach/shoreline areas'),
(3, 'Marine Litter', 'Visible litter collected from marine environments'),
(4, 'Freshwater Sediment', 'Sediment samples from freshwater sources'),
(5, 'Soil Sample', 'Terrestrial soil samples'),
(6, 'Air Sample', 'Atmospheric microplastic samples'),
(7, 'Biota Sample', 'Samples from living organisms'),
(8, 'Drinking Water', 'Treated/untreated drinking water samples'),
(9, 'Wastewater', 'Municipal or industrial wastewater samples'),
(10, 'Other', 'Other sample types not listed above');

-- Sessions table for session management (optional - Express-session can use database storage)
CREATE TABLE IF NOT EXISTS `sessions` (
  `session_id` varchar(128) COLLATE utf8mb4_bin NOT NULL,
  `expires` int(11) unsigned NOT NULL,
  `data` mediumtext COLLATE utf8mb4_bin,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create a default admin user (password: 'admin123' - should be changed in production)
-- Password hash for 'admin123' using bcrypt with salt rounds 10
INSERT IGNORE INTO `users` (`User_UniqueID`, `username`, `email`, `password`, `first_name`, `last_name`, `role`, `is_active`, `email_verified`) 
VALUES (1, 'admin', 'admin@example.com', '$2a$10$9mYvgzq8XQOUJzfJOh7rMegB2VzDJyMmvQJ9Qx1GKm.hFVqQzxFKe', 'System', 'Administrator', 'admin', 1, 1);

-- Create a default test user (password: 'test123')
-- Password hash for 'test123' using bcrypt with salt rounds 10
INSERT IGNORE INTO `users` (`User_UniqueID`, `username`, `email`, `password`, `first_name`, `last_name`, `role`, `is_active`, `email_verified`) 
VALUES (2, 'testuser', 'test@example.com', '$2a$10$K7VE7PqMm3qmJ5KXfXJ8leO6vJx8wNOy2X3mKSKdQZgBqYvgB4aKm', 'Test', 'User', 'user', 1, 1);

-- Insert some sample data for testing
INSERT IGNORE INTO `sample_data` (
  `id`, `created_by`, `latitude`, `longitude`, `location_name`, `collection_date`, 
  `sample_type`, `media_type`, `particle_count`, `notes`, `created_at`
) VALUES 
(1, 1, 40.7128, -74.0060, 'New York Harbor', '2024-01-15', 1, 'Surface Water', 25, 'Test sample from NYC harbor area', NOW()),
(2, 1, 34.0522, -118.2437, 'Santa Monica Beach', '2024-01-20', 2, 'Beach Sediment', 15, 'Beach sediment sample from Santa Monica', NOW()),
(3, 2, 41.8781, -87.6298, 'Lake Michigan Shore', '2024-01-25', 4, 'Freshwater Sediment', 8, 'Freshwater sediment from Lake Michigan', NOW());
