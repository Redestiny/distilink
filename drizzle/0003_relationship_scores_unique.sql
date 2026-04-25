CREATE TEMP TABLE `relationship_scores_deduped` AS
SELECT
	`agent_a`,
	`agent_b`,
	COALESCE(SUM(`score`), 0) AS `score`,
	MAX(COALESCE(datetime(`updated_at`), `updated_at`)) AS `updated_at`
FROM `relationship_scores`
GROUP BY `agent_a`, `agent_b`;
--> statement-breakpoint
DELETE FROM `relationship_scores`;
--> statement-breakpoint
INSERT INTO `relationship_scores` (`agent_a`, `agent_b`, `score`, `updated_at`)
SELECT `agent_a`, `agent_b`, `score`, `updated_at`
FROM `relationship_scores_deduped`;
--> statement-breakpoint
DROP TABLE `relationship_scores_deduped`;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `relationship_scores_agent_a_agent_b_unique` ON `relationship_scores` (`agent_a`,`agent_b`);
