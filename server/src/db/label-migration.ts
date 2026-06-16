type QueryResultRow = Record<string, unknown>;

export interface SqlClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
}

type LabelRow = {
  id: string;
  team_id: string | null;
  project_id: string | null;
  name: string;
  created_at: string | Date | null;
};

type TicketLabelRow = {
  ticket_id: string;
  label_id: string;
};

function compareTimestamps(left: string | Date | null, right: string | Date | null) {
  const leftTime = left instanceof Date ? left.getTime() : left ? new Date(left).getTime() : Number.POSITIVE_INFINITY;
  const rightTime = right instanceof Date ? right.getTime() : right ? new Date(right).getTime() : Number.POSITIVE_INFINITY;

  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return 0;
}

/**
 * Consolidates labels that share the same team/name pair so the first team
 * label becomes canonical and all ticket-label links point to it.
 */
export async function mergeDuplicateTeamLabels(client: SqlClient) {
  const labelRows = await client.query<LabelRow>(
    `
      SELECT id, team_id, project_id, name, created_at
      FROM labels
      WHERE team_id IS NOT NULL
        AND project_id IS NULL
      ORDER BY team_id, name, created_at, id
    `,
  );

  const labelGroups = new Map<string, LabelRow[]>();
  for (const row of labelRows.rows) {
    if (!row.team_id || row.project_id !== null) {
      continue;
    }

    const key = `${row.team_id}\u0000${row.name}`;
    const group = labelGroups.get(key);
    if (group) {
      group.push(row);
      continue;
    }

    labelGroups.set(key, [row]);
  }

  for (const group of labelGroups.values()) {
    if (group.length < 2) {
      continue;
    }

    group.sort((left, right) => compareTimestamps(left.created_at, right.created_at) || left.id.localeCompare(right.id));
    const canonicalId = group[0]?.id;
    if (!canonicalId) {
      continue;
    }

    for (const duplicate of group.slice(1)) {
      const duplicateLinks = await client.query<TicketLabelRow>(
        `
          SELECT ticket_id, label_id
          FROM ticket_labels
          WHERE label_id = $1
          ORDER BY ticket_id
        `,
        [duplicate.id],
      );

      for (const link of duplicateLinks.rows) {
        const existingCanonicalLink = await client.query(
          `
            SELECT 1
            FROM ticket_labels
            WHERE ticket_id = $1
              AND label_id = $2
            LIMIT 1
          `,
          [link.ticket_id, canonicalId],
        );

        if (existingCanonicalLink.rows.length > 0) {
          await client.query(
            `
              DELETE FROM ticket_labels
              WHERE ticket_id = $1
                AND label_id = $2
            `,
            [link.ticket_id, duplicate.id],
          );
          continue;
        }

        await client.query(
          `
            UPDATE ticket_labels
            SET label_id = $1
            WHERE ticket_id = $2
              AND label_id = $3
          `,
          [canonicalId, link.ticket_id, duplicate.id],
        );
      }

      await client.query(
        `
          DELETE FROM labels
          WHERE id = $1
        `,
        [duplicate.id],
      );
    }
  }
}
