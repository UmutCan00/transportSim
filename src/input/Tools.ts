import type { UIState } from '../core/types.ts';
import { ToolType } from '../core/types.ts';

export function createUIState(): UIState {
  return {
    activeTool: ToolType.Select,
    hoveredTile: null,
    selectedTile: null,
    selectedEntityId: null,
    selectedEntityType: null,
    activePanel: 'none',
    lineDragStart: null,
    toasts: [],
  };
}
