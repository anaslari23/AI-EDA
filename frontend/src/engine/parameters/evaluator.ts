import type {
  ParameterContext,
  ParameterDefinition,
  ParameterEvaluationResult,
  ParameterValue,
} from './types';
import { buildEvaluationOrder } from './dependencyGraph';

function evaluateExpression(expr: string, values: Record<string, ParameterValue>): ParameterValue {
  const keys = Object.keys(values);
  const args = keys.map((k) => values[k]);
  // Local expression evaluation for engineering parameters.
  const fn = new Function(...keys, `return (${expr});`);
  return fn(...args) as ParameterValue;
}

export function evaluateParameters(
  definitions: ParameterDefinition[],
  context: ParameterContext,
): ParameterEvaluationResult {
  const values: Record<string, ParameterValue> = { ...context.values };
  const changed: string[] = [];
  const errors: Array<{ parameterId: string; message: string }> = [];

  let order: string[] = [];
  try {
    order = buildEvaluationOrder(definitions);
  } catch (error) {
    return {
      values,
      changed,
      errors: [{ parameterId: '*', message: String(error) }],
    };
  }

  const byId = new Map(definitions.map((def) => [def.id, def]));
  for (const id of order) {
    const def = byId.get(id);
    if (!def) continue;

    try {
      const nextValue = evaluateExpression(def.expr, values);
      if (values[id] !== nextValue) {
        values[id] = nextValue;
        changed.push(id);
      }
    } catch (error) {
      errors.push({ parameterId: id, message: String(error) });
    }
  }

  return { values, changed, errors };
}
