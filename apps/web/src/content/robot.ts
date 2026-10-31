/**
 * The blocks robot (BlocksStep): runs a program of command cards on a grid. Pure, so the engine grades with it, the
 * player animates its path and the validator checks that a world can be solved. Copied to functions/src/shared/.
 */
import type { RobotBlock, RobotCommand, RobotDir, RobotWorld } from "./types";

const DIRS: RobotDir[] = ["N", "E", "S", "W"];
const MOVE: Record<RobotDir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
export const MAX_TIMES = 4;
export interface RobotPose { x: number; y: number; dir: RobotDir }
/** goal: ended on the goal; short: ended somewhere else; wall / edge: stopped by a wall or the grid's edge. */
export type RobotOutcome = "goal" | "short" | "wall" | "edge";

/** One command from a pose: the new pose, or why the robot can't. */
function step(world: RobotWorld, walls: Set<string>, p: RobotPose, cmd: RobotCommand): RobotPose | "wall" | "edge" {
  if (cmd !== "forward") return { ...p, dir: DIRS[(DIRS.indexOf(p.dir) + (cmd === "right" ? 1 : 3)) % 4] };
  const [dx, dy] = MOVE[p.dir], x = p.x + dx, y = p.y + dy;
  if (x < 0 || y < 0 || x >= world.cols || y >= world.rows) return "edge";
  return walls.has(`${x},${y}`) ? "wall" : { ...p, x, y };
}
const wallSet = (world: RobotWorld) => new Set((world.walls ?? []).map((w) => `${w.x},${w.y}`));

/** Every pose the robot passes through (the start first), and how the run ended. A program must end on the goal. */
export function runRobot(world: RobotWorld, program: RobotBlock[]): { path: RobotPose[]; outcome: RobotOutcome } {
  const walls = wallSet(world);
  let p: RobotPose = { ...world.start };
  const path = [p];
  for (const b of program) for (let i = 0; i < b.times; i++) {
    const next = step(world, walls, p, b.cmd);
    if (typeof next === "string") return { path, outcome: next };
    path.push((p = next));
  }
  return { path, outcome: p.x === world.goal.x && p.y === world.goal.y ? "goal" : "short" };
}

/** The fewest cards (each repeated 1–4 times) that take the robot to the goal with these commands; null if none can. */
export function fewestBlocks(world: RobotWorld, commands: RobotCommand[]): number | null {
  const walls = wallSet(world), key = (p: RobotPose) => `${p.x},${p.y},${p.dir}`;
  let frontier: RobotPose[] = [{ ...world.start }];
  const seen = new Set([key(world.start)]);
  for (let blocks = 0; frontier.length; blocks++) {
    if (frontier.some((p) => p.x === world.goal.x && p.y === world.goal.y)) return blocks;
    const next: RobotPose[] = [];
    for (const p of frontier) for (const cmd of commands) {
      let q: RobotPose = p;
      for (let t = 1; t <= MAX_TIMES; t++) {
        const r = step(world, walls, q, cmd);
        if (typeof r === "string") break;
        q = r;
        if (!seen.has(key(q))) { seen.add(key(q)); next.push(q); }
      }
    }
    frontier = next;
  }
  return null;
}
