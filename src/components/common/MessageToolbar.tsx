import { cn } from 'cn';
import { useWindowFocus } from '@/hooks/useWindowFocus';
import { AddToTodo } from './AddToTodo';
import { CopyButton } from './CopyButton';

type MessageToolbarProps = {
  text: string;
  className?: string;
};

/**
 * Copy and add-to-todo actions shown under a message. The parent must carry the
 * `group` class; the toolbar appears while the message is hovered or focused.
 */
export const MessageToolbar = ({ text, className }: MessageToolbarProps) => {
  const isWindowFocused = useWindowFocus();

  return (
    <div
      className={cn(
        'invisible flex h-6 items-center gap-1 px-1',
        isWindowFocused && 'group-hover:visible group-focus-within:visible',
        className
      )}
    >
      <CopyButton text={text} />
      <AddToTodo text={text} />
    </div>
  );
};
