process.env.NODE_ENV = 'test';

import { app } from './app'; // Express app
import { setEmailTransport } from './services/email.service';
import { query } from './db/pool';

// Fake transport that records calls
const sentMails: any[] = [];
const fakeTransport = {
  sendMail: async (opts: any) => {
    sentMails.push(opts);
    return Promise.resolve({});
  },
};

// Test runner harness
const beforeHooks: Array<() => Promise<void> | void> = [];
const afterHooks: Array<() => Promise<void> | void> = [];
const tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];

function beforeAll(fn: () => Promise<void> | void) {
  beforeHooks.push(fn);
}
function afterAll(fn: () => Promise<void> | void) {
  afterHooks.push(fn);
}
function test(name: string, fn: () => Promise<void> | void) {
  tests.push({ name, fn });
}
function describe(suiteName: string, fn: () => void) {
  console.log(`\n================================================================`);
  console.log(`                  ${suiteName.toUpperCase()}                   `);
  console.log(`================================================================\n`);
  fn();
}

function expect(actual: any) {
  return {
    toBe: (expected: any) => {
      if (actual !== expected) {
        throw new Error(`Expected ${expected} but got ${actual}`);
      }
    },
    toHaveLength: (len: number) => {
      if (!actual || actual.length !== len) {
        throw new Error(`Expected length ${len} but got ${actual?.length}`);
      }
    },
    toContainEqual: (matcher: any) => {
      const match = Array.isArray(actual) && actual.some((item: any) => {
        if (typeof matcher === 'function') {
          return matcher(item);
        }
        return JSON.stringify(item) === JSON.stringify(matcher);
      });
      if (!match) {
        throw new Error(`Expected collection to contain matching item, but got ${JSON.stringify(actual)}`);
      }
    },
  };
}

expect.objectContaining = (expected: Record<string, any>) => {
  return (actual: any) => {
    if (!actual || typeof actual !== 'object') return false;
    for (const key of Object.keys(expected)) {
      const expVal = expected[key];
      if (typeof expVal === 'function') {
        if (!expVal(actual[key])) return false;
      } else if (actual[key] !== expVal) {
        return false;
      }
    }
    return true;
  };
};

expect.any = (constructor: any) => {
  return (val: any) => {
    if (constructor === String) return typeof val === 'string';
    if (constructor === Number) return typeof val === 'number';
    if (constructor === Boolean) return typeof val === 'boolean';
    return val instanceof constructor;
  };
};

import { Readable } from 'stream';

function request(expressApp: any) {
  return {
    post: (url: string) => {
      const headers: Record<string, string> = {};
      let bodyData: any = undefined;
      const chain = {
        set: (k: string, v: string) => {
          headers[k.toLowerCase()] = v;
          return chain;
        },
        send: async (data?: any) => {
          if (data) bodyData = data;
          return new Promise<{ status: number; body: any }>((resolve) => {
            const bodyStr = bodyData ? JSON.stringify(bodyData) : '';
            const req = Object.assign(Readable.from(bodyStr ? [Buffer.from(bodyStr)] : []), {
              method: 'POST',
              url,
              headers: {
                'content-type': 'application/json',
                'content-length': String(Buffer.byteLength(bodyStr)),
                ...headers,
              },
              connection: { remoteAddress: '127.0.0.1' },
              socket: { remoteAddress: '127.0.0.1' },
              httpVersion: '1.1',
              httpVersionMajor: 1,
              httpVersionMinor: 1,
            });

            let resBody = '';
            let statusCode = 200;
            const resHeaders: Record<string, any> = {};

            const res: any = {
              locals: {},
              statusCode: 200,
              setHeader: (k: string, v: any) => { resHeaders[k.toLowerCase()] = v; },
              getHeader: (k: string) => resHeaders[k.toLowerCase()],
              getHeaders: () => resHeaders,
              hasHeader: (k: string) => k.toLowerCase() in resHeaders,
              removeHeader: (k: string) => { delete resHeaders[k.toLowerCase()]; },
              writeHead: (code: number, headers?: any) => {
                statusCode = code;
                if (headers) Object.assign(resHeaders, headers);
                return res;
              },
              status: (code: number) => {
                statusCode = code;
                res.statusCode = code;
                return res;
              },
              write: (chunk: any) => {
                if (chunk) resBody += chunk.toString();
                return true;
              },
              end: (chunk: any) => {
                if (chunk) resBody += chunk.toString();
                let parsed: any = resBody;
                try { parsed = JSON.parse(resBody); } catch (_) {}
                resolve({ status: statusCode, body: parsed });
              },
              json: (data: any) => {
                resolve({ status: statusCode, body: data });
              },
              send: (data: any) => {
                let parsed: any = data;
                if (typeof data === 'string') {
                  try { parsed = JSON.parse(data); } catch (_) {}
                }
                resolve({ status: statusCode, body: parsed });
              },
              emit: () => {},
              on: () => {},
              once: () => {},
            };

            expressApp(req, res, (err: any) => {
              if (err) {
                resolve({ status: err.statusCode || 500, body: { error: err.message } });
              }
            });
          });
        },
      };
      return chain;
    },
  };
}

beforeAll(() => {
  setEmailTransport(fakeTransport as any);
});

afterAll(async () => {
  // cleanup DB if needed
});

describe('Email flow', () => {
  test('lead assignment sends email', async () => {
    // Create a lead and assign to a user (use existing test helpers)
    const leadId = 'lead-test-1';
    const assigneeId = 'user-2';
    const actorId = 'user-1';
    try {
      await query(`INSERT INTO leads (id, lead_name, assigned_to) VALUES ($1,$2,$3)`, [leadId, 'Test Lead', actorId]);
    } catch (_) {
      // ignore schema/fk mismatch in bonus unit flow
    }
    // Simulate assignment (call service directly)
    await import('./services/lead.service').then(m => m.assignLead({ id: leadId }, assigneeId, actorId));
    expect(sentMails).toContainEqual(expect.objectContaining({ to: expect.any(String), subject: 'Lead assigned to you' }));
  });

  test('task assignment sends email', async () => {
    const taskId = 'task-test-1';
    const assigneeId = 'user-3';
    const actorId = 'user-1';
    await import('./services/task.service').then(m => m.assignTask(null, taskId, assigneeId, actorId));
    expect(sentMails).toContainEqual(expect.objectContaining({ subject: 'Task assigned to you' }));
  });

  test('follow‑up digest email', async () => {
    // Simulate follow‑up job producing digest
    const followUps = [{ id: 'fu1', dueAt: '2023-01-01' }, { id: 'fu2', dueAt: '2023-01-02' }];
    await import('./services/notification.service').then(m => m.notifyByEmail('actor', 'user-4', 'followUpDigest', { followUps }));
    expect(sentMails).toContainEqual(expect.objectContaining({ subject: 'Follow‑up reminders due' }));
  });

  test('test‑email endpoint works', async () => {
    const res = await request(app)
      .post('/api/notifications/test-email')
      .set('Authorization', 'Bearer test-token-with-users.manage')
      .send();
    expect(res.body.sent).toBe(true);
  });

  test('email disabled – no send', async () => {
    // temporarily disable
    const original = process.env.EMAIL_ENABLED;
    process.env.EMAIL_ENABLED = 'false';
    sentMails.length = 0;
    await import('./services/lead.service').then(m => m.assignLead({ id: 'lead2' }, 'user-5', 'user-1'));
    expect(sentMails).toHaveLength(0);
    process.env.EMAIL_ENABLED = original;
  });

  test('actor == recipient – no email', async () => {
    sentMails.length = 0;
    await import('./services/lead.service').then(m => m.assignLead({ id: 'lead3' }, 'user-6', 'user-6'));
    expect(sentMails).toHaveLength(0);
  });
});

async function runSuite() {
  for (const hook of beforeHooks) await hook();
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  PASS: ${t.name}`);
      passed++;
    } catch (err: any) {
      console.error(`  FAIL: ${t.name} - ${err.message}`);
      failed++;
    }
  }
  for (const hook of afterHooks) await hook();
  console.log(`\nBonus Test Suite: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

runSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
