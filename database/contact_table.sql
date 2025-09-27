-- Contact form submissions table
-- This table is optional but useful for tracking contact form submissions

CREATE TABLE IF NOT EXISTS `contact_submissions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_name` varchar(100) NOT NULL,
  `user_email` varchar(255) NOT NULL,
  `user_organization` varchar(200) DEFAULT NULL,
  `question_category` varchar(50) NOT NULL,
  `user_question` text NOT NULL,
  `subscribe_updates` enum('yes','no') DEFAULT 'no',
  `submission_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ip_address` varchar(45) DEFAULT NULL,
  `status` enum('new','in_progress','resolved','closed') DEFAULT 'new',
  `admin_notes` text DEFAULT NULL,
  `resolved_date` datetime DEFAULT NULL,
  `resolved_by` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_submission_date` (`submission_date`),
  INDEX `idx_status` (`status`),
  INDEX `idx_category` (`question_category`),
  INDEX `idx_email` (`user_email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
