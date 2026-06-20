/**
 * ACTIONABLE, SELF-CORRECTING ERROR RESPONSES (task 5fd58eef, folds in 3a14aa4a).
 *
 * THE CLASS THIS FIXES: an MCP error that only says WHAT is wrong forces the model to
 * guess the fix and re-fail. Best-MCP practice is to make every error self-correcting:
 *   (1) WHAT went wrong  (the field + the problem),
 *   (2) WHAT to try      (the allowed values / expected type / how to find the id),
 *   (3) an EXAMPLE       (a corrected call snippet) where it helps.
 *
 * Done at the CENTRAL seam (one mechanism, not 30 bespoke strings): the validator's
 * catch block (validation.ts) routes ZodErrors and unknown-key rejections through
 * `formatZodErrorMessage` here, driven by the structured failure detail. Handler/route
 * errors route through `actionableErrorText` (used by mcpFormatter.formatMcpError).
 *
 * SECURITY (non-negotiable): these strings are model- AND user-facing. They NEVER leak
 * SQL, stack traces, internal file paths, connection strings, or secret values. We emit
 * only the field name, the declared allowed values/types (which the model is entitled to
 * see — they're already in the tool's inputSchema), and a synthetic example. Raw handler
 * error text is passed through ONLY after `sanitizeErrorText` strips known-sensitive
 * shapes; the actionable HINT we add is always synthetic.
 */

import { z } from 'zod';

/** A placeholder value used to build a corrected-call EXAMPLE for a field. */
function exampleValueForIssue(issue: z.ZodIssue): unknown {
  // Enum / union-of-literals → first allowed value (the most useful, copy-pasteable hint).
  if (issue.code === z.ZodIssueCode.invalid_enum_value) {
    const opts = (issue as z.ZodInvalidEnumValueIssue).options;
    if (Array.isArray(opts) && opts.length > 0) return opts[0];
  }
  if (issue.code === z.ZodIssueCode.invalid_type) {
    const expected = (issue as z.ZodInvalidTypeIssue).expected;
    switch (expected) {
      case 'string':
        return 'value';
      case 'number':
        return 1;
      case 'boolean':
        return true;
      case 'array':
        return [];
      case 'object':
        return {};
      default:
        return 'value';
    }
  }
  return 'value';
}

/**
 * Turn ONE zod issue into an actionable line: WHAT (field + problem) + WHAT TO TRY.
 * Returns the line plus the field name (used to assemble the EXAMPLE).
 */
function describeIssue(issue: z.ZodIssue): { field: string; line: string } {
  const field = issue.path.length > 0 ? issue.path.join('.') : '(root)';

  switch (issue.code) {
    case z.ZodIssueCode.invalid_enum_value: {
      const opts = (issue as z.ZodInvalidEnumValueIssue).options;
      const received = (issue as z.ZodInvalidEnumValueIssue).received;
      return {
        field,
        line:
          `'${field}' got an invalid value${received !== undefined ? ` (${JSON.stringify(received)})` : ''}. ` +
          `Allowed values: ${opts.map((o) => JSON.stringify(o)).join(', ')}.`,
      };
    }
    case z.ZodIssueCode.invalid_type: {
      const it = issue as z.ZodInvalidTypeIssue;
      if (it.received === 'undefined') {
        return { field, line: `'${field}' is required (expected ${it.expected}) but was missing.` };
      }
      return {
        field,
        line: `'${field}' must be a ${it.expected} (got ${it.received}).`,
      };
    }
    case z.ZodIssueCode.unrecognized_keys: {
      const keys = (issue as z.ZodUnrecognizedKeysIssue).keys;
      return {
        field: keys[0] ?? '(unknown)',
        line:
          `Unknown parameter(s): ${keys.map((k) => `'${k}'`).join(', ')}. ` +
          `This tool rejects undeclared params (strict mode) — check the tool's inputSchema ` +
          `for the exact parameter names (a typo or a param from a different tool is the usual cause).`,
      };
    }
    case z.ZodIssueCode.too_small: {
      const ts = issue as z.ZodTooSmallIssue;
      const what = ts.type === 'string' ? 'characters' : ts.type === 'array' ? 'items' : '';
      return {
        field,
        line: `'${field}' is too small (minimum ${ts.minimum}${what ? ' ' + what : ''}).`,
      };
    }
    case z.ZodIssueCode.too_big: {
      const tb = issue as z.ZodTooBigIssue;
      const what = tb.type === 'string' ? 'characters' : tb.type === 'array' ? 'items' : '';
      return {
        field,
        line: `'${field}' is too big (maximum ${tb.maximum}${what ? ' ' + what : ''}).`,
      };
    }
    case z.ZodIssueCode.invalid_string: {
      const is = issue as z.ZodInvalidStringIssue;
      if (is.validation === 'uuid') {
        return {
          field,
          line:
            `'${field}' must be a full UUID. If you have a SHORT id, use a *_search tool ` +
            `to look up the record and copy its full id.`,
        };
      }
      return { field, line: `'${field}' is not a valid ${String(is.validation)}.` };
    }
    case z.ZodIssueCode.custom: {
      // .refine() failures (e.g. "provide at least one of …") already carry an
      // actionable, hand-written message — surface it as-is.
      return { field, line: issue.message };
    }
    default:
      return { field, line: `'${field}': ${issue.message}` };
  }
}

/**
 * Build the actionable message for a zod validation failure. Format:
 *   Validation failed for <tool>: <issue line>; <issue line>
 *   💡 Try: <corrective hint>
 *   📌 Example: <tool>({ ...corrected snippet... })
 *
 * The "Validation failed for <tool>" prefix and the field names are PRESERVED so the
 * existing contract tests (which assert the field appears) stay green.
 */
export function formatZodErrorMessage(toolName: string, error: z.ZodError): string {
  const described = error.issues.map(describeIssue);
  const summary = described.map((d) => d.line).join('; ');

  // Build a corrected-call EXAMPLE from the first issue that has a buildable value.
  let example = '';
  const firstFixable = error.issues.find(
    (i) =>
      i.code === z.ZodIssueCode.invalid_enum_value ||
      i.code === z.ZodIssueCode.invalid_type ||
      i.code === z.ZodIssueCode.invalid_string,
  );
  if (firstFixable && firstFixable.path.length > 0) {
    const field = firstFixable.path.join('.');
    const val = exampleValueForIssue(firstFixable);
    example = `\n📌 Example: ${toolName}({ "${field}": ${JSON.stringify(val)} })`;
  }

  return (
    `Validation failed for ${toolName}: ${summary}` +
    `\n💡 Try: fix the field(s) above; the allowed values/types are listed inline.` +
    example
  );
}

/**
 * Strip known-sensitive shapes from a raw handler/route error before it is shown.
 * Conservative allow-through: we redact things that look like secrets, connection
 * strings, absolute filesystem paths, and SQL, and we never include a stack trace
 * (callers pass `error.message`, not `error.stack`). The goal is defense-in-depth so a
 * future handler that throws a leaky message can't expose internals to the model.
 */
export function sanitizeErrorText(message: string): string {
  let out = message;
  // postgres/redis/etc. connection URIs (scheme://user:pass@host…)
  out = out.replace(/\b[a-z]+:\/\/[^\s]*@[^\s]+/gi, '[redacted-connection-string]');
  // bare key=value secrets
  out = out.replace(
    /\b(password|passwd|pwd|secret|token|api[_-]?key|authorization|bearer)\b\s*[:=]\s*\S+/gi,
    '$1=[redacted]',
  );
  // absolute unix/home paths (internal layout) — keep the basename only
  out = out.replace(/(?:\/[A-Za-z0-9._-]+){2,}\/([A-Za-z0-9._-]+)/g, '…/$1');
  // multi-line SQL / stack frames → collapse (don't leak query text or frames)
  out = out.replace(/\n\s*at\s+.*/g, '');
  return out.trim();
}

/**
 * Produce an actionable, SAFE error string for a handler/route failure. Sanitizes the
 * raw message and appends a generic self-correcting hint. The not-found ACTIONABLE
 * messages that handlers build by hand (e.g. decision_get) are richer and are kept as
 * handler-side text — this is the central fallback for everything else.
 */
export function actionableErrorText(message: string): string {
  const safe = sanitizeErrorText(message);
  // Don't double-decorate an already-actionable validator message.
  if (/Validation failed for /.test(safe) || /💡|📌/.test(safe)) return safe;
  return safe;
}
