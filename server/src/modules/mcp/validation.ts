import { Ajv, type ValidateFunction } from 'ajv';
import { McpToolValidationError } from './errors.js';
import type { JsonSchema, McpToolDefinition } from './types.js';

const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
ajv.addFormat('date-time', (value: string) => /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)));
const validators = new WeakMap<JsonSchema, ValidateFunction>();

/** Validate exactly what we advertise, without coercion, defaulting, or removal. */
export function validateToolArguments(definition: McpToolDefinition, args: unknown): asserts args is Record<string, unknown> {
  let validate = validators.get(definition.inputSchema);
  if (!validate) {
    validate = ajv.compile(definition.inputSchema);
    validators.set(definition.inputSchema, validate);
  }
  if (!validate(args)) {
    const issues = validate.errors?.map((issue) => ({
      path: issue.instancePath || '/',
      message: issue.message ?? 'Invalid value',
      ...(issue.keyword === 'required' ? { missingProperty: issue.params.missingProperty } : {}),
    })) ?? [];
    throw new McpToolValidationError(`Invalid arguments for ${definition.name}: ${ajv.errorsText(validate.errors)}`, { issues });
  }
}
