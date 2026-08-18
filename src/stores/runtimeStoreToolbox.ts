import { ESCAPE_POD_RELEASE_GATES } from '../config/escapePodReleaseGates';
import type { PolarisToolPromptGroup } from '../engines/tool-protocol/assistantToolProtocolTypes';
import { DEFAULT_POLARIS_TOOL_PROMPT_PREFERENCES } from '../engines/tool-protocol/toolPromptPreferences';

export type RuntimeToolboxState = {
  toolPromptPreferences: Record<PolarisToolPromptGroup, boolean>;
  taskModeEnabled: boolean;
};

function applyEscapePodToolboxGates(
  preferences: Record<PolarisToolPromptGroup, boolean>
) {
  if (ESCAPE_POD_RELEASE_GATES.taskSubsystem) return preferences;
  return {
    ...preferences,
    task: false
  };
}

export const DEFAULT_RUNTIME_TOOLBOX_STATE: RuntimeToolboxState = {
  toolPromptPreferences: applyEscapePodToolboxGates({
    ...DEFAULT_POLARIS_TOOL_PROMPT_PREFERENCES
  }),
  taskModeEnabled: false
};

export function normalizeRuntimeToolboxState(
  state?: (Partial<RuntimeToolboxState> & { forceToolUse?: boolean }) | null
): RuntimeToolboxState {
  return {
    toolPromptPreferences: applyEscapePodToolboxGates({
      ...DEFAULT_POLARIS_TOOL_PROMPT_PREFERENCES,
      ...state?.toolPromptPreferences
    }),
    taskModeEnabled: ESCAPE_POD_RELEASE_GATES.taskSubsystem
      ? state?.taskModeEnabled ?? state?.forceToolUse ?? false
      : false
  };
}
