/**
 * Program a robot: grids that get harder, a program of command cards (each repeated up to 4 times), and the fewest
 * cards that can do it. The robot itself is content/robot.ts, the same one the lessons' blocks step uses.
 */
import { fewestBlocks, runRobot, MAX_TIMES } from "../../../content/robot";
import type { RobotBlock, RobotCommand, RobotWorld } from "../../../content/types";

export interface Level { world: RobotWorld; /** Most cards allowed. */ maxCards: number }
export const COMMANDS: RobotCommand[] = ["forward", "left", "right"];

const wall = (cells: string) => cells.split(" ").map((c) => { const [x, y] = c.split(",").map(Number); return { x, y }; });

/** From one straight line to a spiral. Fewest cards: 1, 2, 3, 6, 5 and 9. */
export const LEVELS: Level[] = [
  // 1. Straight ahead: one card, repeated.
  { world: { cols: 5, rows: 3, start: { x: 0, y: 1, dir: "E" }, goal: { x: 4, y: 1 } }, maxCards: 4 },
  // 2. Facing the wrong way: a turn can be repeated too.
  { world: { cols: 5, rows: 3, start: { x: 1, y: 1, dir: "W" }, goal: { x: 4, y: 1 } }, maxCards: 4 },
  // 3. One corner.
  { world: { cols: 4, rows: 4, start: { x: 0, y: 3, dir: "N" }, goal: { x: 3, y: 0 } }, maxCards: 5 },
  // 4. A wall in the way.
  { world: { cols: 5, rows: 4, start: { x: 0, y: 1, dir: "E" }, goal: { x: 4, y: 1 }, walls: wall("2,0 2,1 2,2") }, maxCards: 8 },
  // 5. The maze: the short walk needs more cards than the long one.
  { world: { cols: 5, rows: 5, start: { x: 0, y: 0, dir: "S" }, goal: { x: 4, y: 0 }, walls: wall("3,0 1,1 3,1 1,2 1,3 2,3 3,3") }, maxCards: 8 },
  // 6. Into the middle of a spiral.
  { world: { cols: 5, rows: 5, start: { x: 0, y: 4, dir: "N" }, goal: { x: 2, y: 2 }, walls: wall("1,1 2,1 3,1 1,2 3,2 1,3 3,3 1,4") }, maxCards: 11 },
];

/** How a run went: where the robot ended up, and whether it reached the goal. */
export const run = (level: Level, program: RobotBlock[]) => runRobot(level.world, program);
/** The fewest cards that can solve a level. */
export const best = (level: Level) => fewestBlocks(level.world, COMMANDS)!;

/** Tapping a card in the program repeats it once more: 1, 2, 3, 4, then back to 1. */
export const repeat = (program: RobotBlock[], i: number) => program.map((b, j) => (j === i ? { ...b, times: (b.times % MAX_TIMES) + 1 } : b));
/** The same walk with fewer cards: a card that follows the same command is folded into it (up to 4 times). */
export function fold(program: RobotBlock[]): RobotBlock[] {
  const out: RobotBlock[] = [];
  for (const b of program) for (let t = 0; t < b.times; t++) {
    const last = out[out.length - 1];
    if (last && last.cmd === b.cmd && last.times < MAX_TIMES) last.times++;
    else out.push({ cmd: b.cmd, times: 1 });
  }
  return out;
}
/** Stars: 3 with the fewest cards, 2 with one more, 1 for any program that gets there. */
export const stars = (used: number, fewest: number) => (used <= fewest ? 3 : used === fewest + 1 ? 2 : 1);
