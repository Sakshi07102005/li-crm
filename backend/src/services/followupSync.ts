import { PoolClient } from 'pg';

/**
 * Recomputes and updates leads.next_follow_up_at to MIN(scheduled_at) of pending follow-ups,
 * or NULL if none OR if the lead's status is final (Converted/Lost).
 * Must be executed within the same transaction client.
 */
export async function recomputeNextFollowUp(
  client: PoolClient,
  leadId: string,
): Promise<Date | null> {
  const res = await client.query<{ next_follow_up_at: Date | null }>(
    `UPDATE leads SET
       next_follow_up_at = CASE
         WHEN (SELECT st.is_final FROM lead_statuses st WHERE st.id = leads.status_id) = TRUE THEN NULL
         ELSE (
           SELECT MIN(f.scheduled_at)
           FROM follow_ups f
           WHERE f.lead_id = leads.id AND f.status = 'pending'
         )
       END,
       updated_at = NOW()
     WHERE id = $1
     RETURNING next_follow_up_at`,
    [leadId],
  );

  return res.rows[0]?.next_follow_up_at ?? null;
}

