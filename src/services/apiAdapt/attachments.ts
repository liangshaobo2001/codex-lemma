import { authHeaders, buildUrl } from '@/hooks/runtime';
export const MAX_ATTACHMENT_BYTES = 32 * 1024 * 1024;
export interface SavedAttachment {
  path: string;
  name: string;
  kind: 'image' | 'file';
}
export async function saveAttachment(file: File): Promise<SavedAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES)
    throw new Error('Each attachment must be 32 MiB or smaller.');
  const response = await fetch(
    `${buildUrl('/api/attachments')}?name=${encodeURIComponent(file.name || 'clipboard.png')}`,
    {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/octet-stream' },
      body: file,
    }
  );
  if (!response.ok) {
    let message = `Could not save attachment (HTTP ${response.status}).`;
    try {
      const error = await response.json();
      if (typeof error.error === 'string') message = error.error;
    } catch {
      /* Keep HTTP failure. */
    }
    throw new Error(message);
  }
  return response.json();
}
