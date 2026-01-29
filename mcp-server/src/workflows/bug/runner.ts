/**
 * Bug Workflow Runner
 *
 * Executes AI analysis and implementation via Claude CLI.
 * Ported from ridgetopai-alpha/backend/src/taskRunner.ts
 */

import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import type {
  BugReport,
  BugAnalysis,
  CodeChange,
  ImplementationResult,
  Confidence,
} from '../contracts/index.js';

export interface RunnerConfig {
  timeoutMs: number;
  projectPath: string;
}

export interface RunnerResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  durationMs: number;
}

const DEFAULT_CONFIG: RunnerConfig = {
  timeoutMs: 300000, // 5 minutes
  projectPath: process.cwd(),
};

// Remote execution configuration
const REMOTE_USER = process.env.REMOTE_USER || 'ridgetop';
const REMOTE_PORT = process.env.REMOTE_PORT || '2222';
const REMOTE_HOST = process.env.REMOTE_HOST || 'localhost';
const USE_REMOTE = process.env.USE_REMOTE_EXECUTION === 'true';

// Spindles proxy configuration for activity streaming
const SPINDLES_PROXY_URL = process.env.SPINDLES_PROXY_URL || 'http://localhost:8082';

/**
 * Spawn Claude CLI either locally or remotely via SSH tunnel
 */
function spawnClaude(
  prompt: string,
  projectPath: string,
  env: NodeJS.ProcessEnv
): ChildProcess {
  if (USE_REMOTE) {
    const tempFile = `/tmp/claude-prompt-${Date.now()}.txt`;

    console.log(`[BugRunner] Remote execution via SSH tunnel to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PORT}`);
    console.log(`[BugRunner] Remote project path: ${projectPath}`);

    const remoteCommand = `bash -l -c 'cat > ${tempFile} && cd "${projectPath}" && claude --print --dangerously-skip-permissions "$(cat ${tempFile})" && rm -f ${tempFile}'`;

    const child = spawn('ssh', [
      '-p', REMOTE_PORT,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ConnectTimeout=10',
      `${REMOTE_USER}@${REMOTE_HOST}`,
      remoteCommand
    ], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }

    return child;
  } else {
    console.log(`[BugRunner] Local execution at: ${projectPath}`);
    console.log(`[BugRunner] Routing through spindles-proxy: ${SPINDLES_PROXY_URL}`);
    return spawn('claude', [
      '--print',
      '--dangerously-skip-permissions',
      prompt,
    ], {
      env: {
        ...env,
        ANTHROPIC_BASE_URL: SPINDLES_PROXY_URL,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: projectPath,
    });
  }
}

/**
 * Build the analysis prompt for bug fix workflow
 */
function buildAnalysisPrompt(
  bugReport: BugReport,
  projectPath: string,
  mandrelContext?: string
): string {
  return `You are analyzing a bug report for a codebase at: ${projectPath}
${mandrelContext || ''}

## Bug Report

**Title:** ${bugReport.title}

**Description:** ${bugReport.description}

**Severity:** ${bugReport.severity}

${bugReport.stepsToReproduce ? `**Steps to Reproduce:**\n${bugReport.stepsToReproduce}\n` : ''}
${bugReport.expectedBehavior ? `**Expected Behavior:**\n${bugReport.expectedBehavior}\n` : ''}
${bugReport.actualBehavior ? `**Actual Behavior:**\n${bugReport.actualBehavior}\n` : ''}

## Your Task

1. Analyze this bug report and identify the likely root cause
2. Search the codebase to find relevant files and evidence
3. Propose a fix with specific code changes

## Output Format

You MUST respond with a JSON object in this exact format (and nothing else):

\`\`\`json
{
  "rootCause": "Clear explanation of what is causing the bug",
  "evidence": "Code references and reasoning that support your analysis",
  "confidence": "high" | "medium" | "low",
  "questions": ["Optional array of clarifying questions if needed"],
  "proposedFix": {
    "explanation": "What the fix does and why it works",
    "changes": [
      {
        "file": "path/to/file.ts",
        "original": "original code snippet",
        "proposed": "proposed code change",
        "explanation": "why this change helps"
      }
    ],
    "risks": ["potential risks or side effects"],
    "testNeeds": ["tests that should be added or verified"]
  }
}
\`\`\`

Important:
- Be specific and cite actual file paths and code
- If you cannot find enough information, say so in the rootCause and set confidence to "low"
- Focus on the most likely root cause based on the symptoms
- Keep proposed changes minimal and surgical`;
}

/**
 * Parse Claude's output into structured BugAnalysis
 */
function parseAnalysisOutput(output: string): BugAnalysis {
  // Try to find JSON in the output
  const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      return {
        rootCause: parsed.rootCause || 'Unable to determine root cause',
        evidence: parsed.evidence || 'No evidence found',
        confidence: (parsed.confidence as Confidence) || 'low',
        questions: parsed.questions,
        proposedFix: parsed.proposedFix,
      };
    } catch (e) {
      console.error('[BugRunner] Failed to parse JSON from output:', e);
    }
  }

  // Fallback: try to parse the entire output as JSON
  try {
    const parsed = JSON.parse(output.trim());
    return {
      rootCause: parsed.rootCause || 'Unable to determine root cause',
      evidence: parsed.evidence || 'No evidence found',
      confidence: (parsed.confidence as Confidence) || 'low',
      questions: parsed.questions,
      proposedFix: parsed.proposedFix,
    };
  } catch {
    // Final fallback: return raw output as analysis
    return {
      rootCause: 'Analysis completed but output format was unexpected',
      evidence: output.substring(0, 500),
      confidence: 'low',
    };
  }
}

/**
 * Execute a bug analysis task using Claude CLI
 */
export async function runBugAnalysis(
  bugReport: BugReport,
  config: Partial<RunnerConfig> = {},
  mandrelContext?: string
): Promise<RunnerResult<BugAnalysis>> {
  const { timeoutMs, projectPath } = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  const prompt = buildAnalysisPrompt(bugReport, projectPath, mandrelContext);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    console.log(`[BugRunner] Starting bug analysis for: ${bugReport.title}`);
    console.log(`[BugRunner] Project path: ${projectPath}`);
    console.log(`[BugRunner] Timeout: ${timeoutMs}ms`);

    // Validate projectPath exists before spawning
    if (!existsSync(projectPath)) {
      console.error(`[BugRunner] Project path does not exist: ${projectPath}`);
      resolve({
        success: false,
        error: `Project path does not exist: ${projectPath}`,
        durationMs: Date.now() - startTime,
      });
      return;
    }

    const child: ChildProcess = spawnClaude(prompt, projectPath, process.env);

    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    };

    child.stdout?.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (stdout.length % 1000 < 100) {
        console.log(`[BugRunner] Received ${stdout.length} bytes of output...`);
      }
    });

    child.stderr?.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (chunk.includes('error') || chunk.includes('Error')) {
        console.error(`[BugRunner] stderr: ${chunk}`);
      }
    });

    child.on('error', (err) => {
      cleanup();
      console.error(`[BugRunner] Spawn error: ${err.message}`);
      resolve({
        success: false,
        error: `Failed to spawn claude CLI: ${err.message}`,
        durationMs: Date.now() - startTime,
      });
    });

    child.on('close', (code) => {
      cleanup();
      const durationMs = Date.now() - startTime;

      if (killed) {
        console.log('[BugRunner] Process killed due to timeout');
        resolve({
          success: false,
          error: 'Analysis timed out',
          durationMs,
        });
        return;
      }

      console.log(`[BugRunner] Claude CLI exited with code ${code}`);
      console.log(`[BugRunner] Analysis completed in ${durationMs}ms`);

      if (code !== 0) {
        resolve({
          success: false,
          error: `Claude CLI exited with code ${code}: ${stderr || stdout}`,
          durationMs,
        });
        return;
      }

      const analysis = parseAnalysisOutput(stdout);

      resolve({
        success: true,
        data: analysis,
        durationMs,
      });
    });

    // Set timeout
    timeoutHandle = setTimeout(() => {
      killed = true;
      console.log(`[BugRunner] Timeout reached (${timeoutMs}ms), killing process`);
      child.kill('SIGTERM');

      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, timeoutMs);
  });
}

/**
 * Build the implementation prompt for applying approved changes
 */
function buildImplementationPrompt(
  changes: CodeChange[],
  runTests: boolean,
  projectPath: string
): string {
  const changesDescription = changes.map((change, index) => `
### Change ${index + 1}: ${change.file}

**Original code to find:**
\`\`\`
${change.original}
\`\`\`

**Replace with:**
\`\`\`
${change.proposed}
\`\`\`

${change.explanation ? `**Rationale:** ${change.explanation}` : ''}
`).join('\n');

  return `You are implementing approved code changes for a codebase at: ${projectPath}

## Approved Changes

The user has reviewed and approved the following changes. Apply them EXACTLY as specified.

${changesDescription}

## Your Task

1. Apply each change to the specified file
2. Make ONLY the approved changes - do not modify anything else
3. Run the build to verify the code compiles cleanly
4. ${runTests ? 'Run the test suite to verify changes work correctly' : 'Skip test verification'}
5. Report what was done

## Output Format

You MUST respond with a JSON object in this exact format (and nothing else):

\`\`\`json
{
  "success": true | false,
  "changedFiles": ["list", "of", "files", "modified"],
  "buildResult": {
    "success": true | false,
    "command": "the build command used",
    "output": "summary of build output or errors"
  },
  ${runTests ? `"testResults": {
    "passed": <number>,
    "failed": <number>,
    "skipped": <number>,
    "duration": <milliseconds>,
    "output": "summary of test output"
  },` : ''}
  "warnings": ["any warnings encountered"],
  "errors": ["any errors encountered - empty array if success is true"]
}
\`\`\`

Important:
- Apply changes EXACTLY as specified - match whitespace and formatting
- Do not add extra changes or "improvements"
- If a file cannot be found, report it in errors
- If the build fails, report success: false with the build errors`;
}

/**
 * Parse implementation output into structured result
 */
function parseImplementationOutput(output: string): ImplementationResult {
  const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      return {
        success: parsed.success ?? false,
        changedFiles: parsed.changedFiles || [],
        buildResult: parsed.buildResult,
        testResults: parsed.testResults,
        warnings: parsed.warnings || [],
        errors: parsed.errors || [],
      };
    } catch (e) {
      console.error('[BugRunner] Failed to parse implementation JSON:', e);
    }
  }

  // Fallback: try to parse entire output as JSON
  try {
    const parsed = JSON.parse(output.trim());
    return {
      success: parsed.success ?? false,
      changedFiles: parsed.changedFiles || [],
      buildResult: parsed.buildResult,
      testResults: parsed.testResults,
      warnings: parsed.warnings || [],
      errors: parsed.errors || [],
    };
  } catch {
    return {
      success: false,
      changedFiles: [],
      warnings: [],
      errors: ['Implementation output format was unexpected'],
    };
  }
}

/**
 * Execute approved code changes using Claude CLI
 */
export async function runImplementation(
  changes: CodeChange[],
  config: Partial<RunnerConfig> = {},
  runTests: boolean = true
): Promise<RunnerResult<ImplementationResult>> {
  const { timeoutMs, projectPath } = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  const prompt = buildImplementationPrompt(changes, runTests, projectPath);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    console.log(`[BugRunner] Starting implementation: ${changes.length} changes`);
    console.log(`[BugRunner] Project path: ${projectPath}`);
    console.log(`[BugRunner] Run tests: ${runTests}`);

    // Validate projectPath exists before spawning
    if (!existsSync(projectPath)) {
      console.error(`[BugRunner] Project path does not exist: ${projectPath}`);
      resolve({
        success: false,
        error: `Project path does not exist: ${projectPath}`,
        durationMs: Date.now() - startTime,
      });
      return;
    }

    const child: ChildProcess = spawnClaude(prompt, projectPath, process.env);

    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    };

    child.stdout?.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (stdout.length % 1000 < 100) {
        console.log(`[BugRunner] Implementation: ${stdout.length} bytes received...`);
      }
    });

    child.stderr?.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (chunk.includes('error') || chunk.includes('Error')) {
        console.error(`[BugRunner] Implementation stderr: ${chunk}`);
      }
    });

    child.on('error', (err) => {
      cleanup();
      console.error(`[BugRunner] Implementation spawn error: ${err.message}`);
      resolve({
        success: false,
        error: `Failed to spawn claude CLI: ${err.message}`,
        durationMs: Date.now() - startTime,
      });
    });

    child.on('close', (code) => {
      cleanup();
      const durationMs = Date.now() - startTime;

      if (killed) {
        console.log('[BugRunner] Implementation killed due to timeout');
        resolve({
          success: false,
          error: 'Implementation timed out',
          durationMs,
        });
        return;
      }

      console.log(`[BugRunner] Implementation CLI exited with code ${code}`);
      console.log(`[BugRunner] Implementation completed in ${durationMs}ms`);
      console.log(`[BugRunner] Implementation stdout length: ${stdout.length}`);
      console.log(`[BugRunner] Implementation stdout (first 2000 chars): ${stdout.substring(0, 2000)}`);
      if (stderr) {
        console.log(`[BugRunner] Implementation stderr: ${stderr}`);
      }

      if (code !== 0) {
        resolve({
          success: false,
          error: `Claude CLI exited with code ${code}: ${stderr || stdout}`,
          durationMs,
        });
        return;
      }

      const result = parseImplementationOutput(stdout);
      console.log(`[BugRunner] Parsed implementation result:`, JSON.stringify(result, null, 2));

      resolve({
        success: result.success,
        data: result,
        durationMs,
      });
    });

    // Set timeout (implementation might take longer)
    timeoutHandle = setTimeout(() => {
      killed = true;
      console.log(`[BugRunner] Implementation timeout reached (${timeoutMs}ms), killing process`);
      child.kill('SIGTERM');

      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, timeoutMs);
  });
}

/**
 * Check if claude CLI is available
 */
export async function checkClaudeAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('claude', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));

    setTimeout(() => {
      child.kill();
      resolve(false);
    }, 5000);
  });
}
