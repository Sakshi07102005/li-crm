import cron, { ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { pool, withTransaction } from '../db/pool';
import { createNotification } from '../services/notification.service';

export interface ReminderJobResult {
  processedCount: number;
}

/**
 * Executes a single sweep of upcoming pending follow-ups requiring reminders.
 * Uses SELECT ... FOR UPDATE SKIP LOCKED to prevent duplicate notifications
 * across multiple running instances.
 */
export async function runFollowupReminders(now: Date = new Date()): Promise<ReminderJobResult> {
  const reminderMinutes = env.reminderMinutes || 15;
  const maxDue = new Date(now.getTime() + reminderMinutes * 60 * 1000);
  // Also catch pending followups from recent past (e.g. up to 1 hour overdue)
  const minDue = new Date(now.getTime() - 60 * 60 * 1000);

  let processedCount = 0;

  await withTransaction(async (client) => {
    // Select due followups with row lock
    const sql = `
      SELECT
        f.id AS followup_id,
        f.lead_id,
        f.assigned_to,
        f.scheduled_at,
        f.type,
        f.notes,
        l.lead_code,
        l.lead_name
      FROM follow_ups f
      JOIN leads l ON l.id = f.lead_id
      WHERE f.status = 'pending'
        AND f.assigned_to IS NOT NULL
        AND f.reminder_sent_at IS NULL
        AND f.scheduled_at <= $1
        AND f.scheduled_at >= $2
      FOR UPDATE OF f SKIP LOCKED
    `;

    const res = await client.query(sql, [maxDue.toISOString(), minDue.toISOString()]);

    for (const row of res.rows) {
      // 1. Mark reminder as sent
      await client.query(
        `UPDATE follow_ups SET reminder_sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [row.followup_id],
      );

      // 2. Insert notification
      const timeStr = new Date(row.scheduled_at).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const title = 'Upcoming Follow-up Reminder';
      const body = `Follow-up (${row.type}) for ${row.lead_code} - ${row.lead_name} scheduled at ${timeStr}.`;

      await createNotification(client, {
        userId: row.assigned_to,
        title,
        body,
        type: 'followup_reminder',
        entityType: 'lead',
        entityId: row.lead_id,
      });

      processedCount++;
    }
  });

  return { processedCount };
}

let reminderCronTask: ScheduledTask | null = null;

/**
 * Initializes cron scheduler to run reminders every minute.
 */
export function scheduleReminders(): void {
  if (!env.schedulerEnabled) {
    console.log('[Scheduler] Background reminder scheduler is disabled.');
    return;
  }

  if (reminderCronTask) {
    return;
  }

  // Run every minute
  reminderCronTask = cron.schedule('* * * * *', async () => {
    try {
      const result = await runFollowupReminders();
      if (result.processedCount > 0) {
        console.log(`[Scheduler] Sent ${result.processedCount} follow-up reminder(s).`);
      }
    } catch (err) {
      console.error('[Scheduler] Error in follow-up reminders job:', err);
    }
  });

  console.log('[Scheduler] Follow-up reminder cron job registered (runs every minute).');
}

export function stopScheduledReminders(): void {
  if (reminderCronTask) {
    reminderCronTask.stop();
    reminderCronTask = null;
  }
}
