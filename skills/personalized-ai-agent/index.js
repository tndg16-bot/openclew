/**
 * Personalized AI Agent - メインロジック
 * 全てのスキルを統合し、ユーザーに合わせて自己進化する
 */

const fs = require('fs').promises;
const path = require('path');

const BASE_DIR = __dirname;
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
const PROFILE_PATH = path.join(BASE_DIR, 'profile.json');
const CONTEXT_PATH = path.join(BASE_DIR, 'context.json');

// コンテキスト記憶クラス
class ContextMemory {
  constructor(config) {
    this.shortTermSize = config.memory?.shortTermSize || 10;
    this.longTermSize = config.memory?.longTermSize || 1000;
    this.factRetentionDays = config.memory?.factRetentionDays || 90;

    this.shortTerm = [];
    this.longTerm = [];
    this.userFacts = [];
  }

  addContext(context, importance = 1) {
    // 短期記憶
    this.shortTerm.push({
      ...context,
      addedAt: new Date().toISOString()
    });

    if (this.shortTerm.length > this.shortTermSize) {
      this.shortTerm.shift();
    }

    // 重要な事実を長期記憶に追加
    if (importance >= 0.7) {
      this.userFacts.push({
        fact: context,
        learnedAt: new Date().toISOString(),
        importance: importance
      });

      // 古い事実を削除
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - this.factRetentionDays);
      this.userFacts = this.userFacts.filter(f =>
        new Date(f.learnedAt) > cutoff
      );
    }

    // 長期記憶にも追加
    this.longTerm.push({
      ...context,
      addedAt: new Date().toISOString()
    });

    if (this.longTerm.length > this.longTermSize) {
      this.longTerm.shift();
    }
  }

  getRelevantContext(currentRequest) {
    // 短期記憶から関連文脈を検索
    const relevantShort = this.shortTerm.filter(ctx =>
      this.calculateRelevance(ctx, currentRequest) > 0.5
    );

    // 長期記憶から事実を検索
    const relevantFacts = this.userFacts.filter(fact =>
      this.calculateRelevance(fact.fact, currentRequest) > 0.5
    );

    return {
      recentContext: relevantShort,
      knownFacts: relevantFacts
    };
  }

  calculateRelevance(context, currentRequest) {
    const ctxStr = JSON.stringify(context).toLowerCase();
    const reqStr = currentRequest.toLowerCase();

    // 単純なキーワードマッチ
    const reqWords = reqStr.split(/\s+/);
    let matchCount = 0;

    for (const word of reqWords) {
      if (ctxStr.includes(word)) {
        matchCount++;
      }
    }

    return matchCount / reqWords.length;
  }
}

// プロフィール管理クラス
class UserProfile {
  constructor(config) {
    this.updateInterval = config.profiling?.updateInterval || 'weekly';
    this.categories = config.profiling?.categories || [];

    this.profile = {
      userId: 'default',
      preferences: {
        communicationStyle: 'balanced',  // concise, detailed, friendly, balanced
        workingHours: {
          start: '09:00',
          end: '18:00',
          timezone: 'Asia/Tokyo'
        },
        preferredChannels: {},
        notificationFrequency: 'balanced'
      },
      patterns: {
        activeTimeSlots: [],
        frequentTasks: {},
        responseStyle: {}
      },
      stats: {
        totalInteractions: 0,
        skillUsage: {},
        taskCompletionRate: 0
      },
      lastUpdated: new Date().toISOString()
    };
  }

  async updatePattern(patternType, data) {
    this.profile.patterns[patternType] = this.profile.patterns[patternType] || {};
    this.profile.patterns[patternType][Date.now()] = data;

    // 古いパターンを削除（直近90日分）
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    this.profile.patterns[patternType] = Object.fromEntries(
      Object.entries(this.profile.patterns[patternType]).filter(([_, timestamp]) =>
        new Date(parseInt(timestamp)) > cutoff
      )
    );

    this.profile.lastUpdated = new Date().toISOString();
    await this.save();
  }

  getActiveTimeSlot() {
    const now = new Date();
    const hour = now.getHours();
    const slots = this.profile.patterns.activeTimeSlots || [];

    for (const slot of slots) {
      if (hour >= slot.start && hour < slot.end) {
        return slot;
      }
    }

    return { start: 9, end: 18, weight: 0.5 };
  }

  async load() {
    try {
      const data = await fs.readFile(PROFILE_PATH, 'utf8');
      this.profile = JSON.parse(data);
    } catch (e) {
      // 初期プロフィール作成
      await this.save();
    }
  }

  async save() {
    await fs.writeFile(PROFILE_PATH, JSON.stringify(this.profile, null, 2), 'utf8');
  }
}

// 設定ロード
async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {
      learning: { enabled: true, patternThreshold: 5 },
      skills: { autoSelect: true },
      evolution: { enabled: true }
    };
  }
}

// スキル選択ロジック
function selectBestSkill(userRequest, config) {
  const skills = config.skills?.skillTriggers || {};

  for (const [skillName, triggers] of Object.entries(skills)) {
    for (const trigger of triggers) {
      if (userRequest.toLowerCase().includes(trigger.toLowerCase())) {
        return {
          skill: skillName,
          confidence: calculateTriggerConfidence(userRequest, trigger),
          reason: 'keyword_match'
        };
      }
    }
  }

  // タイムスロットに基づく選択
  const profile = new UserProfile(config);
  const activeSlot = profile.getActiveTimeSlot();
  if (activeSlot.weight > 0.7) {
    return {
      skill: 'productivity-advisor',
      confidence: activeSlot.weight,
      reason: 'productivity_time'
    };
  }

  // デフォルト
  return {
    skill: null,
    confidence: 0,
    reason: 'no_match'
  };
}

// トリガー信頼度計算
function calculateTriggerConfidence(request, trigger) {
  const reqLower = request.toLowerCase();
  const triggerLower = trigger.toLowerCase();

  // 完全一致
  if (reqLower.includes(triggerLower)) {
    return 0.9;
  }

  // 部分一致
  const words = triggerLower.split(' ');
  let matchCount = 0;
  for (const word of words) {
    if (reqLower.includes(word)) {
      matchCount++;
    }
  }

  return (matchCount / words.length) * 0.8;
}

// パターン分析
async function analyzePatterns(conversations, tasks) {
  const patterns = {
    timePatterns: {},
    topicPatterns: {},
    requestPatterns: {},
    skillUsage: {}
  };

  // 時間帯分析
  for (const conv of conversations) {
    const hour = new Date(conv.timestamp).getHours();
    const timeSlot = getTimeSlot(hour);
    patterns.timePatterns[timeSlot] = (patterns.timePatterns[timeSlot] || 0) + 1;
  }

  // トピック分析
  for (const task of tasks) {
    const topic = classifyTask(task);
    patterns.topicPatterns[topic] = (patterns.topicPatterns[topic] || 0) + 1;
  }

  return patterns;
}

// 時間スロット判定
function getTimeSlot(hour) {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

// タスク分類
function classifyTask(task) {
  const keywords = {
    'code': ['コード', '実装', '開発', 'code', 'implement'],
    'review': ['レビュー', 'チェック', '確認', 'review', 'check'],
    'email': ['メール', '返信', 'gmail', 'email'],
    'task': ['タスク', 'todo', 'やること', 'task']
  };

  const lowerTask = task.toLowerCase();
  for (const [topic, words] of Object.entries(keywords)) {
    if (words.some(w => lowerTask.includes(w))) {
      return topic;
    }
  }

  return 'other';
}

// レポート生成
function generateReport(profile, patterns, config) {
  let report = `🧠 パーソナライズドAIエージェント レポート\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // ユーザープロフィール
  if (profile?.preferences) {
    report += `👤 ユーザープロフィール\n`;
    report += `────────────────────────────\n`;
    report += `• コミュニケーションスタイル: ${translateStyle(profile.preferences.communicationStyle)}\n`;
    report += `• 作業時間: ${profile.preferences.workingHours?.start}-${profile.preferences.workingHours?.end}\n`;
    report += `• 最終更新: ${formatDate(profile.lastUpdated)}\n\n`;
  }

  // 行動パターン
  if (patterns?.timePatterns) {
    report += `📊 行動パターン分析\n`;
    report += `────────────────────────────\n`;
    const slots = ['morning', 'afternoon', 'evening'];
    for (const slot of slots) {
      const count = patterns.timePatterns[slot] || 0;
      report += `• ${slot}: ${count}回\n`;
    }
    report += '\n';
  }

  // スキル使用状況
  if (profile?.stats?.skillUsage) {
    report += `📝 統合スキル状況\n`;
    report += `────────────────────────────\n`;
    for (const [skill, count] of Object.entries(profile.stats.skillUsage)) {
      const status = count > 0 ? '✓' : '✗';
      report += `${status} ${skill}: ${count}回使用\n`;
    }
    report += '\n';
  }

  report += `💬 質問や詳細な指示を返信してください！\n`;

  return report;
}

// スタイル翻訳
function translateStyle(style) {
  const styleMap = {
    'concise': '簡潔',
    'detailed': '詳細',
    'friendly': 'フレンドリー',
    'balanced': 'バランス'
  };
  return styleMap[style] || style;
}

// 日付フォーマット
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ja-JP', {
    month: '2-digit',
    day: '2-digit'
  });
}

// メイン実行
async function run(context, command = 'analyze') {
  console.log('🧠 Personalized AI Agent starting...');

  const config = await loadConfig();
  const memory = new ContextMemory(config);
  const profile = new UserProfile(config);
  await profile.load();

  switch (command) {
    case 'analyze':
      // パターン分析
      const conversations = await getConversations(context);
      const tasks = await getTasks(context);
      const patterns = await analyzePatterns(conversations, tasks);

      const report = generateReport(profile, patterns, config);
      if (context?.channels?.send) {
        await context.channels.send('discord', report);
      } else {
        console.log('\n--- Analysis Report ---\n');
        console.log(report);
      }

      return { success: true, report };

    case 'update':
      // プロフィール更新
      await profile.updatePattern('latest', {
        timestamp: new Date().toISOString(),
        interactionCount: 1
      });

      return { success: true, message: 'Profile updated' };

    case 'suggest':
      // スキル提案
      const suggestion = selectBestSkill('ユーザーからのリクエスト', config);
      if (suggestion.skill) {
        return {
          success: true,
          suggestion: `スキル "${suggestion.skill}" を推奨します (${suggestion.reason})`
        };
      }

      return {
        success: false,
        message: '適切なスキルが見つかりません'
      };

    case 'learn':
      // 学習モード
      const contextData = memory.getRelevantContext('current');
      memory.addContext({
        type: 'learning',
        data: contextData,
        importance: 0.8
      });

      return { success: true, message: 'Learned from context' };

    default:
      console.log('Available commands: analyze, update, suggest, learn');
      return { success: false };
  }
}

// データ取得（モック）
async function getConversations(context) {
  return [];
}

async function getTasks(context) {
  return [];
}

// CLI実行対応
if (require.main === module) {
  const command = process.argv[2] || 'analyze';
  run(null, command).then(() => {
    console.log('\n✅ Personalized AI Agent completed');
  }).catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
}

module.exports = {
  run,
  selectBestSkill,
  analyzePatterns,
  UserProfile,
  ContextMemory
};
