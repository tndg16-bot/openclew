/**
 * コンテキスト共有メカニズム統合テスト
 * (Context Sharing Mechanism Integration Tests)
 */

const { ContextSharingManager, ContextStore, ContextTypes, AccessLevels } = require('../lib/context-sharing');
const { SkillEventBus } = require('../lib/skill-event-bus');

/**
 * テストスイート
 */
class ContextSharingTests {
  constructor() {
    this.manager = null;
    this.eventBus = null;
    this.testResults = [];
  }

  /**
   * テストセットアップ
   */
  async setup() {
    console.log('\n=== Setup ===');

    // イベントバス初期化
    this.eventBus = new SkillEventBus();

    // コンテキスト共有マネージャー初期化
    this.manager = new ContextSharingManager(this.eventBus, {
      maxItems: 100,
      retentionDays: 30
    });

    console.log('✓ Context sharing manager initialized');
  }

  /**
   * テストティアダウン
   */
  async teardown() {
    console.log('\n=== Teardown ===');

    // マネージャーのクリーンアップ
    await this.manager.cleanup();

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
    await this.testUserProfile();
    await this.testAddPattern();
    await this.testAddTask();
    await this.testGetByType();
    await this.testSearchByKeyword();
    await this.testSearchByTags();
    await this.testUpdateContext();
    await this.testRemoveContext();
    await this.testCleanup();
    await this.testStats();

    // テスト結果を表示
    this.displayResults();

    await this.teardown();
  }

  /**
   * テスト: ユーザープロファイル
   */
  async testUserProfile() {
    const testName = 'User Profile';
    console.log(`Testing: ${testName}`);

    try {
      const profile = await this.manager.store.setUserProfile({
        name: 'Test User',
        preferences: {
          theme: 'dark',
          language: 'ja'
        }
      });

      const pass = profile && profile.type === ContextTypes.USER_PROFILE;
      const assertions = [
        { description: 'Profile should be created', pass: profile.type === ContextTypes.USER_PROFILE },
        { description: 'Profile should be accessible', pass: !!profile.data }
      ];

      this.recordTest(testName, pass, assertions);
      console.log(pass ? '✓ PASS' : '✗ FAIL');
    } catch (error) {
      this.recordTest(testName, false, [], error);
      console.log('✗ FAIL:', error.message);
    }
  }

  /**
   * テスト: パターン追加
   */
  async testAddPattern() {
    const testName = 'Add Pattern';
    console.log(`Testing: ${testName}`);

    try {
      const pattern = await this.manager.store.addPattern('coding_pattern', {
        frequency: 10,
        timeOfDay: 'afternoon',
        confidence: 0.85
      });

      const pass = pattern && pattern.type === ContextTypes.PATTERNS;
      const assertions = [
        { description: 'Pattern should be created', pass: pattern.type === ContextTypes.PATTERNS },
        { description: 'Pattern should have correct data', pass: pattern.data.frequency === 10 }
      ];

      this.recordTest(testName, pass, assertions);
      console.log(pass ? '✓ PASS' : '✗ FAIL');
    } catch (error) {
      this.recordTest(testName, false, [], error);
      console.log('✗ FAIL:', error.message);
    }
  }

  /**
   * テスト: タスク追加
   */
  async testAddTask() {
    const testName = 'Add Task';
    console.log(`Testing: ${testName}`);

    try {
      const task = await this.manager.store.addTask({
        id: 'task-123',
        title: 'Test task',
        status: 'pending',
        priority: 'high'
      });

      const pass = task && task.type === ContextTypes.TASKS;
      const assertions = [
        { description: 'Task should be created', pass: task.type === ContextTypes.TASKS },
        { description: 'Task should have correct status', pass: task.data.status === 'pending' }
      ];

      this.recordTest(testName, pass, assertions);
      console.log(pass ? '✓ PASS' : '✗ FAIL');
    } catch (error) {
      this.recordTest(testName, false, [], error);
      console.log('✗ FAIL:', error.message);
    }
  }

  /**
   * テスト: タイプ別取得
   */
  async testGetByType() {
    const testName = 'Get By Type';
    console.log(`Testing: ${testName}`);

    try {
      const profiles = await this.manager.store.getByType(ContextTypes.USER_PROFILE);

      const pass = profiles && profiles.length > 0 && profiles[0].type === ContextTypes.USER_PROFILE;
      const assertions = [
        { description: 'Should find user profile', pass: profiles.length > 0 },
        { description: 'Profile type should be correct', pass: profiles[0].type === ContextTypes.USER_PROFILE }
      ];

      this.recordTest(testName, pass, assertions);
      console.log(pass ? '✓ PASS' : '✗ FAIL');
    } catch (error) {
      this.recordTest(testName, false, [], error);
      console.log('✗ FAIL:', error.message);
    }
  }

  /**
   * テスト: キーワード検索
   */
  async testSearchByKeyword() {
    const testName = 'Search By Keyword';
    console.log(`Testing: ${testName}`);

    try {
      const results = await this.manager.store.search('test', {
        limit: 10
      });

      const pass = results && Array.isArray(results);
      const assertions = [
        { description: 'Should return array', pass: Array.isArray(results) },
        { description: 'Should find test context', pass: results.length > 0 }
      ];

      this.recordTest(testName, pass, assertions);
      console.log(pass ? '✓ PASS' : '✗ FAIL');
    } catch (error) {
      this.recordTest(testName, false, [], error);
      console.log('✗ FAIL:', error.message);
    }
  }

  /**
   * テスト: タグ検索
   */
  async testSearchByTags() {
    const testName = 'Search By Tags';
    console.log(`Testing: ${testName}`);

    try {
      const results = await this.manager.store.getByTags(['user', 'profile'], {
        limit: 10
      });

      const pass = results && Array.isArray(results);
      const assertions = [
        { description: 'Should return array', pass: Array.isArray(results) },
        { description: 'Should find context with tags', pass: results.length > 0 }
      ];

      this.recordTest(testName, pass, assertions);
      console.log(pass ? '✓ PASS' : '✗ FAIL');
    } catch (error) {
      this.recordTest(testName, false, [], error);
      console.log('✗ FAIL:', error.message);
    }
  }

  /**
   * テスト: コンテキスト更新
   */
  async testUpdateContext() {
    const testName = 'Update Context';
    console.log(`Testing: ${testName}`);

    try {
      // まずプロファイルを追加
      const profile = await this.manager.store.setUserProfile({
        name: 'Original User',
        preferences: { theme: 'light' }
      });

      // プロファイルを更新
      const updated = await this.manager.store.update(profile.id, {
        name: 'Updated User',
        preferences: { theme: 'dark' }
      });

      const pass = updated && updated.data.name === 'Updated User';
      const assertions = [
        { description: 'Profile should be updated', pass: updated.data.name === 'Updated User' },
        { description: 'UpdatedAt should be changed', pass: !!updated.updatedAt }
      ];

      this.recordTest(testName, pass, assertions);
      console.log(pass ? '✓ PASS' : '✗ FAIL');
    } catch (error) {
      this.recordTest(testName, false, [], error);
      console.log('✗ FAIL:', error.message);
    }
  }

  /**
   * テスト: コンテキスト削除
   */
  async testRemoveContext() {
    const testName = 'Remove Context';
    console.log(`Testing: ${testName}`);

    try {
      // タスクを追加
      const task = await this.manager.store.addTask({
        id: 'task-to-remove',
        title: 'Remove me',
        status: 'pending'
      });

      // タスクを削除
      const removed = await this.manager.store.remove(task.id);

      // 削除確認
      const check = await this.manager.store.get(task.id);

      const pass = removed === true && check === null;
      const assertions = [
        { description: 'Context should be removed', pass: removed === true },
        { description: 'Removed context should not exist', pass: check === null }
      ];

      this.recordTest(testName, pass, assertions);
      console.log(pass ? '✓ PASS' : '✗ FAIL');
    } catch (error) {
      this.recordTest(testName, false, [], error);
      console.log('✗ FAIL:', error.message);
    }
  }

  /**
   * テスト: クリーンアップ
   */
  async testCleanup() {
    const testName = 'Cleanup';
    console.log(`Testing: ${testName}`);

    try {
      // 期限切れアイテムを追加
      const expiredTime = new Date(Date.now() - 60000).toISOString(); // 1分前に期限切れ
      await this.manager.store.add('test_type', { data: 'expired' }, {
        expiresAt: expiredTime
      });

      // 少し待って、ストアが更新されるのを待つ
      await new Promise(resolve => setTimeout(resolve, 100));

      const beforeCleanup = this.manager.store.getStats().total;

      // クリーンアップ実行
      await this.manager.store.cleanup();

      // 少し待って、ストアが更新されるのを待つ
      await new Promise(resolve => setTimeout(resolve, 100));

      const afterCleanup = this.manager.store.getStats().total;

      const pass = afterCleanup < beforeCleanup;
      const assertions = [
        { description: 'Expired items should be removed', pass: afterCleanup < beforeCleanup },
        { description: `Before: ${beforeCleanup}, After: ${afterCleanup}`, pass: true }
      ];

      this.recordTest(testName, pass, assertions);
      console.log(pass ? '✓ PASS' : '✗ FAIL');
    } catch (error) {
      this.recordTest(testName, false, [], error);
      console.log('✗ FAIL:', error.message);
    }
  }

  /**
   * テスト: 統計
   */
  async testStats() {
    const testName = 'Statistics';
    console.log(`Testing: ${testName}`);

    try {
      const stats = this.manager.store.getStats();

      const pass = stats && typeof stats.total === 'number';
      const assertions = [
        { description: 'Stats should have total count', pass: typeof stats.total === 'number' },
        { description: 'Stats should have valid count', pass: typeof stats.valid === 'number' },
        { description: 'Stats should have expired count', pass: typeof stats.expired === 'number' },
        { description: 'Stats should have type breakdown', pass: typeof stats.byType === 'object' }
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

    // 統計情報
    console.log('--- Context Store Statistics ---\n');
    console.log(JSON.stringify(this.manager.getStats(), null, 2));
  }
}

// メイン実行
if (require.main === module) {
  const tests = new ContextSharingTests();
  tests.runTests().then(() => {
    console.log('\n✓ All tests completed');
    process.exit(0);
  }).catch(error => {
    console.error('\n✗ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { ContextSharingTests };
