export interface EditableConfig {
  system_prompt: string;
  tone: string;
  primary_model: string;
  fallback_model: string;
  temperature: number;
  timeout_s: number;
}

const FIELDS: (keyof EditableConfig)[] = ['system_prompt', 'tone', 'primary_model', 'fallback_model', 'temperature', 'timeout_s'];

/** Only the fields that differ from the current version are sent (field-level rights are checked per field). */
export function configChanges(current: EditableConfig, form: EditableConfig): Partial<EditableConfig> {
  const out: Partial<EditableConfig> = {};
  for (const f of FIELDS) {
    const a = current[f];
    const b = form[f];
    const same = typeof a === 'number' ? Number(a) === Number(b) : String(a).trim() === String(b).trim();
    if (!same) (out as Record<string, unknown>)[f] = b;
  }
  return out;
}
