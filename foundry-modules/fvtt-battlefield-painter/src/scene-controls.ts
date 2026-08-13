import { MODULE_ID } from "./constants";

interface SceneControlGroup {
  tools?: Record<string, unknown>;
}

interface SceneControlsLike {
  tiles?: SceneControlGroup;
}

export const addPainterSceneControl = (
  controls: SceneControlsLike,
  isGameMaster: boolean,
  openPainter: () => unknown,
): boolean => {
  const tools = controls.tiles?.tools;
  if (!isGameMaster || !tools) return false;

  tools[MODULE_ID] = {
    name: MODULE_ID,
    title: "战场地形画笔",
    icon: "fa-solid fa-fire-flame-curved",
    button: true,
    onChange: openPainter,
  };
  return true;
};

