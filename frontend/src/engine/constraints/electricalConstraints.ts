import type { CircuitState, GraphPin, Net } from '../graph/models';

export interface ConstraintViolation {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  netId?: string;
  pinId?: string;
}

export interface ConstraintContext {
  state: CircuitState;
  sourcePin: GraphPin;
  targetPin: GraphPin;
  sourceNet?: Net;
  targetNet?: Net;
}

export type ConstraintRule = (ctx: ConstraintContext) => ConstraintViolation[];

const shortCircuitRule: ConstraintRule = (ctx) => {
  const src = ctx.sourcePin.direction;
  const tgt = ctx.targetPin.direction;
  if ((src === 'power' && tgt === 'ground') || (src === 'ground' && tgt === 'power')) {
    return [{
      code: 'E_SHORT_CIRCUIT',
      message: 'Power and ground cannot be directly connected.',
      severity: 'error',
      pinId: ctx.sourcePin.id,
    }];
  }
  return [];
};

const dualDriverRule: ConstraintRule = (ctx) => {
  if (ctx.sourcePin.direction === 'output' && ctx.targetPin.direction === 'output') {
    return [{
      code: 'E_BUS_CONTENTION',
      message: 'Two output pins cannot drive the same net.',
      severity: 'error',
    }];
  }
  return [];
};

const mixedDomainRule: ConstraintRule = (ctx) => {
  const srcDomain = ctx.sourcePin.voltageDomain;
  const tgtDomain = ctx.targetPin.voltageDomain;
  if (srcDomain && tgtDomain && srcDomain !== tgtDomain) {
    return [{
      code: 'W_MIXED_DOMAIN',
      message: `Connecting different voltage domains (${srcDomain} -> ${tgtDomain}).`,
      severity: 'warning',
    }];
  }
  return [];
};

export const DEFAULT_CONSTRAINT_RULES: ConstraintRule[] = [
  shortCircuitRule,
  dualDriverRule,
  mixedDomainRule,
];

export function evaluateConnectionConstraints(
  ctx: ConstraintContext,
  rules: ConstraintRule[] = DEFAULT_CONSTRAINT_RULES,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  for (const rule of rules) {
    violations.push(...rule(ctx));
  }
  return violations;
}
