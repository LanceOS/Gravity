import { Ajv, type ValidateFunction } from 'ajv';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { McpToolValidationError } from './errors.js';
import type { JsonSchema, McpToolDefinition } from './types.js';

const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
ajv.addFormat('date-time', (value: string) => /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)));
const validators = new WeakMap<JsonSchema, ValidateFunction>();
const outputValidatorProvider = new AjvJsonSchemaValidator();
const outputValidators = new WeakMap<JsonSchema, (value: unknown) => boolean>();

/** Custom data schemas are checked against the JSON shape clients receive. */
export function isValidToolOutput(definition: McpToolDefinition, structuredContent: unknown): boolean {
  const schema = definition.outputSchema;
  const dataSchema = schema?.properties?.data;
  if (!schema || !dataSchema || Object.keys(dataSchema).length === 0) return true;
  let validate = outputValidators.get(schema);
  if (!validate) {
    const sdkValidate = outputValidatorProvider.getValidator(schema);
    validate = (value) => sdkValidate(value).valid;
    outputValidators.set(schema, validate);
  }
  return validate(JSON.parse(JSON.stringify(structuredContent)));
}

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
