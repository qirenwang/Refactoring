-- PackageCategoryDetails was replaced by the reference-backed fragment detail tables.
-- Back up the database before applying this migration because the legacy rows are not
-- losslessly convertible to percentage-based detail rows.

DROP TABLE IF EXISTS `PackageCategoryDetails`;
