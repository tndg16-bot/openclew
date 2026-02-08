/**
 * 自己学習・パターン認識エージェント
 * (Self-Learning Pattern Recognition Agent)
 * ユーザーの行動パターンを学習・分析・予測する
 */

const fs = require('fs').promises;
const path = require('path');
const { ContextSharingManager, ContextTypes, AccessLevels } = require('../lib/context-sharing');
const { v4: uuidv4 } = require('../lib/skill-event-bus').uuidv4 || (() => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
});

const BASE_DIR = __dirname;
const PATTERNS_PATH = path.join(BASE_DIR, 'patterns.json');
const LEARNING_LOG_PATH = path.join(BASE_DIR, 'learning-log.json');

/**
 * パターンタイプ
 */
const PatternTypes = {
  TIME_OF_DAY: 'time_of_day',
  DAY_OF_WEEK: 'day_of_week',
  TASK_TYPE: 'task_type',
  COMMAND_USAGE: 'command_usage',
  WORKING_HOURS: 'working_hours',
  ACTIVE_CHANNELS: 'active_channels',
  RESPONSE_STYLE: 'response_style',
  ACTIVITY_PEAK: 'activity_peak'
};

/**
 * パターン分類
 */
const PatternCategories = {
  MORNING_ROUTINE: 'morning_routine',
  WORK_BLOCK: 'work_block',
  BREAK_PATTERN: 'break_pattern',
  TASK_SEQUENCE: 'task_sequence',
  REPEATED_ACTION: 'repeated_action',
  CONTEXT_DEPENDENCY: 'context_dependency',
  USER_PREFERENCE: 'user_preference'
};

/**
 * パターン信頼度レベル
 */
const ConfidenceLevel = {
  LOW: 0.3,
  MEDIUM: 0.5,
  HIGH: 0.7,
  VERY_HIGH: 0.9
};

/**
 * パターンデータ構造
 */
class Pattern {
  constructor(type, data = {}) {
    this.id = uuidv4();
    this.type = type;
    this.category = data.category || null;
    this.data = data;
    this.confidence = data.confidence || ConfidenceLevel.MEDIUM;
    this.frequency = data.frequency || 1;
    this.lastObserved = data.lastObserved || new Date().toISOString();
    this.firstObserved = data.firstObserved || new Date().toISOString();
    this.occurrences = data.occurrences || 1;
    this.tags = data.tags || [];
    this.metadata = data.metadata || {};
    this.isActive = data.isActive !== false;
  }

  /**
   * パターンを更新
   */
  update(newData) {
    if (newData.confidence !== undefined) {
      this.confidence = Math.max(0, Math.min(1, newData.confidence));
    }
    if (newData.frequency !== undefined) {
      this.frequency = Math.max(1, Math.round(newData.frequency));
    }
    this.lastObserved = new Date().toISOString();
    this.occurrences += 1;
    this.data = { ...this.data, ...newData };
  }

  /**
   * パターンをJSONに変換
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      category: this.category,
      data: this.data,
      confidence: this.confidence,
      frequency: this.frequency,
      lastObserved: this.lastObserved,
      firstObserved: this.firstObserved,
      occurrences: this.occurrences,
      tags: this.tags,
      metadata: this.metadata,
      isActive: this.isActive
    };
  }
}

/**
 * パターンストア
 */
class PatternStore {
  constructor(config = {}) {
    this.config = {
      maxPatterns: config.maxPatterns || 1000,
      retentionDays: config.retentionDays || 90,
      confidenceDecay: config.confidenceDecay || 0.95,
      observationWindow: config.observationWindow || 7 // 日
      minObservations: config.minObservations || 3
    };

    this.patterns = new Map();
    this.patternsByType = new Map();
    this.patternsByCategory = new Map();
  }

  /**
   * パターンを追加
   */
  addPattern(type, data = {}) {
    const existingKey = this.generateKey(type, data);

    if (this.patterns.has(existingKey)) {
      // 既存のパターンを更新
      const pattern = this.patterns.get(existingKey);
      pattern.update(data);
      this.updateIndexes(pattern);
    } else {
      // 新しいパターンを作成
      const pattern = new Pattern(type, {
        ...data,
        firstObserved: new Date().toISOString(),
        occurrences: 1
      });
      this.patterns.set(existingKey, pattern);
      this.updateIndexes(pattern);
    }

    return pattern;
  }

  /**
   * パターンを取得
   */
  getPattern(type, data) {
    const key = this.generateKey(type, data);
    return this.patterns.get(key) || null;
  }

  /**
   * パターン一覧を取得
   */
  getPatterns(type = null, filters = {}) {
    let patterns = Array.from(this.patterns.values());

    if (type) {
      patterns = patterns.filter(p => p.type === type);
    }

    if (filters.category) {
      patterns = patterns.filter(p => p.category === filters.category);
    }

    if (filters.confidence !== undefined) {
      patterns = patterns.filter(p => p.confidence >= filters.confidence);
    }

    if (filters.minFrequency !== undefined) {
      patterns = patterns.filter(p => p.frequency >= filters.minFrequency);
    }

    if (filters.limit) {
      patterns = patterns.slice(0, filters.limit);
    }

    return patterns;
  }

  /**
   * パターンを検索
   */
  searchPatterns(keyword) {
    const allPatterns = Array.from(this.patterns.values());
    const lowerKeyword = keyword.toLowerCase();

    return allPatterns.filter(p => {
      // データ検索
      const dataStr = JSON.stringify(p.data).toLowerCase();
      if (dataStr.includes(lowerKeyword)) {
        return true;
      }

      // タグ検索
      if (p.tags.some(tag => tag.toLowerCase().includes(lowerKeyword))) {
        return true;
      }

      return false;
    });
  }

  /**
   * パターン信頼度を更新
   */
  updatePatternConfidence(patternId, delta) {
    for (const pattern of this.patterns.values()) {
      if (pattern.id === patternId) {
        const oldConfidence = pattern.confidence;
        pattern.confidence = Math.max(0, Math.min(1, oldConfidence + delta));

        // 信頼度が閾値を下回ったら非アクティブ化
        if (pattern.confidence < ConfidenceLevel.LOW) {
          pattern.isActive = false;
        }

        return pattern;
      }
    }
    }
  }

  /**
   * 古いパターンを削除
   */
  cleanup() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.retentionDays);

    const removed = [];

    for (const [key, pattern] of this.patterns) {
      const lastObserved = new Date(pattern.lastObserved);

      // 期限切れまたは信頼度が低い
      if (lastObserved < cutoff || pattern.confidence < ConfidenceLevel.LOW) {
        // インデックスから削除
        if (pattern.type) {
          const typePatterns = this.patternsByType.get(pattern.type);
          typePatterns.delete(pattern.id);
        }
        if (pattern.category) {
          const categoryPatterns = this.patternsByCategory.get(pattern.category);
          categoryPatterns.delete(pattern.id);
        }

        this.patterns.delete(key);
        removed.push(pattern);
      }
    }

    console.log(`✓ Cleaned up ${removed.length} expired patterns`);
    return removed.length;
  }

  /**
   * パターンキーの生成
   */
  generateKey(type, data) {
    return `${type}:${JSON.stringify(data)}`;
  }

  /**
   * インデックスを更新
   */
  updateIndexes(pattern) {
    // タイプ別インデックス
    if (!this.patternsByType.has(pattern.type)) {
      this.patternsByType.set(pattern.type, new Map());
    }
    this.patternsByType.get(pattern.type).set(pattern.id, pattern);

    // カテゴリ別インデックス
    if (pattern.category && !this.patternsByCategory.has(pattern.category)) {
      this.patternsByCategory.set(pattern.category, new Map());
    }
    if (pattern.category) {
      this.patternsByCategory.get(pattern.category).set(pattern.id, pattern);
    }
  }

  /**
   * パターンを保存
   */
  async save() {
    const data = {
      version: '1.0.0',
      savedAt: new Date().toISOString(),
      patterns: Array.from(this.patterns.values()).map(p => p.toJSON()),
      stats: {
        total: this.patterns.size,
        byType: {},
        byCategory: {}
      }
    };

    // 統計情報を収集
    for (const pattern of this.patterns.values()) {
      data.stats.byType[pattern.type] = (data.stats.byType[pattern.type] || 0) + 1;
      if (pattern.category) {
        data.stats.byCategory[pattern.category] = (data.stats.byCategory[pattern.category] || 0) + 1;
      }
    }

    await fs.writeFile(PATTERNS_PATH, JSON.stringify(data, null, 2), 'utf8');
  }

  /**
   * パターンを読み込み
   */
  async load() {
    try {
      const data = await fs.readFile(PATTERNS_PATH, 'utf8');
      const parsed = JSON.parse(data);

      if (parsed.patterns) {
        for (const patternData of parsed.patterns) {
          const pattern = new Pattern(patternData.type, patternData);
          this.patterns.set(this.generateKey(pattern.type, patternData.data), pattern);
          this.updateIndexes(pattern);
        }
      }

      console.log(`✓ Loaded ${this.patterns.size} patterns`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('Error loading patterns:', err.message);
      }
      // 初回実行時はOK
    }
  }

  /**
   * 統計情報を取得
   */
  getStats() {
    const patterns = Array.from(this.patterns.values());
    const stats = {
      total: patterns.length,
      active: patterns.filter(p => p.isActive).length,
      byType: {},
      byCategory: {},
      byConfidence: {
        low: 0,
        medium: 0,
        high: 0,
        veryHigh: 0
      },
      averageFrequency: 0
    };

    for (const pattern of patterns) {
      if (pattern.isActive) {
        stats.active++;
      }

      stats.byType[pattern.type] = (stats.byType[pattern.type] || 0) + 1;
      if (pattern.category) {
        stats.byCategory[pattern.category] = (stats.byCategory[pattern.category] || 0) + 1;
      }

      if (pattern.confidence >= ConfidenceLevel.VERY_HIGH) {
        stats.byConfidence.veryHigh++;
      } else if (pattern.confidence >= ConfidenceLevel.HIGH) {
        stats.byConfidence.high++;
      } else if (pattern.confidence >= ConfidenceLevel.MEDIUM) {
        stats.byConfidence.medium++;
      } else {
        stats.byConfidence.low++;
      }

      stats.averageFrequency += pattern.frequency;
    }

    if (patterns.length > 0) {
      stats.averageFrequency = stats.averageFrequency / patterns.length;
    }

    return stats;
  }
}

/**
 * パターン分析エンジン
 */
class PatternAnalyzer {
  constructor(patternStore, contextManager) {
    this.patternStore = patternStore;
    this.contextManager = contextManager;
    this.observationBuffer = [];
    this.config = {
      bufferSize: 100,
      analysisInterval: 60, // 秒
      minObservations: 3
    };
  }

  /**
   * 観察を追加
   */
  addObservation(observation) {
    this.observationBuffer.push({
      ...observation,
      timestamp: new Date().toISOString()
    });

    // バッファがいっぱいになったら分析を実行
    if (this.observationBuffer.length >= this.config.bufferSize) {
      this.analyzeBuffer();
    }
  }

  /**
   * バッファを分析
   */
  analyzeBuffer() {
    const observations = [...this.observationBuffer];
    this.observationBuffer = [];

    for (const obs of observations) {
      this.analyzeObservation(obs);
    }

    // パターンストアの定期保存
    this.patternStore.save().catch(err => {
      console.error('Error saving patterns:', err.message);
    });
  }

  /**
   * 観察を分析
   */
  analyzeObservation(obs) {
    const now = new Date();

    switch (obs.type) {
      case PatternTypes.TIME_OF_DAY:
        this.analyzeTimeOfDay(obs, now);
        break;

      case PatternTypes.DAY_OF_WEEK:
        this.analyzeDayOfWeek(obs, now);
        break;

      case PatternTypes.TASK_TYPE:
        this.analyzeTaskType(obs);
        break;

      case PatternTypes.WORKING_HOURS:
        this.analyzeWorkingHours(obs);
        break;

      case PatternTypes.ACTIVITY_PEAK:
        this.analyzeActivityPeak(obs);
        break;

      case PatternTypes.RESPONSE_STYLE:
        this.analyzeResponseStyle(obs);
        break;

      default:
        console.warn(`Unknown observation type: ${obs.type}`);
    }
  }

  /**
   * 時間帯パターン分析
   */
  analyzeTimeOfDay(obs, now) {
    const hour = now.getHours();

    const timeOfDay = this.getTimeOfDay(hour);

    this.patternStore.addPattern(PatternTypes.TIME_OF_DAY, {
      category: PatternCategories.MORNING_ROUTINE,
      data: {
        hour: timeOfDay,
        dayPart: hour < 12 ? 'morning' : (hour < 18 ? 'afternoon' : 'evening')
      },
      confidence: ConfidenceLevel.MEDIUM
    });
  }

  /**
   * 曜日パターン分析
   */
  analyzeDayOfWeek(obs, now) {
    const dayOfWeek = now.getDay(); // 0=日, 6=土

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    this.patternStore.addPattern(PatternTypes.DAY_OF_WEEK, {
      category: PatternCategories.MORNING_ROUTINE,
      data: {
        dayOfWeek: dayOfWeek,
        dayName: dayNames[dayOfWeek]
      },
      confidence: ConfidenceLevel.MEDIUM
    });
  }

  /**
   * 作業時間パターン分析
   */
  analyzeWorkingHours(obs) {
    const { startHour, endHour } = obs.data;

    if (startHour && endHour) {
      const workHours = endHour - startHour;

      this.patternStore.addPattern(PatternTypes.WORKING_HOURS, {
        category: PatternCategories.MORNING_ROUTINE,
        data: {
          startHour,
          endHour,
          duration: workHours,
          isRegular: workHours >= 4 && workHours <= 10
        },
        confidence: ConfidenceLevel.HIGH
      });
    }
  }

  /**
   * アクティビティピーク分析
   */
  analyzeActivityPeak(obs) {
    const { timestamp } = obs;

    if (timestamp) {
      const hour = new Date(timestamp).getHours();
      const timeOfDay = this.getTimeOfDay(hour);

      this.patternStore.addPattern(PatternTypes.ACTIVITY_PEAK, {
        category: PatternCategories.ACTIVITY_PEAK,
        data: {
          hour: timeOfDay,
          timestamp
        },
        confidence: ConfidenceLevel.MEDIUM
      });
    }
  }

  /**
   * レスポンススタイル分析
   */
  analyzeResponseStyle(obs) {
    const { responseType, length } = obs.data;

    if (responseType && length) {
      let style = 'concise';

      if (length > 500) {
        style = 'detailed';
      } else if (length < 100) {
        style = 'brief';
      }

      this.patternStore.addPattern(PatternTypes.RESPONSE_STYLE, {
        category: PatternCategories.USER_PREFERENCE,
        data: {
          responseType,
          style,
          length
        },
        confidence: ConfidenceLevel.MEDIUM
      });
    }
  }

  /**
   * タスク種類分析
   */
  analyzeTaskType(obs) {
    const { taskType, action } = obs.data;

    if (taskType && action) {
      this.patternStore.addPattern(PatternTypes.TASK_TYPE, {
        category: PatternCategories.WORK_BLOCK,
        data: {
          taskType,
          action,
          category: this.classifyTaskCategory(taskType)
        },
        confidence: ConfidenceLevel.MEDIUM
      });
    }
  }

  /**
   * タスク分類
   */
  classifyTaskCategory(taskType) {
    const taskCategories = {
      'coding': 'development',
      'review': 'review',
      'documentation': 'documentation',
      'meeting': 'collaboration',
      'communication': 'communication'
    };

    return taskCategories[taskType.toLowerCase()] || 'general';
  }

  /**
   * 時間帯を取得
   */
  getTimeOfDay(hour) {
    if (hour >= 6 && hour < 9) return 'early_morning';
    if (hour >= 9 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 14) return 'early_afternoon';
    if (hour >= 14 && hour < 17) return 'late_afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  /**
   * 統計を取得
   */
  getStats() {
    return this.patternStore.getStats();
  }
}

/**
 * パターン予測エンジン
 */
class PatternPredictor {
  constructor(patternStore) {
    this.patternStore = patternStore;
  }

  /**
   * 次のアクションを予測
   */
  predictNextAction(context) {
    const predictions = [];

    // 時間帯に基づく推奨
    predictions.push(this.predictBasedOnTimeOfDay());

    // 曜日に基づく推奨
    predictions.push(this.predictBasedOnDayOfWeek());

    // 過去のタスクに基づく推奨
    predictions.push(this.predictBasedOnRecentTasks(context));

    return predictions;
  }

  /**
   * 時間帯に基づく予測
   */
  predictBasedOnTimeOfDay() {
    const now = new Date();
    const hour = now.getHours();

    const timePatterns = this.patternStore.getPatterns(PatternTypes.TIME_OF_DAY);
    const currentPattern = timePatterns.find(p => {
      const nowHour = this.getTimeOfDay(hour);
      return p.data.hour === nowHour;
    });

    if (currentPattern && currentPattern.confidence > ConfidenceLevel.MEDIUM) {
      return {
        type: 'time_based',
        recommendation: `Based on your activity patterns at ${currentPattern.data.dayPart}`,
        confidence: currentPattern.confidence,
        action: currentPattern.data.suggestedAction || 'continue'
      };
    }

    return null;
  }

  /**
   * 曜日に基づく予測
   */
  predictBasedOnDayOfWeek() {
    const now = new Date();
    const dayOfWeek = now.getDay();

    const dayPatterns = this.patternStore.getPatterns(PatternTypes.DAY_OF_WEEK);
    const currentPattern = dayPatterns.find(p => p.data.dayOfWeek === dayOfWeek);

    if (currentPattern && currentPattern.confidence > ConfidenceLevel.MEDIUM) {
      return {
        type: 'day_based',
        recommendation: `Based on your ${currentPattern.data.dayName} patterns`,
        confidence: currentPattern.confidence,
        action: currentPattern.data.suggestedAction || 'continue'
      };
    }

    return null;
  }

  /**
   * 最近のタスクに基づく予測
   */
  predictBasedOnRecentTasks(context) {
    if (!context || !context.recentTasks) {
      return null;
    }

    const recentTasks = context.recentTasks;
    if (recentTasks.length === 0) {
      return null;
    }

    // 最も頻度の高いタスクを推奨
    const taskPatterns = this.patternStore.getPatterns(PatternTypes.TASK_TYPE);
    const highFrequencyTasks = taskPatterns
      .filter(p => p.confidence > ConfidenceLevel.HIGH)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);

    if (highFrequencyTasks.length > 0) {
      return {
        type: 'task_based',
        recommendation: `Based on your recent activity`,
        confidence: highFrequencyTasks[0].confidence,
        action: `Consider focusing on: ${highFrequencyTasks.map(t => t.data.taskType).join(', ')}`
      };
    }

    return null;
  }
}

/**
 * メインエージェントクラス
 */
class SelfLearningAgent {
  constructor(eventBus, config = {}) {
    this.eventBus = eventBus;
    this.config = {
      enabled: config.enabled !== false,
      autoAnalyze: config.autoAnalyze !== false,
      minObservations: config.minObservations || 3,
      analysisInterval: config.analysisInterval || 60
    };

    this.patternStore = new PatternStore();
    this.contextManager = null;
    this.patternAnalyzer = null;
    this.patternPredictor = null;
    this.analysisTimer = null;
    this.initialized = false;
  }

  /**
   * 初期化
   */
  async initialize() {
    console.log('🧠 Self-Learning Agent initializing...');

    // コンテキストマネージャーの初期化
    this.contextManager = new ContextSharingManager(this.eventBus, {
      maxItems: 500,
      retentionDays: 90
    });

    // パターンストアの読み込み
    await this.patternStore.load();

    // パターンアナライザーの初期化
    this.patternAnalyzer = new PatternAnalyzer(this.patternStore, this.contextManager);

    // パターン予測器の初期化
    this.patternPredictor = new PatternPredictor(this.patternStore);

    // イベント購読を設定
    this.setupEventSubscriptions();

    // 定期分析を開始
    if (this.config.enabled) {
      this.startPeriodicAnalysis();
    }

    this.initialized = true;
    console.log('✓ Self-Learning Agent initialized successfully');

    // 初期化完了イベントを発行
    await this.eventBus.send({
      type: 'event',
      source: 'self-learning-agent',
      target: '*',
      payload: {
        eventType: 'agent_ready',
        skillId: 'self-learning-agent',
        version: '1.0.0',
        capabilities: ['pattern_recognition', 'behavior_analysis', 'prediction']
      }
    });
  }

  /**
   * イベント購読を設定
   */
  setupEventSubscriptions() {
    // ユーザーア動ログ
    this.eventBus.subscribe('self-learning-agent', {
      type: 'event',
      payload: {
        eventType: 'user_activity'
      }
    }, this.handleUserActivity.bind(this));

    // タスク完了イベント
    this.eventBus.subscribe('self-learning-agent', {
      type: 'event',
      payload: {
        eventType: 'task_completed'
      }
    }, this.handleTaskCompleted.bind(this));

    // コマンド使用イベント
    this.eventBus.subscribe('self-learning-agent', {
      type: 'event',
      payload: {
        eventType: 'command_usage'
      }
    }, this.handleCommandUsage.bind(this));

    // リクエスト処理
    this.eventBus.subscribe('self-learning-agent', {
      type: 'request',
      target: 'self-learning-agent'
    }, this.handleRequest.bind(this));
  }

    // スケジュールイベント
    this.eventBus.subscribe('self-learning-agent', {
      type: 'event',
      payload: {
        eventType: 'schedule_update'
      }
    }, this.handleScheduleUpdate.bind(this));
  }

    // プロファイル更新イベント
    this.eventBus.subscribe('self-learning-agent', {
      type: 'event',
      payload: {
        eventType: 'profile_updated'
      }
    }, this.handleProfileUpdate.bind(this));
  }

  /**
   * ユーザーア動ハンドラ
   */
  async handleUserActivity(event) {
    const { data } = event.payload;

    try {
      // 時間帯パターン分析
      this.patternAnalyzer.analyzeTimeOfDay({
        type: PatternTypes.TIME_OF_DAY,
        data: data
      });

      // 曜日パターン分析
      this.patternAnalyzer.analyzeDayOfWeek({
        type: PatternTypes.DAY_OF_WEEK,
        data: {
          timestamp: data.timestamp
        }
      });

      // アクティビティピーク分析
      this.patternAnalyzer.analyzeActivityPeak({
        type: PatternTypes.ACTIVITY_PEAK,
        data
      });

    } catch (error) {
      console.error('Error handling user activity:', error.message);
    }
  }

  /**
   * タスク完了ハンドラ
   */
  async handleTaskCompleted(event) {
    const { data } = event.payload;

    try {
      // タスクタイプ分析
      this.patternAnalyzer.analyzeTaskType({
        type: PatternTypes.TASK_TYPE,
        data
      });

      // コンテキストに記録
      await this.contextManager.store.addTask({
        id: data.id,
        title: data.title,
        status: 'completed',
        completedAt: new Date().toISOString()
      }, 'self-learning-agent');

    } catch (error) {
      console.error('Error handling task completed:', error.message);
    }
  }

  /**
   * コマンド使用ハンドラ
   */
  async handleCommandUsage(event) {
    const { data } = event.payload;

    try {
      // コマンド使用頻度分析
      this.patternAnalyzer.analyzeTaskType({
        type: PatternTypes.COMMAND_USAGE,
        data
      });

      // 学習ログに記録
      await this.contextManager.addPattern('command_usage', {
        command: data.command,
        timestamp: data.timestamp,
        confidence: 0.7
      }, 'self-learning-agent');

    } catch (error) {
      console.error('Error handling command usage:', error.message);
    }
  }

  /**
   * リクエスト処理
   */
  async handleRequest(event) {
    const { payload } = event;

    try {
      const { action, params } = payload;

      switch (action) {
        case 'get_patterns':
          const patterns = this.patternStore.getPatterns(null, params.filters);
          await this.sendResponse(event, {
            status: 'success',
            data: { patterns }
          });
          break;

        case 'get_predictions':
          const predictions = this.patternPredictor.predictNextAction(params.context);
          await this.sendResponse(event, {
            status: 'success',
            data: { predictions }
          });
          break;

        case 'analyze_user':
          const userProfile = await this.contextManager.store.getUserProfile();
          const behaviorPatterns = this.getBehaviorPatterns();
          const stats = this.patternStore.getStats();

          await this.sendResponse(event, {
            status: 'success',
            data: { userProfile, behaviorPatterns, stats }
          });
          break;

        case 'get_recommendations':
          const predictions = this.patternPredictor.predictNextAction(params.context);
          await this.sendResponse(event, {
            status: 'success',
            data: { predictions }
          });
          break;

        default:
          await this.sendResponse(event, {
            status: 'error',
            error: {
              code: 'ERR_UNKNOWN_ACTION',
              message: `Unknown action: ${action}`
            }
          });
      }
    } catch (error) {
      console.error('Error handling request:', error.message);
      await this.sendResponse(event, {
        status: 'error',
        error: {
          code: 'ERR_HANDLER_FAILED',
          message: error.message
        }
      });
    }
  }

  /**
   * スケジュール更新ハンドラ
   */
  async handleScheduleUpdate(event) {
    const { data } = event.payload;

    try {
      // 作業時間パターン分析
      if (data.workingHours) {
        this.patternAnalyzer.analyzeWorkingHours({
          type: PatternTypes.WORKING_HOURS,
          data
        });
      }
    } catch (error) {
      console.error('Error handling schedule update:', error.message);
    }
  }

  /**
   * プロファイル更新ハンドラ
   */
  async handleProfileUpdate(event) {
    console.log('Profile updated, patterns will be recalculated');

    // パターンを再計算（必要に応じて）
  }

  /**
   * レスポンス送信
   */
  async sendResponse(request, payload) {
    await this.eventBus.send({
      type: 'response',
      source: 'self-learning-agent',
      target: request.source,
      correlationId: request.id,
      payload
    });
  }

  /**
   * 行動パターンを取得
   */
  getBehaviorPatterns() {
    const timePatterns = this.patternStore.getPatterns(PatternTypes.TIME_OF_DAY);
    const taskPatterns = this.patternStore.getPatterns(PatternTypes.TASK_TYPE);
    const workingHourPatterns = this.patternStore.getPatterns(PatternTypes.WORKING_HOURS);

    return {
      timeOfDay: timePatterns,
      taskTypes: taskPatterns,
      workingHours: workingHourPatterns,
      summary: this.generateSummary()
    };
  }

  /**
   * サマリーを生成
   */
  generateSummary() {
    const stats = this.patternStore.getStats();
    const patterns = this.patternStore.getPatterns();
    const activePatterns = patterns.filter(p => p.isActive);

    return {
      totalPatterns: stats.total,
      activePatterns: stats.active,
      byCategory: stats.byCategory,
      averageConfidence: this.averageConfidence(stats),
      topPatterns: patterns
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 10),
      recentActivity: patterns
        .sort((a, b) => new Date(b.lastObserved) - new Date(a.lastObserved))
        .slice(0, 5)
    };
  }

  /**
   * 平均信頼度を計算
   */
  averageConfidence(stats) {
    const patterns = Array.from(this.patternStore.patterns.values());
    if (patterns.length === 0) return 0;

    const totalConfidence = patterns.reduce((sum, p) => sum + p.confidence, 0);
    return totalConfidence / patterns.length;
  }

  /**
   * 定期分析を実行
   */
  startPeriodicAnalysis() {
    if (this.analysisTimer) {
      return;
    }

    const intervalMs = this.config.analysisInterval * 1000;

    this.analysisTimer = setInterval(() => {
      this.runPeriodicAnalysis();
    }, intervalMs);

    console.log(`✓ Periodic analysis started (interval: ${this.config.analysisInterval}s)`);
  }

  /**
   * 定期分析を実行
   */
  runPeriodicAnalysis() {
    console.log('🔍 Running periodic analysis...');

    // パターン信頼度を減衰（忘却曲線）
    this.applyConfidenceDecay();

    // 古いパターンを削除
    this.patternStore.cleanup();

    // 統計を更新
    const stats = this.patternStore.getStats();

    // 学習ログに記録
    this.recordLearningLog(stats);

    // パターンストアを保存
    this.patternStore.save().catch(err => {
      console.error('Error saving patterns:', err.message);
    });

    // パターン分析結果をコンテキストに保存
    if (stats.total > 0) {
      this.contextManager.store.addPattern('pattern_analysis', {
        timestamp: new Date().toISOString(),
        patternsCount: stats.total,
        activePatterns: stats.active,
        averageConfidence: this.averageConfidence(stats),
        topCategories: Object.keys(stats.byCategory).map(cat => ({
          category: cat,
          count: stats.byCategory[cat]
        }))
      }, 'self-learning-agent').catch(err => {
        console.error('Error saving pattern analysis:', err.message);
      });
    }
  }

  /**
   * 信頼度減衰を適用
   */
  applyConfidenceDecay() {
    const decay = this.config.confidenceDecay;

    for (const pattern of this.patternStore.patterns.values()) {
      const oldConfidence = pattern.confidence;
      pattern.confidence = oldConfidence * decay;

      // 非アクティブ化
      if (pattern.confidence < ConfidenceLevel.LOW) {
        pattern.isActive = false;
      }
    }
  }

  /**
   * 学習ログを記録
   */
  async recordLearningLog(stats) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'periodic_analysis',
      stats
    };

    try {
      const logs = await fs.readFile(LEARNING_LOG_PATH, 'utf8');
      const parsedLogs = JSON.parse(logs);

      parsedLogs.push(logEntry);

      // 保存件数を制限
      const maxLogs = 100;
      if (parsedLogs.length > maxLogs) {
        parsedLogs = parsedLogs.slice(-maxLogs);
      }

      await fs.writeFile(LEARNING_LOG_PATH, JSON.stringify(parsedLogs, null, 2), 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('Error recording learning log:', err.message);
      }
    }
  }

  /**
   * 統計情報を取得
   */
  getStats() {
    return {
      patterns: this.patternStore.getStats(),
      learningLog: this.getLearningLog(),
      config: this.config,
      initialized: this.initialized,
      analysisTimerActive: this.analysisTimer !== null
    };
  }

  /**
   * 学習ログを取得
   */
  async getLearningLog() {
    try {
      const logs = await fs.readFile(LEARNING_LOG_PATH, 'utf8');
      return JSON.parse(logs);
    } catch (err) {
      return [];
    }
  }

  /**
   * シャットダウン
   */
  async shutdown() {
    console.log('Shutting down Self-Learning Agent...');

    // 定期分析を停止
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }

    // パターンストアを保存
    await this.patternStore.save();

    // 全ての購読を解除
    this.eventBus.unsubscribeAll('self-learning-agent');

    // シャットダウンイベントを発行
    await this.eventBus.send({
      type: 'event',
      source: 'self-learning-agent',
      target: '*',
      payload: {
        eventType: 'skill_shutdown',
        skillId: 'self-learning-agent'
      }
    });

    this.initialized = false;
    console.log('✓ Self-Learning Agent shut down');
  }
}

module.exports = {
  SelfLearningAgent,
  PatternStore,
  PatternAnalyzer,
  PatternPredictor,
  PatternTypes,
  PatternCategories,
  ConfidenceLevel
};

// テスト用：メイン実行
if (require.main === module) {
  const { SkillEventBus } = require('../lib/skill-event-bus');

  console.log('Testing Self-Learning Pattern Recognition...\n');

  // イベントバス初期化
  const eventBus = new SkillEventBus();

  // 自己学習エージェント初期化
  const agent = new SelfLearningAgent(eventBus, {
    enabled: true,
    autoAnalyze: false,
    minObservations: 3,
    analysisInterval: 60
  });

  agent.initialize().then(() => {
    console.log('\n=== Testing Pattern Recognition ===\n');

    // テスト：時間帯パターン検出
    agent.handleUserActivity({
      type: 'event',
      source: 'test',
      payload: {
        eventType: 'user_activity',
        data: {
          timestamp: new Date().toISOString()
        }
      }
    }).then(() => {
      // しばらく待つて、分析が完了するのを待つ
      setTimeout(() => {
        const behaviorPatterns = agent.getBehaviorPatterns();
        console.log('\n--- Behavior Patterns ---\n');
        console.log(JSON.stringify(behaviorPatterns.timeOfDay.slice(0, 3), null, 2));
        console.log('\n--- Task Types ---\n');
        console.log(JSON.stringify(behaviorPatterns.taskTypes.slice(0, 3), null, 2));
      }, 5000);
    });

    // テスト：予測
    agent.handleRequest({
      id: 'test-prediction',
      type: 'request',
      source: 'test',
      payload: {
        action: 'get_predictions',
        params: {
          context: {
            recentTasks: [
              { taskType: 'coding', timestamp: new Date(Date.now() - 86400000).toISOString() }
            ]
          }
        }
      }
    }).then(() => {
      // 結果を待つ
      setTimeout(() => {
        const patterns = agent.patternStore.getPatterns();
        console.log(`\n--- Detected Patterns (${patterns.length}) ---\n`);
        console.log(JSON.stringify(patterns.map(p => ({
          type: p.type,
          confidence: p.confidence,
          frequency: p.frequency
        })), null, 2));
      }, 2000);
    });

    // 統計表示
    setTimeout(() => {
      const stats = agent.getStats();
      console.log('\n--- Statistics ---\n');
      console.log(JSON.stringify(stats, null, 2));
    }, 10000);
  }).catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}
