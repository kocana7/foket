-- ============================================================
-- CryptoSignals Database Schema
-- Database: foketcrypto_db
-- Created: 2024
-- ============================================================

CREATE DATABASE IF NOT EXISTS `foketcrypto_db`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `foketcrypto_db`;

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `username` VARCHAR(100) DEFAULT NULL,
  `role` ENUM('user', 'admin', 'superadmin') NOT NULL DEFAULT 'user',
  `plan_id` INT UNSIGNED DEFAULT NULL,
  `plan_expires_at` DATETIME DEFAULT NULL,
  `telegram_username` VARCHAR(100) DEFAULT NULL,
  `avatar` VARCHAR(255) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `email_verified` TINYINT(1) NOT NULL DEFAULT 0,
  `last_login` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_email` (`email`),
  INDEX `idx_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PLANS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS `plans` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(100) NOT NULL UNIQUE,
  `duration_days` INT NOT NULL COMMENT 'Duration in days',
  `price` DECIMAL(10,2) NOT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
  `signals_per_day_min` INT NOT NULL DEFAULT 2,
  `signals_per_day_max` INT NOT NULL DEFAULT 5,
  `features` JSON DEFAULT NULL COMMENT 'Array of feature strings',
  `is_popular` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SIGNALS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS `signals` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `coin` VARCHAR(20) NOT NULL COMMENT 'e.g. BTC, ETH',
  `pair` VARCHAR(20) NOT NULL COMMENT 'e.g. BTC/USDT',
  `signal_type` ENUM('LONG', 'SHORT') NOT NULL DEFAULT 'LONG',
  `entry_price` DECIMAL(20,8) NOT NULL,
  `take_profit_1` DECIMAL(20,8) NOT NULL,
  `take_profit_2` DECIMAL(20,8) DEFAULT NULL,
  `take_profit_3` DECIMAL(20,8) DEFAULT NULL,
  `stop_loss` DECIMAL(20,8) NOT NULL,
  `risk_percentage` DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  `risk_reward_ratio` DECIMAL(5,2) DEFAULT NULL,
  `leverage` INT DEFAULT NULL,
  `exchange` VARCHAR(50) DEFAULT NULL,
  `tier` ENUM('free', 'vip') NOT NULL DEFAULT 'vip',
  `status` ENUM('active', 'closed', 'cancelled') NOT NULL DEFAULT 'active',
  `result` ENUM('win', 'loss', 'breakeven', 'pending') NOT NULL DEFAULT 'pending',
  `profit_loss_percent` DECIMAL(10,2) DEFAULT NULL,
  `analysis` TEXT DEFAULT NULL,
  `chart_image` VARCHAR(255) DEFAULT NULL,
  `closed_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_coin` (`coin`),
  INDEX `idx_status` (`status`),
  INDEX `idx_tier` (`tier`),
  INDEX `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- NEWS / BLOG TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS `news` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(500) NOT NULL,
  `slug` VARCHAR(500) NOT NULL,
  `content` LONGTEXT NOT NULL,
  `excerpt` TEXT DEFAULT NULL,
  `category` VARCHAR(100) DEFAULT 'crypto-news',
  `tags` JSON DEFAULT NULL,
  `language` VARCHAR(10) NOT NULL DEFAULT 'ko',
  `featured_image` VARCHAR(255) DEFAULT NULL,
  `author_id` INT UNSIGNED DEFAULT NULL,
  `views` INT UNSIGNED NOT NULL DEFAULT 0,
  `is_featured` TINYINT(1) NOT NULL DEFAULT 0,
  `is_published` TINYINT(1) NOT NULL DEFAULT 0,
  `published_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_slug_lang` (`slug`, `language`),
  INDEX `idx_category` (`category`),
  INDEX `idx_language` (`language`),
  INDEX `idx_published` (`is_published`, `published_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TESTIMONIALS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS `testimonials` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `avatar` VARCHAR(255) DEFAULT NULL,
  `country` VARCHAR(50) DEFAULT NULL,
  `text` TEXT NOT NULL,
  `rating` TINYINT NOT NULL DEFAULT 5,
  `plan_name` VARCHAR(100) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- STATS TABLE (Site statistics)
-- ============================================================
CREATE TABLE IF NOT EXISTS `stats` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `stat_key` VARCHAR(100) NOT NULL UNIQUE,
  `stat_value` VARCHAR(255) NOT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SUBSCRIPTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `plan_id` INT UNSIGNED NOT NULL,
  `amount_paid` DECIMAL(10,2) NOT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
  `payment_method` VARCHAR(50) DEFAULT NULL,
  `transaction_id` VARCHAR(255) DEFAULT NULL,
  `status` ENUM('active', 'expired', 'cancelled', 'pending') NOT NULL DEFAULT 'pending',
  `starts_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_user` (`user_id`),
  INDEX `idx_plan` (`plan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- CONTACT MESSAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS `contact_messages` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `subject` VARCHAR(255) DEFAULT NULL,
  `message` TEXT NOT NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SETTINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS `settings` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `setting_key` VARCHAR(100) NOT NULL UNIQUE,
  `setting_value` TEXT DEFAULT NULL,
  `setting_group` VARCHAR(50) DEFAULT 'general',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SEED DATA
-- ============================================================

-- Admin user (password: Admin@123)
INSERT IGNORE INTO `users` (`email`, `password`, `username`, `role`) VALUES
('admin@foketcrypto.com', '$2a$10$rG/7rH.Jt0uL6iM8.dI8PuW.PGe0Xa9vRV.Mm1j7YpqUzTkUJTCWG', 'Administrator', 'superadmin');

-- Subscription plans
INSERT IGNORE INTO `plans` (`name`, `slug`, `duration_days`, `price`, `currency`, `is_popular`, `sort_order`, `features`) VALUES
('The Novice', 'novice', 30, 52.00, 'USD', 0, 1, '["2-5 signals per day", "Monday to Friday", "Entry price & targets", "Stop-loss guidance", "VIP Telegram access", "30-day money-back guarantee"]'),
('The Proficient', 'proficient', 90, 78.00, 'USD', 1, 2, '["2-5 signals per day", "Monday to Friday", "Entry price & targets", "Stop-loss guidance", "VIP Telegram access", "Risk/reward ratio", "Market analysis reports", "30-day money-back guarantee"]'),
('The Competent', 'competent', 180, 114.00, 'USD', 0, 3, '["2-5 signals per day", "Monday to Friday", "Entry price & targets", "Stop-loss guidance", "VIP Telegram access", "Risk/reward ratio", "Full market analysis", "Priority support", "30-day money-back guarantee"]'),
('The Expert', 'expert', 365, 210.00, 'USD', 0, 4, '["2-5 signals per day", "Monday to Friday", "Entry price & targets", "Stop-loss guidance", "VIP Telegram access", "Risk/reward ratio", "Full market analysis", "Priority support", "Early access to strategies", "Exclusive industry invitations", "30-day money-back guarantee"]');

-- Sample signals
INSERT IGNORE INTO `signals` (`coin`, `pair`, `signal_type`, `entry_price`, `take_profit_1`, `take_profit_2`, `stop_loss`, `risk_percentage`, `risk_reward_ratio`, `exchange`, `tier`, `status`, `result`, `analysis`) VALUES
('BTC', 'BTC/USDT', 'LONG', 65000.00, 68000.00, 72000.00, 62000.00, 1.00, 2.50, 'Binance', 'free', 'closed', 'win', 'Bitcoin showing strong support at key level with RSI oversold conditions.'),
('ETH', 'ETH/USDT', 'LONG', 3200.00, 3500.00, 3800.00, 3000.00, 1.00, 2.00, 'Binance', 'vip', 'closed', 'win', 'Ethereum forming bullish pattern with increasing volume on daily chart.'),
('BNB', 'BNB/USDT', 'LONG', 380.00, 420.00, 450.00, 355.00, 1.50, 2.20, 'Binance', 'vip', 'active', 'pending', 'BNB consolidating near support, MACD showing bullish crossover.'),
('ADA', 'ADA/USDT', 'LONG', 0.45, 0.52, 0.58, 0.40, 1.00, 2.60, 'Binance', 'vip', 'active', 'pending', 'Cardano showing accumulation pattern on weekly chart.'),
('LINK', 'LINK/USDT', 'LONG', 14.50, 16.00, 18.00, 13.00, 1.00, 2.30, 'Binance', 'vip', 'closed', 'win', 'Chainlink breaking key resistance with strong volume confirmation.'),
('XRP', 'XRP/USDT', 'SHORT', 0.65, 0.58, 0.52, 0.72, 1.00, 1.90, 'Binance', 'vip', 'closed', 'loss', 'XRP bearish divergence on 4H chart near key resistance.');

-- Testimonials
INSERT IGNORE INTO `testimonials` (`name`, `country`, `text`, `rating`, `plan_name`, `sort_order`) VALUES
('Michael R.', 'United States', 'I''ve been using these signals for 6 months and my portfolio has grown by 340%. The analysis provided with each signal is incredibly detailed and educational.', 5, 'The Expert', 1),
('Sarah K.', 'United Kingdom', 'Finally found a signal service that actually works! 82% win rate is no joke. The risk management guidance alone is worth the subscription fee.', 5, 'The Proficient', 2),
('David L.', 'Australia', 'Started with the free signals and was blown away by the quality. Upgraded to VIP immediately. Best investment I''ve made in crypto.', 5, 'The Competent', 3),
('Emma W.', 'Germany', 'The signals are clear, precise and come with full analysis. I''ve learned so much about trading just by following along. Highly recommended!', 4, 'The Novice', 4),
('James T.', 'Canada', 'Been trading crypto for 3 years and never found anything as consistent as this. The expert team really knows their stuff.', 5, 'The Expert', 5),
('Lisa M.', 'Singapore', 'Excellent service! The Telegram group is very active and the support team responds quickly. Very happy with my VIP membership.', 5, 'The Proficient', 6);

-- Site stats
INSERT IGNORE INTO `stats` (`stat_key`, `stat_value`) VALUES
('total_members', '50000'),
('success_rate', '82'),
('signals_delivered', '15000'),
('years_active', '10');

-- Settings
INSERT IGNORE INTO `settings` (`setting_key`, `setting_value`, `setting_group`) VALUES
('site_name', 'FoketCrypto Signals', 'general'),
('site_tagline', 'Professional Cryptocurrency Trading Signals', 'general'),
('telegram_free_link', 'https://t.me/your_free_channel', 'social'),
('telegram_vip_link', 'https://t.me/your_vip_channel', 'social'),
('twitter_link', 'https://twitter.com/yourhandle', 'social'),
('contact_email', 'support@foketcrypto.com', 'contact'),
('contact_phone', '+1-800-000-0000', 'contact'),
('contact_address', '123 Crypto Street, London, EC1R 5HL', 'contact'),
('meta_description', 'Get professional cryptocurrency trading signals with 82% success rate. Free and VIP plans available.', 'seo'),
('google_analytics_id', '', 'analytics'),
('maintenance_mode', '0', 'general');


-- ============================================================
-- APP STORAGE TABLE (admin.html SPA 데이터 저장용)
-- ============================================================
CREATE TABLE IF NOT EXISTS `app_storage` (
  `key` VARCHAR(100) NOT NULL,
  `value` LONGTEXT,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
