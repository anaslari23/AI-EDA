import type { ParameterDefinition } from './types';

const TOKEN = /[A-Za-z_][A-Za-z0-9_]*/g;

export function extractDependencies(expr: string): string[] {
  const deps = new Set<string>();
  const matches = expr.match(TOKEN) ?? [];
  for (const token of matches) {
    if (!Number.isNaN(Number(token))) continue;
    deps.add(token);
  }
  return [...deps];
}

export function buildEvaluationOrder(definitions: ParameterDefinition[]): string[] {
  const graph = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();

  for (const def of definitions) {
    indegree.set(def.id, 0);
    graph.set(def.id, new Set());
  }

  for (const def of definitions) {
    const deps = extractDependencies(def.expr).filter((id) => indegree.has(id));
    for (const dep of deps) {
      graph.get(dep)?.add(def.id);
      indegree.set(def.id, (indegree.get(def.id) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of indegree) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);

    for (const nxt of graph.get(id) ?? []) {
      const deg = (indegree.get(nxt) ?? 0) - 1;
      indegree.set(nxt, deg);
      if (deg === 0) queue.push(nxt);
    }
  }

  if (order.length !== definitions.length) {
    throw new Error('Cyclic parameter dependency detected.');
  }

  return order;
}
