/**
 * UI-local structural type for a finding (a `Warning` on the wire).
 *
 * Why structural and not `import { Warning }`: the core `Warning` enums
 * (`WarningLevel` / `WarningCategory` / `WarningSource`) are nominal string
 * enums whose members are NOT assignable to plain string-literal unions. Using
 * plain `string` fields here keeps a core `Warning[]` structurally assignable to
 * `FindingLike[]` (enum members ARE assignable to `string`) without dragging
 * core's Node-only runtime into the browser bundle. The string values are the
 * serialized contract the server emits.
 */
export interface FindingSuggestionLike {
  summary: string;
  reasoning: string;
  codeExample: string | null;
  autoFixable: boolean;
}

export interface FindingLike {
  id: string;
  category: string;
  level: string;
  title: string;
  description: string;
  affectedNodes: string[];
  suggestion: FindingSuggestionLike | null;
  source: string;
  /** 0..1 confidence this is a real, actionable finding. */
  confidence: number;
  dismissible: boolean;
}
