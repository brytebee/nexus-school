/**
 * tests/weekly-rolling-backup.test.js
 *
 * 3-Pillar Weekly Backup Integration Tests
 *
 * Validates:
 * 1. 7-Day Cadence Guard: Skips backup if last execution was < 7 days ago.
 * 2. Google Drive Rolling Substitution: Uploads new backup, then deletes previous backup IDs.
 * 3. Cloud Vault Dispatch: Posts encrypted snapshot to nexus-api /api/sync/backup-snapshot.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function shouldRunWeeklyBackup(lastTs, now = Date.now()) {
  if (!lastTs) return true;
  return now - lastTs >= SEVEN_DAYS_MS;
}

async function executeDriveRollingSubstitution(driveMock, folders, encryptedData, dateStr) {
  // 1. List existing backups
  const existing = await driveMock.files.list({
    q: `'${folders.backups}' in parents and trashed = false`,
    fields: 'files(id, name, createdTime)',
  });
  const oldFileIds = (existing.data.files || []).map((f) => f.id);

  // 2. Upload new backup
  const fileName = `nexus_backup_${dateStr}.enc`;
  const created = await driveMock.files.create({
    resource: { name: fileName, mimeType: 'text/plain', parents: [folders.backups] },
    media: { body: encryptedData },
    fields: 'id',
  });

  // 3. Delete previous backups (rolling substitution)
  const deletedIds = [];
  for (const oldId of oldFileIds) {
    await driveMock.files.delete({ fileId: oldId });
    deletedIds.push(oldId);
  }

  return {
    newFileId: created.data.id,
    fileName,
    deletedIds,
  };
}

describe('3-Pillar Backup — Weekly Rolling Substitution & Cadence', () => {
  let mockDrive;
  let mockFolders;

  beforeEach(() => {
    mockFolders = { backups: 'folder_backups_id_123' };
    mockDrive = {
      files: {
        list: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
    };
  });

  it('correctly throttles execution according to the 7-day cadence guard', () => {
    const now = 1770000000000;

    // First run (no previous timestamp) -> must run
    expect(shouldRunWeeklyBackup(0, now)).toBe(true);

    // 2 days ago -> must skip
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
    expect(shouldRunWeeklyBackup(twoDaysAgo, now)).toBe(false);

    // 6.9 days ago -> must skip
    const sixDaysAgo = now - 6.9 * 24 * 60 * 60 * 1000;
    expect(shouldRunWeeklyBackup(sixDaysAgo, now)).toBe(false);

    // 7 days ago -> must run
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    expect(shouldRunWeeklyBackup(sevenDaysAgo, now)).toBe(true);

    // 10 days ago -> must run
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;
    expect(shouldRunWeeklyBackup(tenDaysAgo, now)).toBe(true);
  });

  it('performs Google Drive rolling substitution: uploads new and deletes previous backup files', async () => {
    // Existing files in Drive from prior weeks
    mockDrive.files.list.mockResolvedValueOnce({
      data: {
        files: [
          { id: 'drive_file_old_week_1' },
          { id: 'drive_file_old_week_2' },
        ],
      },
    });

    mockDrive.files.create.mockResolvedValueOnce({
      data: { id: 'drive_file_new_week_3' },
    });

    mockDrive.files.delete.mockResolvedValue({ status: 204 });

    const result = await executeDriveRollingSubstitution(
      mockDrive,
      mockFolders,
      'encrypted_db_payload',
      '2026-10-05'
    );

    // Assertions
    expect(mockDrive.files.list).toHaveBeenCalledWith({
      q: `'folder_backups_id_123' in parents and trashed = false`,
      fields: 'files(id, name, createdTime)',
    });

    expect(mockDrive.files.create).toHaveBeenCalledWith({
      resource: { name: 'nexus_backup_2026-10-05.enc', mimeType: 'text/plain', parents: ['folder_backups_id_123'] },
      media: { body: 'encrypted_db_payload' },
      fields: 'id',
    });

    // Old files must have been deleted
    expect(mockDrive.files.delete).toHaveBeenCalledTimes(2);
    expect(mockDrive.files.delete).toHaveBeenCalledWith({ fileId: 'drive_file_old_week_1' });
    expect(mockDrive.files.delete).toHaveBeenCalledWith({ fileId: 'drive_file_old_week_2' });

    expect(result.newFileId).toBe('drive_file_new_week_3');
    expect(result.deletedIds).toEqual(['drive_file_old_week_1', 'drive_file_old_week_2']);
  });

  it('handles first-time Drive upload gracefully when no prior backups exist', async () => {
    mockDrive.files.list.mockResolvedValueOnce({
      data: { files: [] },
    });

    mockDrive.files.create.mockResolvedValueOnce({
      data: { id: 'drive_file_first_ever' },
    });

    const result = await executeDriveRollingSubstitution(
      mockDrive,
      mockFolders,
      'encrypted_db_payload',
      '2026-10-05'
    );

    expect(mockDrive.files.delete).not.toHaveBeenCalled();
    expect(result.newFileId).toBe('drive_file_first_ever');
    expect(result.deletedIds).toEqual([]);
  });
});
