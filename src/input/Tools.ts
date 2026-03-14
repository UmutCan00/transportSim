import type { UIState } from '../core/types.ts';
import { ToolType } from '../core/types.ts';

export function createUIState(): UIState {
  return {
    activeTool: ToolType.Select,
    hoveredTile: null,
    selectedTile: null,
    selectedEntityId: null,
    selectedEntityType: null,
    quickRouteStartStationId: null,
    activePanel: 'none',
    lineDragStart: null,
    toasts: [],
    devTools: {
      config: {
        captureTicks: false,
        captureEconomy: true,
        captureObjectives: true,
        captureVehicles: false,
        vehicleInterval: 25,
        maxEntries: 2500,
        autoScroll: true,
      },
      logs: [],
    },
  };
}
