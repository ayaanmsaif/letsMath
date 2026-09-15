import type { ToolId } from "../model/store";
import { createEquationTool } from "./equation";
import { createEraserTool } from "./eraser";
import { createHandTool } from "./hand";
import { createInkTool } from "./ink";
import { createLaserTool } from "./laser";
import { createSelectTool } from "./select";
import { createDragShapeTool, createPolygonTool } from "./shapes";
import { createTextTool } from "./text";
import type { Tool } from "./types";

const tools: Record<ToolId, Tool> = {
  select: createSelectTool(),
  hand: createHandTool(),
  pen: createInkTool("pen"),
  highlighter: createInkTool("highlighter"),
  eraser: createEraserTool(),
  line: createDragShapeTool("line"),
  arrow: createDragShapeTool("arrow"),
  rect: createDragShapeTool("rect"),
  ellipse: createDragShapeTool("ellipse"),
  polygon: createPolygonTool(),
  text: createTextTool(),
  equation: createEquationTool(),
  laser: createLaserTool(),
};

export const getTool = (id: ToolId): Tool => tools[id];
