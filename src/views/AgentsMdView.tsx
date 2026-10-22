import { ArrowLeft } from 'lucide-react';
import MarkdownIt from 'markdown-it';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MdEditor from 'react-markdown-editor-lite';
import 'react-markdown-editor-lite/lib/index.css';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useThemeContext } from '@/contexts/ThemeContext';
import { readTextFile, writeFile } from '@/services';
import { useAgentSettingsStore, useLayoutStore, useWorkspaceStore } from '@/stores';
import { getErrorMessage } from '@/utils/errorUtils';

const CODEX_INSTRUCTIONS_FILE_NAME = 'AGENTS.md';

export default function AgentsMdView() {
  const { t } = useTranslation('app');
  const { selectedAgent, setSelectedAgent, instructionType, setInstructionType } =
    useAgentSettingsStore();
  const { cwd } = useWorkspaceStore();
  const { setView } = useLayoutStore();

  const [content, setContent] = useState('');
  const savedContentRef = useRef('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useThemeContext();
  const mdParser = useRef(new MarkdownIt());

  // Ensure we have default values
  const currentInstructionType = instructionType || 'project';

  // Set default values on mount if not set
  useEffect(() => {
    if (!selectedAgent) {
      setSelectedAgent('codex');
    }
    if (!instructionType) {
      setInstructionType('project');
    }
  }, [selectedAgent, instructionType, setSelectedAgent, setInstructionType]);

  const filePath = useMemo(() => {
    const fileName = CODEX_INSTRUCTIONS_FILE_NAME;

    if (currentInstructionType === 'system') {
      // System instructions: ~/.codex/AGENTS.md
      return `~/.codex/${fileName}`;
    } else {
      // Project instructions: $cwd/AGENTS.md
      if (cwd) {
        const trimmed = cwd.replace(/\/$/, '');
        return `${trimmed}/${fileName}`;
      }
      return fileName;
    }
  }, [cwd, currentInstructionType]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setStatusMessage(null);

    (async () => {
      try {
        const instructions = await readTextFile(filePath);
        if (active) {
          setContent(instructions);
          savedContentRef.current = instructions;
        }
      } catch (err) {
        // If file doesn't exist, start with empty content (for new files)
        const errorMsg = getErrorMessage(err);
        if (errorMsg.includes('does not exist')) {
          if (active) {
            setContent('');
            savedContentRef.current = '';
          }
        } else {
          if (active) {
            setError(errorMsg);
          }
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [filePath]);

  const saveContent = async () => {
    const contentToSave = content;
    setSaving(true);
    setError(null);
    setStatusMessage(null);
    try {
      await writeFile(filePath, contentToSave);
      savedContentRef.current = contentToSave;
      setStatusMessage(t('agentsMd.saved'));
      return true;
    } catch (err) {
      setError(getErrorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndLeave = async () => {
    if (await saveContent()) {
      setView('agent');
    }
  };

  const handleInstructionTypeChange = (type: string) => {
    setInstructionType(type as 'system' | 'project');
  };

  const handleBackToChats = () => {
    if (content !== savedContentRef.current) {
      setConfirmLeaveOpen(true);
      return;
    }
    setView('agent');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col border-b">
        {/* Tabs for Agent and Instruction Type */}
        <div className="p-2">
          <div className="flex items-center justify-between gap-2">
            <Button
              onClick={handleBackToChats}
              disabled={loading || saving}
              variant="ghost"
              size="sm"
            >
              <ArrowLeft data-icon="inline-start" />
              {t('agentsMd.back')}
            </Button>
            <div className="flex items-center gap-4">
              <Tabs
                value={currentInstructionType}
                onValueChange={handleInstructionTypeChange}
                className="w-auto"
              >
                <TabsList>
                  <TabsTrigger value="system">{t('agentsMd.system')}</TabsTrigger>
                  <TabsTrigger value="project">{t('agentsMd.project')}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </div>

        {/* File path and Save button */}
        <div className="flex items-center justify-between px-2">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground">{filePath}</p>
          <Button
            onClick={() => void saveContent()}
            disabled={loading || saving}
            variant="secondary"
          >
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        {loading ? (
          <div className="text-sm text-muted-foreground">{t('agentsMd.loading')}</div>
        ) : null}
        {error ? (
          <div className="rounded border border-destructive/70 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {statusMessage ? (
          <div className="rounded border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-900">
            {statusMessage}
          </div>
        ) : null}
        <div className={`min-h-0 ${theme === 'dark' ? 'rc-md-editor-dark' : ''}`}>
          <MdEditor
            value={content}
            style={{ height: 640 }}
            placeholder={t('agentsMd.placeholder')}
            renderHTML={(text) => mdParser.current.render(text)}
            onChange={({ text }) => setContent(text)}
          />
        </div>
      </div>
      <AlertDialog
        open={confirmLeaveOpen}
        onOpenChange={(open) => {
          if (!saving) setConfirmLeaveOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('agentsMd.unsavedTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('agentsMd.unsavedDescription', { path: filePath })}
            </AlertDialogDescription>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>{t('agentsMd.keepEditing')}</AlertDialogCancel>
            <Button variant="destructive" disabled={saving} onClick={() => setView('agent')}>
              {t('agentsMd.discard')}
            </Button>
            <Button disabled={saving} onClick={() => void handleSaveAndLeave()}>
              {saving ? t('common.saving') : t('agentsMd.saveAndLeave')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
