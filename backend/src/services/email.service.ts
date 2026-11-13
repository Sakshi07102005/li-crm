// import nodemailer from 'nodemailer';
import { env } from '../config/env';
// import { logger } from '../utils/logger'; // logger not present – using console.error directly

// Simple HTML escaping
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Import the Transporter type from nodemailer
import type { Transporter } from 'nodemailer';

let transport: Transporter | null = null;
let emailDisabledLogged = false;

/** Allows tests to inject a fake transport */
export function setEmailTransport(t: Transporter) {
  transport = t;
}

/** Lazy transport creation */
function getTransport(): Transporter | null {
  if (transport) return transport;
  if (!env.emailEnabled || !env.smtpHost) {
    if (!emailDisabledLogged) {
      console.error('email disabled');
      emailDisabledLogged = true;
    }
    return null;
  }
  try {
    const nodemailer = require('nodemailer');
    transport = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser ?? undefined,
        pass: env.smtpPass ?? undefined,
      },
    });
  } catch (err) {
    console.error('Failed to initialize nodemailer transport', err);
    return null;
  }
  return transport;
}

/** Templates --------------------------------------------------- */
export function leadAssignedEmail(payload: { leadId: string }) {
  const url = `${env.webAppUrl}/leads/${payload.leadId}`;
  const html = `<p>You have been assigned a new lead. <a href="${esc(url)}">View Lead</a></p>`;
  const text = `You have been assigned a new lead. Visit ${url}`;
  return { subject: 'Lead assigned to you', html, text };
}

export function taskAssignedEmail(payload: { taskId: string }) {
  const url = `${env.webAppUrl}/tasks/${payload.taskId}`;
  const html = `<p>You have a new task. <a href="${esc(url)}">View Task</a></p>`;
  const text = `You have a new task. Visit ${url}`;
  return { subject: 'Task assigned to you', html, text };
}

export function followUpDueDigestEmail(payload: { followUps: Array<{ id: string; dueAt: string }> }) {
  const items = payload.followUps
    .map(f => `<li><a href="${esc(`${env.webAppUrl}/followups/${f.id}`)}">Follow‑up ${f.id} (due ${f.dueAt})</a></li>`)
    .join('');
  const html = `<p>You have follow‑up reminders due:</p><ul>${items}</ul>`;
  const text = `You have follow‑up reminders due:\n${payload.followUps
    .map(f => `- ${f.id} due ${f.dueAt}`)
    .join('\n')}`;
  return { subject: 'Follow‑up reminders due', html, text };
}

/** Send email ------------------------------------------------- */
export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<{ sent: boolean }> {
  try {
    if (process.env.EMAIL_ENABLED === 'false') return { sent: false };
    const tr = getTransport();
    if (!tr) return { sent: false };
    const safeSubject = subject.replace(/[\r\n]+/g, ' ');
    await tr.sendMail({ from: env.emailFrom, to, subject: safeSubject, html, text });
    return { sent: true };
  } catch (e) {
    console.error('Email send failure', e);
    return { sent: false };
  }
}

export { esc };