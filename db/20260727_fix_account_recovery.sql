-- Keep account recovery on one token-table model and make the migration safe
-- for both fresh databases and legacy dumps.

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `email` varchar(100) NOT NULL,
  `token` varchar(64) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `user_id` (`user_id`),
  KEY `email` (`email`),
  KEY `expires_at` (`expires_at`),
  CONSTRAINT `FK_ResetToken_User`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`User_UniqueID`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Legacy dumps used MyISAM and ON UPDATE CURRENT_TIMESTAMP for expires_at.
-- Updating the `used` flag must not rewrite the original expiry time.
UPDATE `password_reset_tokens`
SET `used` = 0
WHERE `used` IS NULL;

UPDATE `password_reset_tokens`
SET `created_at` = current_timestamp()
WHERE `created_at` IS NULL;

ALTER TABLE `password_reset_tokens`
  ENGINE=InnoDB,
  MODIFY COLUMN `expires_at` timestamp NOT NULL,
  MODIFY COLUMN `used` tinyint(1) NOT NULL DEFAULT 0,
  MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT current_timestamp();

DELETE reset_token
FROM `password_reset_tokens` AS reset_token
LEFT JOIN `users`
  ON `users`.`User_UniqueID` = reset_token.`user_id`
WHERE `users`.`User_UniqueID` IS NULL;

SET @has_reset_token_fk = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'password_reset_tokens'
    AND COLUMN_NAME = 'user_id'
    AND REFERENCED_TABLE_NAME = 'users'
);
SET @sql = IF(
  @has_reset_token_fk = 0,
  'ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `FK_ResetToken_User` FOREIGN KEY (`user_id`) REFERENCES `users` (`User_UniqueID`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Shared, privacy-preserving cooldown buckets work across reverse proxies and
-- multiple application instances. key_hash is an HMAC, never the raw account
-- identifier.
CREATE TABLE IF NOT EXISTS `account_recovery_cooldowns` (
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

-- The encrypted payload contains the raw token only until SMTP accepts the
-- message. Workers claim rows with a lease so jobs survive restarts and can be
-- processed safely by multiple application instances.
CREATE TABLE IF NOT EXISTS `account_recovery_outbox` (
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
