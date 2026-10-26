import { createTwoFilesPatch } from 'diff';

const MAX_SOURCE_CHARS = 1024 * 1024;
const MAX_SOURCE_LINES = 12000;
const MAX_PATCH_LINES = 3000;
export function boundedDiff(path: string, oldText: string, newText: string): string | null {
  if (oldText.length + newText.length > MAX_SOURCE_CHARS) return null;
  if (oldText.split('\n').length + newText.split('\n').length > MAX_SOURCE_LINES) return null;
  const raw = createTwoFilesPatch(`a/${path}`, `b/${path}`, oldText, newText, '', '', {
    context: 3,
    maxEditLength: 2000,
    timeout: 25,
  });
  if (!raw || raw.split('\n').length > MAX_PATCH_LINES) return null;
  const body = raw
    .split('\n')
    .filter((line) => !line.startsWith('Index: ') && !line.startsWith('===='))
    .join('\n');
  return `diff --git a/${path} b/${path}\n${body}`;
}
