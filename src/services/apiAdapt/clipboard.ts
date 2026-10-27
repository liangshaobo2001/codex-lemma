import { isDesktopTauri, isWindows } from '@/hooks/runtime';
import { invokeTauri } from './shared';
export const hasNativeFileClipboard = () => isDesktopTauri() && isWindows();
export const readClipboardFiles = () => invokeTauri<string[]>('read_clipboard_files');
