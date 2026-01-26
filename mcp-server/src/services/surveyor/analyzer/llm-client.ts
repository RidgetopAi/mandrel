/**
 * OpenAI-compatible LLM client for behavioral analysis
 * Supports Grok, OpenAI, and other compatible APIs
 */

import type { AnalyzerConfig, AnalysisResult } from '../types/index.js';
import type { BehavioralFlags } from '../types/node.types.js';

/**
 * Chat message format for OpenAI-compatible APIs
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * OpenAI-compatible chat completion response
 */
interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * LLM client for function analysis
 */
export class LLMClient {
  private config: AnalyzerConfig;

  constructor(config: AnalyzerConfig) {
    this.config = config;
  }

  /**
   * Analyze a function and return behavioral summary
   */
  async analyzeFunction(
    functionName: string,
    functionCode: string,
    filePath: string
  ): Promise<AnalysisResult> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(functionName, functionCode, filePath);

    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    return this.parseResponse(response);
  }

  /**
   * Send chat completion request to LLM API
   */
  private async chat(messages: ChatMessage[]): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as ChatCompletionResponse;

      if (!data.choices?.[0]?.message?.content) {
        throw new Error('No content in LLM response');
      }

      return data.choices[0].message.content;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Build system prompt for function analysis
   */
  private buildSystemPrompt(): string {
    return `You are a code analyzer. Analyze TypeScript/JavaScript functions and respond with JSON only.

Your response must be valid JSON with exactly this structure:
{
  "summary": "One-line description of what the function does (max 100 chars)",
  "flags": {
    "databaseRead": false,
    "databaseWrite": false,
    "httpCall": false,
    "fileRead": false,
    "fileWrite": false,
    "sendsNotification": false,
    "modifiesGlobalState": false,
    "hasSideEffects": false
  }
}

Flag definitions:
- databaseRead: Reads from database (SELECT, find, get queries)
- databaseWrite: Writes to database (INSERT, UPDATE, DELETE, save, create)
- httpCall: Makes HTTP requests (fetch, axios, http client)
- fileRead: Reads from filesystem (readFile, createReadStream)
- fileWrite: Writes to filesystem (writeFile, createWriteStream)
- sendsNotification: Sends emails, push notifications, SMS
- modifiesGlobalState: Modifies global/singleton state
- hasSideEffects: Any observable effect outside the function

Respond with JSON only. No markdown, no explanation, just the JSON object.`;
  }

  /**
   * Build user prompt with function details
   */
  private buildUserPrompt(
    functionName: string,
    functionCode: string,
    filePath: string
  ): string {
    // Truncate very long functions to avoid token limits
    const maxCodeLength = 2000;
    const truncatedCode = functionCode.length > maxCodeLength
      ? functionCode.slice(0, maxCodeLength) + '\n// ... truncated'
      : functionCode;

    return `Analyze this function:

File: ${filePath}
Function: ${functionName}

\`\`\`typescript
${truncatedCode}
\`\`\``;
  }

  /**
   * Parse LLM response into AnalysisResult
   */
  private parseResponse(response: string): AnalysisResult {
    // Try to extract JSON from response (in case of markdown wrapping)
    let jsonStr = response.trim();

    // Remove markdown code blocks if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonStr = jsonMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(jsonStr);

      // Validate and extract summary
      const summary = typeof parsed.summary === 'string'
        ? parsed.summary.slice(0, 150)
        : 'Unable to generate summary';

      // Validate and extract flags
      const flags: BehavioralFlags = {
        databaseRead: Boolean(parsed.flags?.databaseRead),
        databaseWrite: Boolean(parsed.flags?.databaseWrite),
        httpCall: Boolean(parsed.flags?.httpCall),
        fileRead: Boolean(parsed.flags?.fileRead),
        fileWrite: Boolean(parsed.flags?.fileWrite),
        sendsNotification: Boolean(parsed.flags?.sendsNotification),
        modifiesGlobalState: Boolean(parsed.flags?.modifiesGlobalState),
        hasSideEffects: Boolean(parsed.flags?.hasSideEffects),
      };

      // Set hasSideEffects if any other flag is true
      if (!flags.hasSideEffects) {
        flags.hasSideEffects =
          flags.databaseRead ||
          flags.databaseWrite ||
          flags.httpCall ||
          flags.fileRead ||
          flags.fileWrite ||
          flags.sendsNotification ||
          flags.modifiesGlobalState;
      }

      return {
        summary,
        flags,
        rawResponse: response,
      };
    } catch {
      // Return a fallback result if parsing fails
      return {
        summary: 'Analysis failed - could not parse LLM response',
        flags: {
          databaseRead: false,
          databaseWrite: false,
          httpCall: false,
          fileRead: false,
          fileWrite: false,
          sendsNotification: false,
          modifiesGlobalState: false,
          hasSideEffects: false,
        },
        rawResponse: response,
      };
    }
  }
}

/**
 * Create an LLM client from environment variables
 */
export function createLLMClientFromEnv(): LLMClient {
  const config: AnalyzerConfig = {
    endpoint: process.env.SURVEYOR_LLM_ENDPOINT || 'https://api.x.ai/v1/chat/completions',
    apiKey: process.env.SURVEYOR_LLM_API_KEY || '',
    model: process.env.SURVEYOR_LLM_MODEL || 'grok-4-1-fast-reasoning',
    maxTokens: parseInt(process.env.SURVEYOR_LLM_MAX_TOKENS || '256', 10),
    temperature: parseFloat(process.env.SURVEYOR_LLM_TEMPERATURE || '0.1'),
    timeout: parseInt(process.env.SURVEYOR_LLM_TIMEOUT || '30000', 10),
    concurrency: parseInt(process.env.SURVEYOR_LLM_CONCURRENCY || '5', 10),
  };

  if (!config.apiKey) {
    throw new Error(
      'SURVEYOR_LLM_API_KEY environment variable is required for behavioral analysis'
    );
  }

  return new LLMClient(config);
}
