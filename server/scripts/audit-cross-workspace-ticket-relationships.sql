-- Read-only audit to run before deployment. The startup cleanup removes only
-- rows returned here; same-workspace relationships are retained.
SELECT
  relation.ticket_id,
  relation.blocked_ticket_id,
  source_project.workspace_id AS source_workspace_id,
  target_project.workspace_id AS target_workspace_id
FROM ticket_relationships AS relation
JOIN tickets AS source_ticket ON source_ticket.id = relation.ticket_id
JOIN tickets AS target_ticket ON target_ticket.id = relation.blocked_ticket_id
JOIN projects AS source_project ON source_project.id = source_ticket.project_id
JOIN projects AS target_project ON target_project.id = target_ticket.project_id
WHERE source_project.workspace_id <> target_project.workspace_id
ORDER BY source_project.workspace_id, relation.ticket_id, relation.blocked_ticket_id;
