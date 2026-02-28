/**
 * Rules barrel export — all 8 validation rules.
 */

export { checkVoltageCompatibility } from './voltageCompatibility';
export { checkMissingGround } from './missingGround';
export { checkFloatingInputs } from './floatingInputs';
export { checkShortCircuits } from './shortCircuits';
export { checkMultipleOutputs } from './multipleOutputs';
export { checkDecouplingCaps } from './decouplingCaps';
export { checkPullUpResistors } from './pullUpResistors';
export { checkGpioCurrent } from './gpioCurrent';
