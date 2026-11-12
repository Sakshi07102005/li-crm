import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

export interface PushPayload {
  title: string;
  body?: string;
  data?: Record<string, string>;
}

export interface PushResult {
  invalidTokens: string[];
  successCount: number;
  failureCount: number;
}

export interface PushSender {
  send(tokens: string[], payload: PushPayload): Promise<PushResult>;
}

class DefaultPushSender implements PushSender {
  private initialized = false;
  private firebaseMessaging: any = null;

  private init() {
    if (this.initialized) return;
    this.initialized = true;

    const saPath = env.firebaseServiceAccountPath;
    if (!saPath) {
      return;
    }

    const resolvedPath = path.isAbsolute(saPath)
      ? saPath
      : path.resolve(process.cwd(), saPath);

    if (fs.existsSync(resolvedPath)) {
      try {
        // Dynamic require to avoid crashing if firebase-admin has issues
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const admin = require('firebase-admin');
        if (!admin.apps.length) {
          const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          });
        }
        this.firebaseMessaging = admin.messaging();
        console.log('Firebase Cloud Messaging initialized.');
      } catch (err: any) {
        console.warn('Failed to initialize Firebase Admin SDK:', err?.message || err);
      }
    }
  }

  async send(tokens: string[], payload: PushPayload): Promise<PushResult> {
    this.init();
    if (!tokens || tokens.length === 0) {
      return { invalidTokens: [], successCount: 0, failureCount: 0 };
    }

    if (!this.firebaseMessaging) {
      // Mock / fallback logger
      return {
        invalidTokens: [],
        successCount: tokens.length,
        failureCount: 0,
      };
    }

    const invalidTokens: string[] = [];
    let successCount = 0;
    let failureCount = 0;

    try {
      const response = await this.firebaseMessaging.sendEachForMulticast({
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data,
      });

      successCount = response.successCount;
      failureCount = response.failureCount;

      response.responses.forEach((resp: any, idx: number) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            invalidTokens.push(tokens[idx]);
          }
        }
      });
    } catch (err) {
      console.error('Error sending push notifications via Firebase:', err);
    }

    return { invalidTokens, successCount, failureCount };
  }
}

let currentPushSender: PushSender = new DefaultPushSender();

export function getPushSender(): PushSender {
  return currentPushSender;
}

export function setPushSender(sender: PushSender): void {
  currentPushSender = sender;
}

