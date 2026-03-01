export type ParameterValue = number | string | boolean;

export interface ParameterDefinition {
  id: string;
  expr: string;
}

export interface ParameterContext {
  values: Record<string, ParameterValue>;
}

export interface ParameterEvaluationResult {
  values: Record<string, ParameterValue>;
  changed: string[];
  errors: Array<{ parameterId: string; message: string }>;
}
