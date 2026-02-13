/**
 * 各スキルの動作確認テスト
 * (All Skills Operation Verification Test)
 */

const fs = require('fs').promises;
const path = require('path');
const { SkillEventBus } = require('./../lib/skill-event-bus');
const { v4: uuidv4 } = require('./../lib/skill-event-bus').uuidv4 || (() => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
});

const SKILLS_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.clawdbot', 'skills');

/**
 * テストスイート
 */
class SkillsVerificationTest {
  constructor() {
    this.eventBus = new SkillEventBus();
    this.skills = [];
    this.testResults = [];
  }

  /**
   * テストセットアップ
   */
  async setup() {
    console.log('\n=== Setup ===');
    console.log('Skills directory:', SKILLS_DIR);

    // スキルディレクトリをスキャン
    try {
      const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
      this.skills = entries
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(entry => ({
          name: entry.name,
          path: path.join(SKILLS_DIR, entry.name)
        }));

      console.log(`✓ Found ${this.skills.length} skill directories`);
    } catch (error) {
      console.error('Error scanning skills directory:', error.message);
      this.skills = [];
    }
  }

  /**
   * テスト実行
   */
  async runTests() {
    await this.setup();

    if (this.skills.length === 0) {
      console.log('No skills found to test');
      return;
    }

    console.log('\n=== Running Tests ===\n');

    // 各スキルの構造を検証
    for (const skill of this.skills) {
      await this.testSkillStructure(skill);
    }

    // テスト結果を表示
    this.displayResults();
  }

  /**
   * スキル構造テスト
   */
  async testSkillStructure(skill) {
    const testName = `Skill Structure: ${skill.name}`;
    console.log(`Testing: ${testName}`);

    const assertions = [];
    let pass = true;

      try {
        // 1. skill.jsonまたはconfig.jsonの存在チェック
        const configFiles = ['skill.json', 'config.json', 'index.js', 'index.ts'];
        let hasConfig = false;
        let hasMain = false;

        const entries = await fs.readdir(skill.path);
        for (const entry of entries) {
          if (configFiles.includes(entry)) {
            if (entry.endsWith('.json')) {
              hasConfig = true;
            } else if (entry.endsWith('.js') || entry.endsWith('.ts')) {
              hasMain = true;
            }
          }
        }

      assertions.push({
        description: 'Has configuration file',
        pass: hasConfig
      });
      assertions.push({
        description: 'Has main entry point',
        pass: hasMain
      });

      // 2. README/SKILL.mdの存在チェック
      const docFiles = await fs.readdir(skill.path);
      const hasReadme = docFiles.some(f =>
        f.toLowerCase() === 'readme.md' || f.toLowerCase() === 'skill.md'
      );

      assertions.push({
        description: 'Has documentation',
        pass: hasReadme
      });

      // 3. パッケージ.jsonの存在チェック
      let hasPackageJson = false;
      let packageJsonContent = null;

      try {
        const packageJsonPath = path.join(skill.path, 'package.json');
        try {
          await fs.access(packageJsonPath);
          hasPackageJson = true;
          packageJsonContent = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        } catch {
          // スキルにはpackage.jsonがない場合もある
        }
      } catch (err) {
        // スキルにはpackage.jsonがない場合もある
      }

      if (hasPackageJson) {
        assertions.push({
          description: 'Has package.json',
          pass: true
        });

        // 依存関係のチェック
        if (packageJsonContent.dependencies) {
          const depCount = Object.keys(packageJsonContent.dependencies).length;
          assertions.push({
            description: `Has ${depCount} dependencies`,
            pass: true
          });
        }

        // scriptsのチェック
        if (packageJsonContent.scripts) {
          const scriptCount = Object.keys(packageJsonContent.scripts).length;
          assertions.push({
            description: `Has ${scriptCount} scripts`,
            pass: true
          });
        }
      } else {
        assertions.push({
          description: 'No package.json (optional for some skills)',
          pass: true
        });
      }

      // 4. サブディレクトリ構成のチェック
      const subEntries = await fs.readdir(skill.path, { withFileTypes: true });
      const subDirs = subEntries.filter(e => e.isDirectory());
      const files = subEntries.filter(e => e.isFile());

      assertions.push({
        description: `Has ${subDirs.length} subdirectories`,
        pass: subDirs.length >= 0
      });
      assertions.push({
        description: `Has ${files.length} files`,
        pass: files.length > 0
      });

    } catch (error) {
      pass = false;
      console.error('Error testing skill structure:', error.message);
    }

    // 全てのアサーションが通ればパス
    pass = pass && assertions.every(a => a.pass);

    this.recordTest(testName, pass, assertions);
    console.log(pass ? '✓ PASS' : '✗ FAIL');
  }

  /**
   * テスト結果記録
   */
  recordTest(testName, pass, assertions = []) {
    this.testResults.push({
      testName,
      pass,
      assertions,
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

      if (result.assertions.length > 0) {
        for (const assertion of result.assertions) {
          const assStatus = assertion.pass ? '  ✓' : '  ✗';
          console.log(`${assStatus} ${assertion.description}`);
        }
      }

      console.log('');
    }

    // スキルサマリー
    console.log('--- Skills Summary ---\n');
    console.log(`Total skills found: ${this.skills.length}`);

    for (const skill of this.skills) {
      const testResult = this.testResults.find(r => r.testName.includes(skill.name));
      if (testResult) {
        const status = testResult.pass ? '✓' : '✗';
        console.log(`${status} ${skill.name}`);
      }
    }
  }
}

// メイン実行
if (require.main === module) {
  const tests = new SkillsVerificationTest();
  tests.runTests().then(() => {
    console.log('\n✓ All tests completed');
    process.exit(0);
  }).catch(error => {
    console.error('\n✗ Test execution failed:', error.message);
    process.exit(1);
  });
}

module.exports = { SkillsVerificationTest };
