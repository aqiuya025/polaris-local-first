import { describe, expect, it } from 'vitest';
import type { AssistantToolContext } from '../tool-protocol/assistantToolProtocolTypes';
import {
  isPolarisRegistryToolGroupEnabled,
  isPolarisToolGroupEnabled
} from '../tool-protocol/toolAvailability';
import { buildTemplateContext } from '../templateEngine';
import { normalizeRuntimeToolboxState } from '../../stores/runtimeStoreToolbox';
import { buildAssistantPromptParts } from './requestPromptLayers';

describe('Escape Pod task release gate', () => {
  it('keeps task tools disabled even when persisted preferences ask for them', () => {
    expect(isPolarisToolGroupEnabled({ task: true }, 'task')).toBe(false);
    expect(isPolarisRegistryToolGroupEnabled({ task: true }, 'task')).toBe(false);
  });

  it('normalizes old task settings back to the Escape Pod off state', () => {
    const normalized = normalizeRuntimeToolboxState({
      toolPromptPreferences: { task: true } as never,
      taskModeEnabled: true
    });

    expect(normalized.toolPromptPreferences.task).toBe(false);
    expect(normalized.taskModeEnabled).toBe(false);
  });

  it('does not replay an existing task ledger into model-facing system prompts', () => {
    const toolContext = {
      activeCard: null,
      visibleCards: [],
      taskMode: 'active',
      enabledToolGroups: { task: true },
      workContext: {
        taskLines: ['当前目标：这行绝不能进入 Escape Pod 请求。'],
        workspaceLines: [],
        feedbackLines: [],
        lines: ['当前目标：这行绝不能进入 Escape Pod 请求。'],
        hasActiveTask: true
      }
    } as AssistantToolContext;

    const parts = buildAssistantPromptParts({
      personaPrompt: '',
      personaPromptSource: 'none',
      templateContext: buildTemplateContext({
        modelId: 'anthropic/claude-sonnet-4.6',
        assistantName: 'Claude',
        now: new Date('2026-08-18T00:00:00Z')
      }),
      messages: [{
        id: 'user-1',
        role: 'user',
        content: '继续。',
        timestamp: 1
      }],
      currentTask: {
        id: 'task-legacy',
        title: '旧任务',
        mode: 'active',
        status: 'running',
        stage: '开始处理',
        steps: [],
        createdAt: 1,
        updatedAt: 1
      } as never,
      toolContext,
      toolProtocolMode: 'native-first'
    });

    const enabledParts = parts.filter((part) => part.enabled);
    expect(enabledParts.map((part) => part.name)).not.toContain('task_handoff_capability');
    expect(enabledParts.map((part) => part.name)).not.toContain('work_runtime_context');
    expect(enabledParts.map((part) => part.content).join('\n')).not.toContain('当前目标：这行绝不能进入 Escape Pod 请求。');
  });
});
