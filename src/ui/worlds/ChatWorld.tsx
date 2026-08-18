import type { DragEvent } from 'react';
import { Suspense, lazy, useRef } from 'react';
import { loadThinkingSheetModule } from '../app-shell/appShellLazyModules';
import { Icon } from '../Icon';
import { ChatComposer } from './chat/composer/ChatComposer';
import { useComposerFileIngest } from './chat/composer/useComposerFileIngest';
import { ChatProvider } from './chat/ChatProvider';
import { MessageTimeline } from './chat/timeline/MessageTimeline';
import {
  useChatActions,
  useChatComposer,
  useChatPresentation,
  useChatStablePayload,
  useChatUi
} from './chat/context/ChatContext';
import type { ChatUiState } from './chat/context/ChatUiState';

const ThinkingSheet = lazy(() => loadThinkingSheetModule().then((module) => ({ default: module.ThinkingSheet })));

type ChatWorldProps = {
  shell: {
    isActiveWorld: boolean;
    isWorldSwitching: boolean;
    openToolbox: () => void;
    openProviderSettings: () => void;
  };
  ui: ChatUiState;
};

function formatModelLabel(rawModel: string | null | undefined, fallback: string) {
  const raw = rawModel?.trim();
  if (!raw) return fallback;
  const normalized = raw.replace(/^anthropic\//i, '').replace(/^claude-/i, '');
  const match = normalized.match(/^(opus|sonnet|haiku)[-_]?([0-9]+(?:\.[0-9]+)?)/i);
  if (!match) return raw;
  const family = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
  return `${family} ${match[2]}`;
}

function resolveLatestModelLabel(
  messages: ReturnType<typeof useChatStablePayload>['messages'],
  configuredModel: string | undefined,
  fallback: string
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'assistant' && message.model?.trim()) {
      return formatModelLabel(message.model, fallback);
    }
  }
  return formatModelLabel(configuredModel, fallback);
}

function ChatWorldLayout({ shell }: ChatWorldProps) {
  const stablePayload = useChatStablePayload();
  const presentation = useChatPresentation();
  const composer = useChatComposer();
  const ui = useChatUi();
  const actions = useChatActions();
  const addComposerFiles = useComposerFileIngest();
  const dragDepthRef = useRef(0);
  const thinkingSummaryMessage = ui.thinkingSummaryMessageId
    ? stablePayload.messages.find((message) => message.id === ui.thinkingSummaryMessageId) ?? null
    : null;
  const modelLabel = resolveLatestModelLabel(
    stablePayload.messages,
    stablePayload.persona?.advanced.modelOverride,
    presentation.assistantName
  );
  const isFileDrag = (event: DragEvent<HTMLElement>) => event.dataTransfer?.types.includes('Files') ?? false;
  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    actions.setDragActive(true);
  };
  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (!composer.dragActive) actions.setDragActive(true);
  };
  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) actions.setDragActive(false);
  };
  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    actions.setDragActive(false);
    const files = event.dataTransfer?.files;
    if (files?.length) {
      void addComposerFiles(files);
    }
  };

  return (
    <section
      className={`world world-chat timeline-${presentation.timelineDensity} ${composer.dragActive ? 'drag-active' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="escape-pod-chat-topbar">
        <div className="escape-pod-chat-title" title={presentation.conversationTitle ?? undefined}>
          {presentation.conversationTitle?.trim() || 'New chat'}
        </div>
        <button
          type="button"
          className="escape-pod-chat-model"
          onClick={shell.openProviderSettings}
          title="Model settings"
          aria-label={`Model settings: ${modelLabel}`}
        >
          <span>{modelLabel}</span>
          <Icon name="chevron" size={12} />
        </button>
      </header>
      <div className="chat-body">
        <MessageTimeline isWorldSettled={shell.isActiveWorld && !shell.isWorldSwitching} />
      </div>
      <div className="chat-dock">
        <ChatComposer />
      </div>
      {thinkingSummaryMessage ? (
        <Suspense fallback={null}>
          <ThinkingSheet
            message={thinkingSummaryMessage}
            messages={stablePayload.messages}
            assistantName={presentation.fallbackAssistantName}
            onClose={actions.closeThinkingSummary}
          />
        </Suspense>
      ) : null}
    </section>
  );
}

export function ChatWorld(props: ChatWorldProps) {
  const normalizedShell = {
    isActiveWorld: props.shell.isActiveWorld,
    isWorldSwitching: props.shell.isWorldSwitching,
    openToolbox: props.shell.openToolbox,
    openProviderSettings: props.shell.openProviderSettings
  };

  return (
    <ChatProvider shell={normalizedShell} ui={props.ui}>
      <ChatWorldLayout {...props} />
    </ChatProvider>
  );
}
