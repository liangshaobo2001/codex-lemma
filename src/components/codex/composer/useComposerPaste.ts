import type { ClipboardEvent, KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { MAX_ATTACHMENT_BYTES, saveAttachment } from '@/services/apiAdapt/attachments';
import { hasNativeFileClipboard, readClipboardFiles } from '@/services/apiAdapt/clipboard';

export function clipboardFiles(data: DataTransfer): File[] {
  const files = Array.from(data.files ?? []);
  if (files.length) return files;
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}
export const isImagePath = (path: string) => /\.(png|jpe?g|gif|webp)$/i.test(path);

/** Async clipboard work stays bound to the draft where the gesture occurred. */
export function useComposerPaste(
  scope: string,
  onImages: (paths: string[]) => void,
  onFiles: (paths: string[]) => void,
  onText: (text: string) => void
) {
  const [pending, setPending] = useState(0);
  const current = useRef({ scope, onImages, onFiles, onText });
  current.current = { scope, onImages, onFiles, onText };
  const mounted = useRef(true);
  const browserPaste = useRef(0);
  const nativePending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const stillHere = (origin: string) => mounted.current && current.current.scope === origin;
  const finish = () => {
    if (mounted.current) setPending((n) => n - 1);
  };
  const fail = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : String(error));

  const importFiles = async (files: File[]) => {
    const origin = current.current.scope;
    if (files.length > 20) {
      fail(new Error('Paste at most 20 files at a time.'));
      return;
    }
    if (files.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
      fail(new Error('Each attachment must be 32 MiB or smaller.'));
      return;
    }
    setPending((n) => n + 1);
    try {
      for (const file of files) {
        const saved = await saveAttachment(file);
        if (!stillHere(origin)) return;
        if (saved.kind === 'image') current.current.onImages([saved.path]);
        else current.current.onFiles([saved.path]);
      }
    } catch (error) {
      if (stillHere(origin)) fail(error);
    } finally {
      finish();
    }
  };
  const nativePaste = async () => {
    if (!hasNativeFileClipboard() || nativePending.current) return;
    const origin = current.current.scope;
    const revision = browserPaste.current;
    nativePending.current = true;
    setPending((n) => n + 1);
    try {
      const paths = await readClipboardFiles();
      if (!stillHere(origin) || browserPaste.current !== revision || !paths.length) return;
      current.current.onImages(paths.filter(isImagePath));
      current.current.onFiles(paths.filter((path) => !isImagePath(path)));
    } catch (error) {
      if (stillHere(origin) && browserPaste.current === revision) fail(error);
    } finally {
      nativePending.current = false;
      finish();
    }
  };
  const onPasteCapture = (event: ClipboardEvent) => {
    const files = clipboardFiles(event.clipboardData);
    if (!files.length) {
      // Empty browser events can still represent Explorer's native CF_HDROP.
      if (!event.clipboardData.getData('text/plain')) nativePaste();
      return;
    }
    browserPaste.current += 1;
    event.preventDefault();
    event.stopPropagation();
    const text = event.clipboardData.getData('text/plain');
    if (text) current.current.onText(text);
    importFiles(files);
  };
  const onKeyDownCapture = (event: KeyboardEvent) => {
    if (
      ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') ||
      (event.shiftKey && event.key === 'Insert')
    ) {
      // Do not cancel normal text/image paste. Native files are a fallback only.
      nativePaste();
    }
  };
  return { pending: pending > 0, onPasteCapture, onKeyDownCapture };
}
