/**
 * Getting the message through: farm sensors pass messages from neighbour to neighbour until one reaches the gateway
 * (a mesh network). Two nodes can talk if they are within radio range. Breadth-first search finds each node's
 * shortest route; when a node fails, messages must find another way, or get cut off.
 */
export interface Node { id: number; x: number; y: number; gateway?: boolean }

/** A gateway at the farm office and sensors spread over the fields (map units are 100 m). */
export const NODES: Node[] = [
  { id: 0, x: 1, y: 1, gateway: true },
  { id: 1, x: 3, y: 1.5 }, { id: 2, x: 2, y: 3.5 }, { id: 3, x: 4.5, y: 3 }, { id: 4, x: 6, y: 1.5 },
  { id: 5, x: 3.5, y: 5.5 }, { id: 6, x: 6.5, y: 4.5 }, { id: 7, x: 8, y: 2.5 }, { id: 8, x: 5, y: 7.5 },
  { id: 9, x: 7.5, y: 6.5 }, { id: 10, x: 2, y: 7 }, { id: 11, x: 8.5, y: 8.5 },
];

const dist = (a: Node, b: Node) => Math.hypot(a.x - b.x, a.y - b.y);

/** Pairs of working nodes within range of each other. */
export function links(nodes: Node[], range: number, down: ReadonlySet<number>) {
  const up = nodes.filter((n) => !down.has(n.id)), out: [Node, Node][] = [];
  for (let i = 0; i < up.length; i++) for (let j = i + 1; j < up.length; j++) if (dist(up[i], up[j]) <= range) out.push([up[i], up[j]]);
  return out;
}

/** Breadth-first search from the gateway: each reachable node's hop count and the next node towards the gateway. */
export function routes(nodes: Node[], range: number, down: ReadonlySet<number>) {
  const gw = nodes.find((n) => n.gateway)!, res = new Map<number, { hops: number; next: number | null }>();
  if (down.has(gw.id)) return res;
  const nbrs = new Map<number, number[]>();
  for (const [a, b] of links(nodes, range, down)) { nbrs.set(a.id, [...(nbrs.get(a.id) ?? []), b.id]); nbrs.set(b.id, [...(nbrs.get(b.id) ?? []), a.id]); }
  res.set(gw.id, { hops: 0, next: null });
  const queue = [gw.id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of nbrs.get(cur) ?? []) if (!res.has(n)) { res.set(n, { hops: res.get(cur)!.hops + 1, next: cur }); queue.push(n); }
  }
  return res;
}

/** The route from a node to the gateway, or null if it is cut off. */
export function path(r: ReturnType<typeof routes>, id: number): number[] | null {
  if (!r.has(id)) return null;
  const out = [id];
  for (let cur = r.get(id)!.next; cur !== null; cur = r.get(cur)!.next) out.push(cur);
  return out;
}
