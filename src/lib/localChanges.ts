/**
 * Announces a local StudyDesk storage write to this document.
 *
 * Browser `storage` events deliberately do not fire in the tab that performed
 * the write. The app's React stores and the cloud-sync engine both need that
 * notification, so writes go through this tiny, DOM-local event as well.
 */
import { getActiveStorageProfile, type StorageProfileId } from './safeStorage';

export const LOCAL_STORAGE_CHANGE = 'studydesk:local-storage-change';

export interface LocalStorageChange {
  key: string;
  value: string | null;
  profileId?: StorageProfileId;
}

export function announceLocalStorageChange(
  change: Omit<LocalStorageChange, 'profileId'> & { profileId?: StorageProfileId },
): void {
  window.dispatchEvent(
    new CustomEvent<LocalStorageChange>(LOCAL_STORAGE_CHANGE, {
      detail: { ...change, profileId: change.profileId ?? getActiveStorageProfile() },
    }),
  );
}
