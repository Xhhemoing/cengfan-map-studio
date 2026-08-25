/**
 * Canvas-side entry point for the shared destination-card obstacle set.
 *
 * The implementation moved to `src/lib/card-layout-element-obstacles.ts` so the AI
 * `auto_layout` tool can build the exact same obstacles without a lib → component
 * dependency. This re-export keeps the canvas imports pointing at their own folder.
 */

export {
  collectElementObstacles,
  decorationLayoutObstacle,
  textLayoutObstacle,
  type ElementObstacleInput,
} from "../../lib/card-layout-element-obstacles";
