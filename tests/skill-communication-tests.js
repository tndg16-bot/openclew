/**
 * スキル間通信プロトコル統合テスト
 * (Skill Communication Protocol Integration Tests)
 */

const { SkillEventBus, normalizeMessage, validateMessage } = require('../lib/skill-event-bus');
const { BaseSkillAdapter, SkillFactory } = require('../lib/skill-adapter');

/**
 * テスト用スキル実装
 */
class MockSkill extends BaseSkillAdapter {
  constructor(skillId, eventBus, config = {}) {
    super(skillId, eventBus, config);
    this.responses = [];
  }

  async handleRequest(message) {
    const { action, params } = message.payload;

    // テスト用のアクション処理
    switch (action) {
      case 'echo':
        await this.sendResponse(message, {
          status: 'success',
          data: params
        });
        break;

      case 'error':
        await this.sendResponse(message, {
          status: 'error',
          error: {
            code: 'ERR_TEST_ERROR',
            message: 'Test error response'
          }
        });
        break;

      case 'delayed':
        setTimeout(() => {
          this.sendResponse(message, {
            status: 'success',
            data: { delayed: true }
          });
        }, 100);
        break;

      default:
        await this.sendResponse(message, {
          status: 'error',
          error: {
            code: 'ERR_UNKNOWN_ACTION',
            message: `Unknown action: ${action}`
          }
        });
    }
  }
}

/**
 * テストスイート
 */
class SkillCommunicationTests {
  constructor() {
    this.eventBus = null;
    this.factory = null;
    this.skills = [];
    this.testResults = [];
  }

  /**
   * テストセットアップ
   */
  async setup() {
    console.log('\n=== Setup ===');

    // イベントバス初期化
    this.eventBus = new SkillEventBus();
    this.factory = new SkillFactory(this.eventBus);

    // テストスキルを登録
    this.factory.registerSkillType('skill-a', MockSkill);
    this.factory.registerSkillType('skill-b', MockSkill);
    this.factory.registerSkillType('skill-c', MockSkill);

    // スキルを初期化
    this.skills = await this.factory.initializeAll(['skill-a', 'skill-b', 'skill-c']);

    console.log(`✓ Initialized ${this.skills.length} skills`);
    console.log(`✓ Event bus ready`);
  }

  /**
   * テストティアダウン
   */
  async teardown() {
    console.log('\n=== Teardown ===');

    // 全てのスキルをシャットダウン
    for (const skill of this.skills) {
      await skill.shutdown();
    }

    // イベントバスをシャットダウン
    await this.eventBus.shutdown();

    console.log('✓ Cleanup complete');
  }

  /**
   * テスト実行
   */
  async runTests() {
    await this.setup();

    console.log('\n=== Running Tests ===\n');

    // テスト実行
    await this.testMessageNormalization();
    await this.testMessageValidation();
    await this.testDirectMessageSend();
    await this.testBroadcastMessage();
    await this.testRequestResponse();
    await this.testErrorHandling();
    await this.testTimeoutHandling();
    await this.testEventSubscription();
    await this.testMultipleSubscribers();

    // テスト結果を表示
    this.displayResults();

    await this.teardown();
  }

  /**
   * テスト: メッセージ正規化
   */
  async testMessageNormalization() {
    const testName = 'Message Normalization';
    console.log(`Testing: ${testName}`);

    try {
      const message = {
        type: 'request',
        source: 'skill-a',
        target: 'skill-b',
        payload: { action: 'test' }
      };

      const normalized = normalizeMessage(message);

      const assertions = [
        {
          description: 'ID should be generated',
          pass: !!normalized.id
        },
        {
          description: 'Timestamp should be added',
          pass: !!normalized.timestamp
        },
        {
          description: 'Priority should default to normal',
          pass: normalized.priority === 'normal'
        },
        {
          description: 'Metadata should include default values',
          pass: !!normalized.metadata && normalized.metadata.timeout === 5000
        }
      ];

      const pass = assertions.every(a => a.pass);
      this.recordTest(testName, pass, assertions);

      console.log(pass ? '✓ PASS' : '✗ FAIL');
    } catch (error) {
      this.recordTest(testName, false, [], error);
      console.log('✗ FAIL:', error.message);
    }
  }

  /**
   * テスト: メッセージ検証
   */
  async testMessageValidation() {
    const testName = 'Message Validation';
    console.log(`Testing: ${testName}`);

    try {
      // 有効なメッセージ
      const validMessage = {
        type: 'request',
        source: 'skill-a',
        target: 'skill-b',
        payload: { action: 'test' },
        correlationId: 'test-correlation-123',
        priority: 'normal'
      };

      const validResult = validateMessage(validMessage);
      const isValid = validResult.valid;

      // デバッグログ
      if (!isValid) {
        console.log('Valid message validation failed:', JSON.stringify(validMessage, null, 2));
        console.log('Validation result:', JSON.stringify(validResult, null, 2));
      }

      // 無効なメッセージ
      const invalidMessage = {
        type: 'invalid_type',
        source: 'skill-a',
        target: 'skill-b',
        payload: { action: 'test' }
      };

      const invalidResult = validateMessage(invalidMessage);
      const isInvalid = !invalidResult.valid;

      const pass = isValid && isInvalid;
      const assertions = [
        { description: 'Valid message should pass validation', pass: isValid },
        { description: 'Invalid message should fail validation', pass: isInvalid }
      ];

      this.recordTest(testName, pass, assertions);
      console.log(pass ? '✓ PASS' : '✗ FAIL');
    } catch (error) {
      this.recordTest(testName, false, [], error);
      console.log('✗ FAIL:', error.message);
    }
  }

  /**
   * テスト: 直接メッセージ送信
   */
  async testDirectMessageSend() {
    const testName = 'Direct Message Send';
    console.log(`Testing: ${testName}`);

    try {
      const result = await this.eventBus.send({
        type: 'event',
        source: 'skill-a',
        target: 'skill-b',
        payload: {
          eventType: 'test_event',
          data: { value: 123 }
        }
      });

      const pass = result.success === true;
      const assertions = [
        { description: 'Message should send successfully', pass }
      ];

      this.recordTest(testName, pass, assertions);
      console.log(pass ? '✓ PASS' : '✗ FAIL');
    } catch (error) {
      this.recordTest(testName, false, [], error);
      console.log('✗ FAIL:', error.message);
    }
  }

  /**
   * テスト: ブロードキャストメッセージ
   */
  async testBroadcastMessage() {
    const testName = 'Broadcast Message';
    console.log(`Testing: ${testName}`);

    try {
      let receivedCount = 0;

      // 全スキルでイベントを購読
      for (const skill of this.skills) {
        skill.subscribe({
          type: 'event',
          payload: { eventType: 'broadcast_test' }
        }, () => {
          receivedCount++;
        });
      }

      // ブロードキャスト送信
      await this.eventBus.send({
        type: 'event',
        source: 'skill-a',
        target: '*',
        payload: {
          eventType: 'broadcast_test',
          data: { message: 'hello' }
        }
      });

      // 少し待機（キュー処理を待つ）
      await new Promise(resolve => setTimeout(resolve, 500));

      const pass = receivedCount === this.skills.length;
      const assertions = [
        { description: `All ${this.skills.length} skills should receive broadcast`, pass }
      ];

      this.recordTest(testName, pass, assertions);
      console.log(pass ? '✓ PASS' : '✗ FAIL');
    } catch (error) {
      this.recordTest(testName, false, [], error);
      console.log('✗ FAIL:', error.message);
    }
  }

  /**
   * テスト: リクエスト-レスポンス
   */
  async testRequestResponse() {
    const testName = 'Request-Response';
    console.log(`Testing: ${testName}`);

    try {
      const response = await this.eventBus.send({
        type: 'request',
        source: 'skill-a',
        target: 'skill-b',
        payload: {
          action: 'echo',
          params: { message: 'hello world' }
        },
        metadata: { timeout: 5000 }
      });

      const pass = response.payload.status === 'success' &&
                   response.payload.data.message === 'hello world';
      const assertions = [
        { description: 'Response should be successful', pass: response.payload.status === 'success' },
        { description: 'Data should match request', pass: response.payload.data.message === 'hello world' }
      ];

      this.recordTest(testName, pass, assertions);
      console.log(pass ? '✓ PASS' : '✗ FAIL');
    } catch (error) {
      this.recordTest(testName, false, [], error);
      console.log('✗ FAIL:', error.message);
    }
  }

  /**
   * テスト: エラーハンドリング
   */
  async testErrorHandling() {
    const testName = 'Error Handling';
    console.log(`Testing: ${testName}`);

    try {
      const response = await this.eventBus.send({
        type: 'request',
        source: 'skill-a',
        target: 'skill-b',
        payload: {
          action: 'error',
          params: {}
        },
        metadata: { timeout: 5000 }
      });

      const pass = response.payload.status === 'error' &&
                   response.payload.error.code === 'ERR_TEST_ERROR';
      const assertions = [
        { description: 'Error status should be returned', pass: response.payload.status === 'error' },
        { description: 'Error code should be correct', pass: response.payload.error.code === 'ERR_TEST_ERROR' }
      ];

      this.recordTest(testName, pass, assertions);
      console.log(pass ? '✓ PASS' : '✗ FAIL');
    } catch (error) {
      this.recordTest(testName, false, [], error);
      console.log('✗ FAIL:', error.message);
    }
  }

  /**
   * テスト: タイムアウト処理
   */
  async testTimeoutHandling() {
    const testName = 'Timeout Handling';
    console.log(`Testing: ${testName}`);

    try {
      // 存在しないターゲットに送信（タイムアウトを期待）
      await Promise.race([
        this.eventBus.send({
          type: 'request',
          source: 'skill-a',
          target: 'non-existent-skill',
          payload: {
            action: 'test',
            params: {}
          },
          metadata: { timeout: 100 }
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 200))
      ]);

      this.recordTest(testName, false, [{ description: 'Should timeout', pass: false }]);
      console.log('✗ FAIL: Expected timeout');
    } catch (error) {
      // タイムアウトは期待される動作
      const pass = error.message.includes('timeout');
      const assertions = [
        { description: 'Should timeout on non-existent skill', pass }
      ];

      this.recordTest(testName, pass, assertions);
      console.log(pass ? '✓ PASS' : '✗ FAIL');
    }
  }

  /**
   * テスト: イベント購読
   */
  async testEventSubscription() {
    const testName = 'Event Subscription';
    console.log(`Testing: ${testName}`);

    try {
      let eventReceived = false;

      const skillA = this.skills[0];

      // イベント購読
      skillA.subscribe({
        type: 'event',
        payload: { eventType: 'subscription_test' }
      }, () => {
        eventReceived = true;
      });

      // イベント発行
      await this.eventBus.send({
        type: 'event',
        source: 'skill-b',
        target: '*',
        payload: {
          eventType: 'subscription_test',
          data: { test: true }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const pass = eventReceived === true;
      const assertions = [
        { description: 'Subscribed event should be received', pass }
      ];

      this.recordTest(testName, pass, assertions);
      console.log(pass ? '✓ PASS' : '✗ FAIL');
    } catch (error) {
      this.recordTest(testName, false, [], error);
      console.log('✗ FAIL:', error.message);
    }
  }

  /**
   * テスト: 複数購読者
   */
  async testMultipleSubscribers() {
    const testName = 'Multiple Subscribers';
    console.log(`Testing: ${testName}`);

    try {
      let receiveCount = 0;

      // 同じイベントを複数スキルが購読
      for (const skill of this.skills) {
        skill.subscribe({
          type: 'event',
          payload: { eventType: 'multi_sub_test' }
        }, () => {
          receiveCount++;
        });
      }

      // イベント発行
      await this.eventBus.send({
        type: 'event',
        source: 'skill-a',
        target: 'skill-b',
        payload: {
          eventType: 'multi_sub_test',
          data: { test: true }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const pass = receiveCount === 1; // ターゲットがskill-bのみなので1回
      const assertions = [
        { description: 'Only targeted skill should receive event', pass }
      ];

      this.recordTest(testName, pass, assertions);
      console.log(pass ? '✓ PASS' : '✗ FAIL');
    } catch (error) {
      this.recordTest(testName, false, [], error);
      console.log('✗ FAIL:', error.message);
    }
  }

  /**
   * テスト結果記録
   */
  recordTest(testName, pass, assertions = [], error = null) {
    this.testResults.push({
      testName,
      pass,
      assertions,
      error: error ? error.message : null,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * テスト結果表示
   */
  displayResults() {
    console.log('\n=== Test Results ===\n');

    const passed = this.testResults.filter(r => r.pass).length;
    const failed = this.testResults.filter(r => !r.pass).length;
    const total = this.testResults.length;

    console.log(`Total Tests: ${total}`);
    console.log(`✓ Passed: ${passed}`);
    console.log(`✗ Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

    console.log('\n--- Detailed Results ---\n');

    for (const result of this.testResults) {
      const status = result.pass ? '✓ PASS' : '✗ FAIL';
      console.log(`${status}: ${result.testName}`);

      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }

      if (result.assertions.length > 0) {
        for (const assertion of result.assertions) {
          const assStatus = assertion.pass ? '  ✓' : '  ✗';
          console.log(`${assStatus} ${assertion.description}`);
        }
      }

      console.log('');
    }

    // イベントバスメトリクス
    console.log('--- Event Bus Metrics ---\n');
    console.log(JSON.stringify(this.eventBus.getMetrics(), null, 2));
  }
}

// メイン実行
if (require.main === module) {
  const tests = new SkillCommunicationTests();
  tests.runTests().then(() => {
    console.log('\n✓ All tests completed');
    process.exit(0);
  }).catch(error => {
    console.error('\n✗ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { SkillCommunicationTests };
