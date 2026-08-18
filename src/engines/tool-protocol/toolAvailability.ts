import { ESCAPE_POD_RELEASE_GATES } from '../../config/escapePodReleaseGates';
import type {
  AssistantToolContext,
  AssistantToolEnforcementScope,
  PolarisToolPromptGroup,
  PolarisToolPromptPreferences
} from './assistantToolProtocolTypes';
import type { PolarisRegistryToolGroup } from './toolRegistryShared';

export function resolvePolarisPromptGroup(group: PolarisRegistryToolGroup): PolarisToolPromptGroup {
  switch (group) {
    case 'card':
      return 'room';
    case 'cross-boundary':
    case 'project':
      return 'project';
    case 'desktop':
      return 'desktop';
    case 'mcp':
      return 'mcp';
    case 'task':
      return 'task';
    case 'theme-stable':
    case 'theme-creative':
      return 'theme';
    case 'generation':
      return 'generation';
    case 'knowledge':
      return 'knowledge';
    default:
      return group;
  }
}

export type PolarisContentToolScene = 'room' | 'workspace';

export function resolvePolarisContentToolScene(
  context?: Pick<AssistantToolContext, 'activeProject'> | undefined
): PolarisContentToolScene {
  return context?.activeProject ? 'workspace' : 'room';
}

function isPolarisToolGroupAllowedByScope(
  group: PolarisToolPromptGroup,
  enforcementScope?: AssistantToolEnforcementScope
) {
  if (group === 'task' && !ESCAPE_POD_RELEASE_GATES.taskSubsystem) {
    return false;
  }
  if (enforcementScope === 'theme-only') {
    return group === 'theme';
  }

  return true;
}

export function isPolarisToolGroupEnabled(
  preferences: PolarisToolPromptPreferences | undefined,
  group: PolarisToolPromptGroup,
  enforcementScope?: AssistantToolEnforcementScope
) {
  if (!isPolarisToolGroupAllowedByScope(group, enforcementScope)) {
    return false;
  }
  if (group === 'memoryWrite' || group === 'proactive' || group === 'personalData') {
    return preferences?.[group] === true;
  }
  if (group === 'knowledge') {
    return preferences?.knowledge === true;
  }
  if (!preferences) return true;
  return preferences[group] ?? true;
}

export function isPolarisRegistryToolGroupEnabled(
  preferences: PolarisToolPromptPreferences | undefined,
  group: PolarisRegistryToolGroup,
  enforcementScope?: AssistantToolEnforcementScope
) {
  return isPolarisToolGroupEnabled(preferences, resolvePolarisPromptGroup(group), enforcementScope);
}
