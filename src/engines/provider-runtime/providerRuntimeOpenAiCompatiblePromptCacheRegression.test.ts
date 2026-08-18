import { describe, expect, it } from 'vitest';
import { buildOpenAiCompatibleRequest } from './providerRuntimeOpenAiCompatibleAdapter';
import {
  createProviderRuntimeAdvanced,
  createProviderRuntimeTestContext,
  createProviderRuntimeTestProvider
} from './providerRuntimeFixtures';
import type { AssistantRequestContext } from '../request/requestContext';

function createOpenRouterClaudeRequest(context: AssistantRequestContext) {
  return buildOpenAiCompatibleRequest({
    api: createProviderRuntimeTestProvider({
      baseUrl: 'https://openrouter.ai/api/v1',
      path: '/chat/completions',
      model: 'anthropic/claude-sonnet-4.6',
      capabilities: {
        images: true,
        streaming: true,
        thinking: false
      }
    }),
    context,
    sessionId: 'phase-1-cache-regression',
    advanced: createProviderRuntimeAdvanced({ customBody: '' })
  });
}

function conversationMessages(context: AssistantRequestContext) {
  const segment = context.segments.find((entry) => entry.kind === 'conversation');
  if (!segment) throw new Error('Regression fixture requires a conversation segment.');
  return segment.messages;
}

function wireMessages(request: ReturnType<typeof buildOpenAiCompatibleRequest>) {
  if (!Array.isArray(request.body.messages)) {
    throw new Error('Expected OpenAI-compatible messages array.');
  }
  return request.body.messages as Array<Record<string, unknown>>;
}

function messagesWithRole(
  request: ReturnType<typeof buildOpenAiCompatibleRequest>,
  role: string
) {
  return wireMessages(request).filter((message) => message.role === role);
}

function expectFiveMinuteCacheBreakpoint(content: unknown) {
  expect(content).toEqual(expect.arrayContaining([
    expect.objectContaining({
      type: 'text',
      cache_control: { type: 'ephemeral' }
    })
  ]));
}

function expectNoCacheBreakpoint(content: unknown) {
  if (!Array.isArray(content)) return;
  expect(content).not.toEqual(expect.arrayContaining([
    expect.objectContaining({
      cache_control: expect.anything()
    })
  ]));
}

function pushToolResult(
  messages: ReturnType<typeof conversationMessages>,
  params: {
    id: string;
    payload: Record<string, unknown>;
  }
) {
  messages.push({
    role: 'tool',
    content: '',
    toolResult: {
      schemaVersion: 1,
      toolCallId: params.id,
      toolName: 'patchRawCss',
      status: 'executed',
      structuredPayload: params.payload
    }
  });
}

describe('OpenRouter Claude prompt-cache frontier across native tool history', () => {
  it('keeps the ordinary multi-turn rolling breakpoint on the latest conversational text', () => {
    const context = createProviderRuntimeTestContext({ withTools: true });
    conversationMessages(context).push(
      { role: 'assistant', content: 'First answer.' },
      { role: 'user', content: 'Second question.' }
    );

    const request = createOpenRouterClaudeRequest(context);
    const users = messagesWithRole(request, 'user');

    expect(request.body).not.toHaveProperty('cache_control');
    expect(request.body.session_id).toBe('phase-1-cache-regression');
    expectFiveMinuteCacheBreakpoint(users.at(-1)?.content);
  });

  it('advances the rolling breakpoint through a completed tool result when the tool-call assistant has no visible text', () => {
    const context = createProviderRuntimeTestContext({
      withTools: true,
      withToolHistory: true
    });
    const messages = conversationMessages(context);
    const toolCallAssistant = messages.find((message) =>
      message.role === 'assistant' && Boolean(message.toolCalls?.length)
    );
    if (!toolCallAssistant) throw new Error('Regression fixture requires an assistant tool call.');
    toolCallAssistant.content = '';

    const request = createOpenRouterClaudeRequest(context);
    const tools = messagesWithRole(request, 'tool');
    const users = messagesWithRole(request, 'user');

    expect(tools).toHaveLength(1);
    expectFiveMinuteCacheBreakpoint(tools[0]?.content);
    expectNoCacheBreakpoint(users.at(-1)?.content);
  });

  it('places one rolling breakpoint after all results from a completed parallel tool-call turn', () => {
    const context = createProviderRuntimeTestContext({
      withTools: true,
      withToolHistory: false
    });
    const messages = conversationMessages(context);
    messages.push({
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'call-parallel-1',
          name: 'patchRawCss',
          argumentsText: '{"value":"one"}'
        },
        {
          id: 'call-parallel-2',
          name: 'patchRawCss',
          argumentsText: '{"value":"two"}'
        }
      ]
    });
    pushToolResult(messages, {
      id: 'call-parallel-1',
      payload: { kind: 'patchRawCss', css: '.one { color: red; }' }
    });
    pushToolResult(messages, {
      id: 'call-parallel-2',
      payload: { kind: 'patchRawCss', css: '.two { color: blue; }' }
    });

    const request = createOpenRouterClaudeRequest(context);
    const tools = messagesWithRole(request, 'tool');

    expect(tools).toHaveLength(2);
    expectNoCacheBreakpoint(tools[0]?.content);
    expectFiveMinuteCacheBreakpoint(tools[1]?.content);
  });

  it('keeps a large completed tool result eligible for the rolling cache frontier', () => {
    const context = createProviderRuntimeTestContext({
      withTools: true,
      withToolHistory: false
    });
    const messages = conversationMessages(context);
    messages.push({
      role: 'assistant',
      content: '',
      toolCalls: [{
        id: 'call-large-result',
        name: 'patchRawCss',
        argumentsText: '{"value":"large"}'
      }]
    });
    pushToolResult(messages, {
      id: 'call-large-result',
      payload: {
        kind: 'patchRawCss',
        css: `/* large regression payload */\n${'x'.repeat(32_000)}`
      }
    });

    const request = createOpenRouterClaudeRequest(context);
    const tools = messagesWithRole(request, 'tool');

    expect(tools).toHaveLength(1);
    expectFiveMinuteCacheBreakpoint(tools[0]?.content);
  });
});
