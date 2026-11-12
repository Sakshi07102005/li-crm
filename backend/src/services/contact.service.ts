import { AuthUser } from '../types/express';
import { query, withTransaction } from '../db/pool';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from './audit.service';
import { normalizeEmail, normalizeMobile } from '../utils/leadNormalizers';
import { CreateContactInput, UpdateContactInput } from '../validators/contact.validator';

export interface ContactResponse {
  id: string;
  companyId: string;
  fullName: string;
  designation: string | null;
  email: string | null;
  mobile: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getCompanyContacts(user: AuthUser, companyId: string): Promise<ContactResponse[]> {
  const compRes = await query<{ id: string }>(
    `SELECT id FROM companies WHERE id = $1 AND deleted_at IS NULL`,
    [companyId],
  );
  if (compRes.rowCount === 0) {
    throw AppError.notFound('Company not found');
  }

  const contactsRes = await query(
    `SELECT id, company_id AS "companyId", full_name AS "fullName", designation, email, mobile,
            is_primary AS "isPrimary", created_at AS "createdAt", updated_at AS "updatedAt"
     FROM contacts
     WHERE company_id = $1 AND deleted_at IS NULL
     ORDER BY is_primary DESC, created_at ASC`,
    [companyId],
  );

  return contactsRes.rows.map((r) => ({
    ...r,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  }));
}

export async function createContact(
  user: AuthUser,
  companyId: string,
  input: CreateContactInput,
  ip: string | null,
  ua: string | null,
): Promise<ContactResponse> {
  return withTransaction(async (client, commitNow) => {
    // Check company exists and is not deleted
    const compRes = await client.query<{ id: string }>(
      `SELECT id FROM companies WHERE id = $1 AND deleted_at IS NULL`,
      [companyId],
    );
    if (compRes.rowCount === 0) {
      throw AppError.notFound('Company not found');
    }

    // Check existing non-deleted contact count
    const countRes = await client.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM contacts WHERE company_id = $1 AND deleted_at IS NULL`,
      [companyId],
    );
    const existingCount = parseInt(countRes.rows[0].cnt, 10);

    let finalIsPrimary = false;
    if (existingCount === 0) {
      // First contact becomes primary automatically
      finalIsPrimary = true;
    } else if (input.isPrimary === true) {
      finalIsPrimary = true;
      // Unset previous primary before inserting due to partial unique index
      await client.query(
        `UPDATE contacts SET is_primary = FALSE WHERE company_id = $1 AND is_primary = TRUE AND deleted_at IS NULL`,
        [companyId],
      );
    }

    const normEmail = input.email ? normalizeEmail(input.email) : null;
    const normMobile = input.mobile ? normalizeMobile(input.mobile) : null;

    const insRes = await client.query(
      `INSERT INTO contacts (company_id, full_name, designation, email, mobile, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, company_id AS "companyId", full_name AS "fullName", designation, email, mobile,
                 is_primary AS "isPrimary", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        companyId,
        input.fullName.trim(),
        input.designation?.trim() ?? null,
        normEmail,
        normMobile,
        finalIsPrimary,
      ],
    );

    const contact = insRes.rows[0];

    await writeAuditLog(
      {
        userId: user.id,
        action: 'contact.create',
        entityType: 'contact',
        entityId: contact.id,
        newValues: {
          companyId,
          fullName: contact.fullName,
          isPrimary: contact.isPrimary,
        },
        ip,
        userAgent: ua,
      },
      client,
    );

    await commitNow();

    return {
      ...contact,
      createdAt: new Date(contact.createdAt).toISOString(),
      updatedAt: new Date(contact.updatedAt).toISOString(),
    };
  });
}

export async function updateContact(
  user: AuthUser,
  id: string,
  input: UpdateContactInput,
  ip: string | null,
  ua: string | null,
): Promise<ContactResponse> {
  return withTransaction(async (client, commitNow) => {
    const curRes = await client.query(
      `SELECT ct.*, c.deleted_at AS company_deleted_at
       FROM contacts ct
       JOIN companies c ON c.id = ct.company_id
       WHERE ct.id = $1 AND ct.deleted_at IS NULL
       FOR UPDATE OF ct`,
      [id],
    );

    if (curRes.rowCount === 0 || curRes.rows[0].company_deleted_at !== null) {
      throw AppError.notFound('Contact not found');
    }

    const current = curRes.rows[0];

    const targetFullName = input.fullName !== undefined ? input.fullName.trim() : current.full_name;
    const targetDesignation = input.designation !== undefined ? (input.designation?.trim() || null) : current.designation;
    const targetEmail = input.email !== undefined ? (input.email ? normalizeEmail(input.email) : null) : current.email;
    const targetMobile = input.mobile !== undefined ? (input.mobile ? normalizeMobile(input.mobile) : null) : current.mobile;

    const changes: Record<string, { old: any; new: any }> = {};
    if (targetFullName !== current.full_name) changes['fullName'] = { old: current.full_name, new: targetFullName };
    if (targetDesignation !== current.designation) changes['designation'] = { old: current.designation, new: targetDesignation };
    if (targetEmail !== current.email) changes['email'] = { old: current.email, new: targetEmail };
    if (targetMobile !== current.mobile) changes['mobile'] = { old: current.mobile, new: targetMobile };

    if (Object.keys(changes).length === 0) {
      await commitNow();
      return {
        id: current.id,
        companyId: current.company_id,
        fullName: current.full_name,
        designation: current.designation,
        email: current.email,
        mobile: current.mobile,
        isPrimary: current.is_primary,
        createdAt: new Date(current.created_at).toISOString(),
        updatedAt: new Date(current.updated_at).toISOString(),
      };
    }

    const updRes = await client.query(
      `UPDATE contacts SET
         full_name = $1,
         designation = $2,
         email = $3,
         mobile = $4,
         updated_at = NOW()
       WHERE id = $5
       RETURNING id, company_id AS "companyId", full_name AS "fullName", designation, email, mobile,
                 is_primary AS "isPrimary", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [targetFullName, targetDesignation, targetEmail, targetMobile, id],
    );

    const updated = updRes.rows[0];

    const oldVals: Record<string, any> = {};
    const newVals: Record<string, any> = {};
    for (const k of Object.keys(changes)) {
      oldVals[k] = changes[k].old;
      newVals[k] = changes[k].new;
    }

    await writeAuditLog(
      {
        userId: user.id,
        action: 'contact.update',
        entityType: 'contact',
        entityId: id,
        oldValues: oldVals,
        newValues: newVals,
        ip,
        userAgent: ua,
      },
      client,
    );

    await commitNow();

    return {
      ...updated,
      createdAt: new Date(updated.createdAt).toISOString(),
      updatedAt: new Date(updated.updatedAt).toISOString(),
    };
  });
}

export async function deleteContact(
  user: AuthUser,
  id: string,
  ip: string | null,
  ua: string | null,
): Promise<void> {
  await withTransaction(async (client, commitNow) => {
    const curRes = await client.query(
      `SELECT ct.*, c.deleted_at AS company_deleted_at
       FROM contacts ct
       JOIN companies c ON c.id = ct.company_id
       WHERE ct.id = $1 AND ct.deleted_at IS NULL
       FOR UPDATE OF ct`,
      [id],
    );

    if (curRes.rowCount === 0 || curRes.rows[0].company_deleted_at !== null) {
      throw AppError.notFound('Contact not found');
    }

    const contact = curRes.rows[0];
    const wasPrimary = contact.is_primary;
    const companyId = contact.company_id;

    // Soft delete
    await client.query(`UPDATE contacts SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);

    // If deleting the primary, promote the oldest remaining contact
    if (wasPrimary) {
      const oldestRes = await client.query<{ id: string }>(
        `SELECT id FROM contacts
         WHERE company_id = $1 AND deleted_at IS NULL
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE`,
        [companyId],
      );
      if (oldestRes.rowCount && oldestRes.rowCount > 0) {
        await client.query(`UPDATE contacts SET is_primary = TRUE, updated_at = NOW() WHERE id = $1`, [
          oldestRes.rows[0].id,
        ]);
      }
    }

    await writeAuditLog(
      {
        userId: user.id,
        action: 'contact.delete',
        entityType: 'contact',
        entityId: id,
        ip,
        userAgent: ua,
      },
      client,
    );

    await commitNow();
  });
}

export async function setPrimaryContact(
  user: AuthUser,
  id: string,
  ip: string | null,
  ua: string | null,
): Promise<ContactResponse> {
  return withTransaction(async (client, commitNow) => {
    const curRes = await client.query(
      `SELECT ct.*, c.deleted_at AS company_deleted_at
       FROM contacts ct
       JOIN companies c ON c.id = ct.company_id
       WHERE ct.id = $1 AND ct.deleted_at IS NULL
       FOR UPDATE OF ct`,
      [id],
    );

    if (curRes.rowCount === 0 || curRes.rows[0].company_deleted_at !== null) {
      throw AppError.notFound('Contact not found');
    }

    const contact = curRes.rows[0];
    const companyId = contact.company_id;

    if (!contact.is_primary) {
      // Unset previous primary first
      await client.query(
        `UPDATE contacts SET is_primary = FALSE, updated_at = NOW()
         WHERE company_id = $1 AND is_primary = TRUE AND deleted_at IS NULL`,
        [companyId],
      );

      // Set new primary
      await client.query(
        `UPDATE contacts SET is_primary = TRUE, updated_at = NOW() WHERE id = $1`,
        [id],
      );
    }

    await writeAuditLog(
      {
        userId: user.id,
        action: 'contact.primary',
        entityType: 'contact',
        entityId: id,
        ip,
        userAgent: ua,
      },
      client,
    );

    await commitNow();

    const updatedRes = await client.query(
      `SELECT id, company_id AS "companyId", full_name AS "fullName", designation, email, mobile,
              is_primary AS "isPrimary", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM contacts WHERE id = $1`,
      [id],
    );

    const r = updatedRes.rows[0];
    return {
      ...r,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    };
  });
}

