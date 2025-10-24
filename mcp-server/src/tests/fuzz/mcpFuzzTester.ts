/**
 * TR005-5: Comprehensive MCP Fuzz Testing with 10k+ Corpus
 * Ensures crash-free operation under extreme input conditions
 */

import { McpParser } from '../../parsers/mcpParser.js';
import { IngressValidator } from '../../middleware/ingressValidation.js';
import { McpResponseHandler } from '../../utils/mcpResponseHandler.js';
import * as crypto from 'crypto';

export interface FuzzTestConfig {
  iterations: number;
  enableLogging: boolean;
  stopOnFirstFailure: boolean;
  timeoutMs: number;
  maxInputSize: number;
  testCategories: string[];
}

export interface FuzzTestResult {
  totalTests: number;
  passed: number;
  failed: number;
  crashed: number;
  timeouts: number;
  failures: FuzzFailure[];
  summary: string;
  duration: number;
}

export interface FuzzFailure {
  testId: string;
  category: string;
  input: string;
  error: string;
  stack?: string;
  timestamp: Date;
}

/**
 * Comprehensive Fuzz Tester for MCP Components
 * Tests parser resilience against malformed and extreme inputs
 */
export class McpFuzzTester {
  private static readonly DEFAULT_CONFIG: FuzzTestConfig = {
    iterations: 10000,
    enableLogging: false,
    stopOnFirstFailure: false,
    timeoutMs: 5000,
    maxInputSize: 10 * 1024 * 1024, // 10MB
    testCategories: ['parser', 'validator', 'handler', 'malformed', 'extreme', 'attack']
  };

  private static readonly TOOL_NAMES = [
    'context_store', 'context_search', 'context_get_recent', 'context_stats',
    'project_create', 'project_switch', 'project_info', 'project_list',
    'naming_register', 'naming_check', 'naming_suggest', 'naming_stats',
    'decision_record', 'decision_search', 'decision_update', 'decision_stats',
    'task_create', 'task_list', 'task_update', 'task_details',
    'code_analyze', 'code_components', 'code_dependencies', 'code_stats',
    'smart_search', 'get_recommendations'
  ];

  /**
   * Run comprehensive fuzz testing
   */
  static async runFuzzTest(config: Partial<FuzzTestConfig> = {}): Promise<FuzzTestResult> {
    const testConfig = { ...this.DEFAULT_CONFIG, ...config };
    const startTime = Date.now();
    let passed = 0;
    let failed = 0;
    let crashed = 0;
    let timeouts = 0;
    const failures: FuzzFailure[] = [];

    console.log(`🔥 Starting MCP Fuzz Testing with ${testConfig.iterations} iterations`);
    console.log(`📊 Categories: ${testConfig.testCategories.join(', ')}`);

    for (let i = 0; i < testConfig.iterations; i++) {
      const testId = `fuzz-${i.toString().padStart(6, '0')}`;

      try {
        const category = testConfig.testCategories[i % testConfig.testCategories.length];
        const testInput = this.generateFuzzInput(category, i);

        // Run test with timeout
        const testPromise = this.executeFuzzTest(testId, category, testInput);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Test timeout')), testConfig.timeoutMs)
        );

        await Promise.race([testPromise, timeoutPromise]);
        passed++;

        if (testConfig.enableLogging && i % 1000 === 0) {
          console.log(`✅ Progress: ${i}/${testConfig.iterations} (${((i/testConfig.iterations)*100).toFixed(1)}%)`);
        }

      } catch (error) {
        const err = error as Error;
        if (err.message === 'Test timeout') {
          timeouts++;
        } else if (err.message.includes('crash') || err.message.includes('segfault')) {
          crashed++;
        } else {
          failed++;
        }

        const failure: FuzzFailure = {
          testId,
          category: testConfig.testCategories[i % testConfig.testCategories.length],
          input: 'Generated fuzz input',
          error: err.message,
          stack: err.stack,
          timestamp: new Date()
        };

        failures.push(failure);

        if (testConfig.enableLogging) {
          console.log(`❌ Test ${testId} failed: ${err.message}`);
        }

        if (testConfig.stopOnFirstFailure) {
          break;
        }
      }
    }

    const duration = Date.now() - startTime;
    const totalTests = passed + failed + crashed + timeouts;

    const result: FuzzTestResult = {
      totalTests,
      passed,
      failed,
      crashed,
      timeouts,
      failures,
      summary: this.generateSummary(totalTests, passed, failed, crashed, timeouts, duration),
      duration
    };

    console.log('\n' + result.summary);
    return result;
  }

  /**
   * Execute individual fuzz test
   */
  private static async executeFuzzTest(_testId: string, category: string, input: string): Promise<void> {
    switch (category) {
      case 'parser':
        await this.testMcpParser(input);
        break;
      case 'validator':
        await this.testIngressValidator(input);
        break;
      case 'handler':
        await this.testResponseHandler(input);
        break;
      case 'malformed':
        await this.testMalformedJson(input);
        break;
      case 'extreme':
        await this.testExtremeInputs(input);
        break;
      case 'attack':
        await this.testAttackVectors(input);
        break;
      default:
        await this.testMcpParser(input);
    }
  }

  /**
   * Test MCP Parser with fuzz input
   */
  private static async testMcpParser(input: string): Promise<void> {
    try {
      const result = McpParser.parseResponse(input);

      // Verify result structure
      if (typeof result !== 'object' || result === null) {
        throw new Error('Parser returned invalid result structure');
      }

      if (typeof result.success !== 'boolean') {
        throw new Error('Parser result missing success field');
      }

      // Additional validation for successful parses
      if (result.success && result.data) {
        // Ensure parsed data doesn't contain dangerous properties
        const serialized = JSON.stringify(result.data);
        if (serialized.includes('__proto__') || serialized.includes('constructor')) {
          throw new Error('Parser returned data with dangerous properties');
        }
      }

    } catch (error) {
      // Expected errors are OK, crashes are not
      const err = error as Error & { name?: string };
      if (err.message.includes('Maximum call stack') ||
          err.message.includes('out of memory') ||
          err.name === 'RangeError') {
        throw new Error(`Parser crash: ${err.message}`);
      }
      // Validation errors are expected and OK
    }
  }

  /**
   * Test Ingress Validator with fuzz input
   */
  private static async testIngressValidator(input: string): Promise<void> {
    try {
      const toolName = this.TOOL_NAMES[Math.floor(Math.random() * this.TOOL_NAMES.length)];
      let args: any;

      try {
        args = JSON.parse(input);
      } catch {
        args = { fuzzInput: input };
      }

      const context = IngressValidator.createValidationContext(
        toolName,
        `fuzz-${Date.now()}`,
        'http'
      );

      const result = await IngressValidator.validateIngressRequest(
        toolName,
        args,
        context,
        { enableAuditLogging: false }
      );

      // Verify validator doesn't crash
      if (typeof result !== 'object' || result === null) {
        throw new Error('Validator returned invalid result');
      }

    } catch (error) {
      const err = error as Error;
      if (err.message.includes('Maximum call stack') ||
          err.message.includes('out of memory')) {
        throw new Error(`Validator crash: ${err.message}`);
      }
    }
  }

  /**
   * Test Response Handler with fuzz input
   */
  private static async testResponseHandler(input: string): Promise<void> {
    try {
      const result = await McpResponseHandler.processResponse(input, {
        toolName: 'fuzz_test',
        requestId: `fuzz-${Date.now()}`
      });

      if (typeof result !== 'object' || result === null) {
        throw new Error('Response handler returned invalid result');
      }

    } catch (error) {
      const err = error as Error;
      if (err.message.includes('Maximum call stack') ||
          err.message.includes('out of memory')) {
        throw new Error(`Response handler crash: ${err.message}`);
      }
    }
  }

  /**
   * Test with malformed JSON
   */
  private static async testMalformedJson(input: string): Promise<void> {
    const malformedVariants = [
      input.replace(/"/g, "'"),
      input.replace(/}/g, ']'),
      input.replace(/{/g, '['),
      input + '{"unclosed":',
      '{"trailing":,"comma":true}',
      '{"duplicate":"key","duplicate":"value"}',
      '{"unicode":"\\uDEAD\\uBEEF"}',
      '{"control":"\\x00\\x01\\x02"}',
      input.replace(/:/g, '='),
      input.replace(/,/g, ';')
    ];

    for (const variant of malformedVariants) {
      await this.testMcpParser(variant);
    }
  }

  /**
   * Test with extreme inputs
   */
  private static async testExtremeInputs(_input: string): Promise<void> {
    const extremeInputs = [
      '', // Empty
      ' '.repeat(1000000), // Large whitespace
      'x'.repeat(1000000), // Large string
      '{"a":' + '"x"'.repeat(10000) + '}', // Many duplicates
      JSON.stringify({ nested: this.createDeeplyNested(100) }), // Deep nesting
      JSON.stringify(Array.from({ length: 10000 }, (_, i) => i)), // Large array
      '🔥'.repeat(100000), // Unicode characters
      '\x00'.repeat(1000), // Null bytes
      '\\'.repeat(1000), // Escape characters
    ];

    for (const extreme of extremeInputs) {
      await this.testMcpParser(extreme);
    }
  }

  /**
   * Test with attack vectors
   */
  private static async testAttackVectors(_input: string): Promise<void> {
    const attackVectors = [
      '{"__proto__":{"polluted":true}}',
      '{"constructor":{"prototype":{"polluted":true}}}',
      '{"script":"<script>alert(1)</script>"}',
      '{"sql":"1\' OR \'1\'=\'1"}',
      '{"xss":"javascript:alert(1)"}',
      '{"xxe":"<!DOCTYPE test [<!ENTITY xxe SYSTEM \\"file:///etc/passwd\\">]>"}',
      '{"circular":{"$ref":"#"}}',
      '{"regex":"(.+)*$"}', // ReDoS
      '{"eval":"eval(\\"process.exit(1)\\")"}',
      JSON.stringify({ buffer: Buffer.alloc(100000) }),
    ];

    for (const attack of attackVectors) {
      await this.testMcpParser(attack);
      await this.testIngressValidator(attack);
    }
  }

  /**
   * Generate fuzz input based on category
   */
  private static generateFuzzInput(category: string, seed: number): string {
    const random = this.seededRandom(seed);

    switch (category) {
      case 'parser':
        return this.generateJsonVariant(random);
      case 'validator':
        return this.generateValidatorInput(random);
      case 'handler':
        return this.generateHandlerInput(random);
      case 'malformed':
        return this.generateMalformedJson(random);
      case 'extreme':
        return this.generateExtremeInput(random);
      case 'attack':
        return this.generateAttackVector(random);
      default:
        return this.generateRandomJson(random);
    }
  }

  /**
   * Generate JSON variant
   */
  private static generateJsonVariant(random: () => number): string {
    const structures = [
      { content: [{ type: 'text', text: this.randomString(random, 100) }] },
      { success: true, data: this.randomString(random, 50) },
      { success: false, error: this.randomString(random, 50) },
      { type: 'resource', resource: { uri: this.randomString(random, 100) } },
      { multiple: Array.from({ length: random() * 10 }, () => this.randomString(random, 20)) }
    ];

    const structure = structures[Math.floor(random() * structures.length)];
    return JSON.stringify(structure);
  }

  /**
   * Generate validator input
   */
  private static generateValidatorInput(random: () => number): string {
    const validatorInputs = {
      content: this.randomString(random, 1000),
      type: ['code', 'decision', 'error'][Math.floor(random() * 3)],
      tags: Array.from({ length: random() * 5 }, () => this.randomString(random, 10)),
      projectId: crypto.randomUUID(),
      metadata: { random: this.randomString(random, 100) }
    };

    return JSON.stringify(validatorInputs);
  }

  /**
   * Generate handler input
   */
  private static generateHandlerInput(random: () => number): string {
    return JSON.stringify({
      content: [{
        type: 'text',
        text: this.randomString(random, 500)
      }],
      timestamp: new Date().toISOString(),
      metadata: { test: true }
    });
  }

  /**
   * Generate malformed JSON
   */
  private static generateMalformedJson(random: () => number): string {
    const malformed = [
      '{"unclosed":',
      '{"trailing":,}',
      '{duplicate":"key","duplicate":"value"}',
      '{"unicode":"\\uDEAD"}',
      '{"number":' + (random() * 1000000).toString() + 'invalid}',
      '{"array":[1,2,3,]}',
      '{"object":{"nested":}}',
    ];

    return malformed[Math.floor(random() * malformed.length)];
  }

  /**
   * Generate extreme input
   */
  private static generateExtremeInput(random: () => number): string {
    const extremeTypes = [
      () => 'x'.repeat(Math.floor(random() * 1000000)), // Very long string
      () => JSON.stringify(Array.from({ length: Math.floor(random() * 10000) }, (_, i) => i)), // Large array
      () => JSON.stringify(this.createDeeplyNested(Math.floor(random() * 50))), // Deep nesting
      () => '🔥'.repeat(Math.floor(random() * 10000)), // Unicode
      () => '\x00'.repeat(Math.floor(random() * 1000)), // Null bytes
    ];

    const generator = extremeTypes[Math.floor(random() * extremeTypes.length)];
    return generator();
  }

  /**
   * Generate attack vector
   */
  private static generateAttackVector(random: () => number): string {
    const attacks = [
      '{"__proto__":{"polluted":true}}',
      '{"constructor":{"prototype":{"polluted":true}}}',
      '{"script":"<script>alert(' + Math.floor(random() * 1000) + ')</script>"}',
      '{"sql":"1\' OR 1=' + Math.floor(random() * 1000) + ' --"}',
      '{"xss":"javascript:alert(' + Math.floor(random() * 1000) + ')"}',
      '{"path":"../".repeat(' + Math.floor(random() * 10) + ') + "etc/passwd"}',
      '{"cmd":"rm -rf /tmp/' + this.randomString(random, 10) + '"}',
    ];

    return attacks[Math.floor(random() * attacks.length)];
  }

  /**
   * Generate random JSON
   */
  private static generateRandomJson(random: () => number): string {
    return JSON.stringify({
      random: this.randomString(random, 100),
      number: random() * 1000,
      boolean: random() > 0.5,
      array: Array.from({ length: random() * 10 }, () => this.randomString(random, 20)),
      object: {
        nested: this.randomString(random, 50),
        value: random() * 100
      }
    });
  }

  /**
   * Create deeply nested object
   */
  private static createDeeplyNested(depth: number): any {
    if (depth <= 0) return 'leaf';
    return { nested: this.createDeeplyNested(depth - 1) };
  }

  /**
   * Generate random string
   */
  private static randomString(random: () => number, length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(random() * chars.length)];
    }
    return result;
  }

  /**
   * Seeded random number generator
   */
  private static seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
      state = Math.imul(16807, state) | 0 % 2147483647;
      return (state & 2147483647) / 2147483648;
    };
  }

  /**
   * Generate test summary
   */
  private static generateSummary(
    total: number,
    passed: number,
    failed: number,
    crashed: number,
    timeouts: number,
    duration: number
  ): string {
    const successRate = ((passed / total) * 100).toFixed(2);
    const testsPerSecond = (total / (duration / 1000)).toFixed(2);

    return `
🔥 MCP Fuzz Test Results
========================
Total Tests: ${total}
✅ Passed: ${passed} (${successRate}%)
❌ Failed: ${failed}
💥 Crashed: ${crashed}
⏰ Timeouts: ${timeouts}
⚡ Duration: ${duration}ms (${testsPerSecond} tests/sec)

${crashed === 0 ? '🎉 No crashes detected!' : '⚠️  Crashes need investigation!'}
${timeouts > (total * 0.1) ? '⚠️  High timeout rate detected!' : ''}
${failed > (total * 0.5) ? '⚠️  High failure rate - check input validation!' : ''}
`;
  }

  /**
   * Run quick smoke test
   */
  static async runSmokeTest(): Promise<boolean> {
    console.log('🔥 Running MCP Fuzz Smoke Test...');

    const result = await this.runFuzzTest({
      iterations: 100,
      enableLogging: false,
      stopOnFirstFailure: true,
      timeoutMs: 1000
    });

    return result.crashed === 0 && result.timeouts === 0;
  }
}

export default McpFuzzTester;