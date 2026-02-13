/**
 * フィードバックループ (Feedback Loop)
 * ユーザーフィードバックを収集・分析し、AI学習を改善する
 */

const fs = require('fs').promises;
const path = require('path');
const { ContextSharingManager, ContextTypes, AccessLevels } = require(path.join(__dirname, '../../lib/context-sharing'));
const { SkillEventBus } = require(path.join(__dirname, '../../lib/skill-event-bus'));

const BASE_DIR = __dirname;
const DATA_DIR = path.join(BASE_DIR, 'data');
const FEEDBACK_PATH = path.join(DATA_DIR, 'feedback.json');
const STATS_PATH = path.join(DATA_DIR, 'stats.json');

/**
 * フィードバック感情
 */
const FeedbackSentiment = {
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
  NEUTRAL: 'neutral'
};

/**
 * フィードバックアイテムタイプ
 */
const FeedbackItemType = {
  PATTERN: 'pattern',
  PREDICTION: 'prediction',
  RESPONSE: 'response',
  ACTION: 'action',
  RECOMMENDATION: 'recommendation'
};

/**
 * フィードバックデータ構造
 */
class Feedback {
  constructor(itemId, itemType, data = {}) {
    this.id = this.generateId();
    this.itemId = itemId;
    this.itemType = itemType;
    this.rating = data.rating || 3;
    this.sentiment = data.sentiment || FeedbackSentiment.NEUTRAL;
    this.comment = data.comment || '';
    this.context = data.context || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.processed = false;
  }

  /**
   * IDを生成
   */
  generateId() {
    return 'fb-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * JSONに変換
   */
  toJSON() {
    return {
      id: this.id,
      itemId: this.itemId,
      itemType: this.itemType,
      rating: this.rating,
      sentiment: this.sentiment,
      comment: this.comment,
      context: this.context,
      timestamp: this.timestamp,
      processed: this.processed
    };
  }
}

/**
 * フィードバックストア
 */
class FeedbackStore {
  constructor(config = {}) {
    this.config = {
      maxFeedback: config.maxFeedback || 1000,
      retentionDays: config.retentionDays || 90
    };

    this.feedback = [];
    this.feedbackByItem = new Map();
    this.feedbackByType = new Map();
  }

  /**
   * フィードバックを追加
   */
  addFeedback(feedback) {
    this.feedback.push(feedback);

    // アイテム別インデックス
    if (!this.feedbackByItem.has(feedback.itemId)) {
      this.feedbackByItem.set(feedback.itemId, []);
    }
    this.feedbackByItem.get(feedback.itemId).push(feedback);

    // タイプ別インデックス
    if (!this.feedbackByType.has(feedback.itemType)) {
      this.feedbackByType.set(feedback.itemType, []);
    }
    this.feedbackByType.get(feedback.itemType).push(feedback);

    // 最大数を超えたら古いものを削除
    if (this.feedback.length > this.config.maxFeedback) {
      const removed = this.feedback.shift();
      this.removeFromIndexes(removed);
    }

    return feedback;
  }

  /**
   * フィードバックを取得
   */
  getFeedback(filters = {}) {
    let results = [...this.feedback];

    if (filters.itemId) {
      results = results.filter(f => f.itemId === filters.itemId);
    }

    if (filters.itemType) {
      results = results.filter(f => f.itemType === filters.itemType);
    }

    if (filters.sentiment) {
      results = results.filter(f => f.sentiment === filters.sentiment);
    }

    if (filters.minRating !== undefined) {
      results = results.filter(f => f.rating >= filters.minRating);
    }

    if (filters.maxRating !== undefined) {
      results = results.filter(f => f.rating <= filters.maxRating);
    }

    if (filters.startDate) {
      results = results.filter(f => new Date(f.timestamp) >= new Date(filters.startDate));
    }

    if (filters.endDate) {
      results = results.filter(f => new Date(f.timestamp) <= new Date(filters.endDate));
    }

    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }

    // 新しい順にソート
    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return results;
  }

  /**
   * アイテムのフィードバックを取得
   */
  getItemFeedback(itemId) {
    return this.feedbackByItem.get(itemId) || [];
  }

  /**
   * 統計を取得
   */
  getStats() {
    const total = this.feedback.length;
    if (total === 0) {
      return {
        total: 0,
        positiveRatio: 0,
        averageRating: 0,
        byType: {},
        bySentiment: {},
        ratingDistribution: {
          1: 0, 2: 0, 3: 0, 4: 0, 5: 0
        }
      };
    }

    const positive = this.feedback.filter(f => f.sentiment === FeedbackSentiment.POSITIVE).length;
    const negative = this.feedback.filter(f => f.sentiment === FeedbackSentiment.NEGATIVE).length;
    const neutral = this.feedback.filter(f => f.sentiment === FeedbackSentiment.NEUTRAL).length;

    const sumRating = this.feedback.reduce((sum, f) => sum + f.rating, 0);
    const averageRating = sumRating / total;

    const byType = {};
    for (const [type, feedbacks] of this.feedbackByType) {
      byType[type] = feedbacks.length;
    }

    const bySentiment = {
      positive: positive,
      negative: negative,
      neutral: neutral
    };

    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const f of this.feedback) {
      if (ratingDistribution[f.rating] !== undefined) {
        ratingDistribution[f.rating]++;
      }
    }

    return {
      total,
      positiveRatio: positive / total,
      averageRating: Math.round(averageRating * 10) / 10,
      byType,
      bySentiment,
      ratingDistribution
    };
  }

  /**
   * インデックスから削除
   */
  removeFromIndexes(feedback) {
    const itemFeedbacks = this.feedbackByItem.get(feedback.itemId);
    if (itemFeedbacks) {
      const index = itemFeedbacks.findIndex(f => f.id === feedback.id);
      if (index !== -1) {
        itemFeedbacks.splice(index, 1);
      }
    }

    const typeFeedbacks = this.feedbackByType.get(feedback.itemType);
    if (typeFeedbacks) {
      const index = typeFeedbacks.findIndex(f => f.id === feedback.id);
      if (index !== -1) {
        typeFeedbacks.splice(index, 1);
      }
    }
  }

  /**
   * 古いフィードバックを削除
   */
  async cleanup() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.retentionDays);

    const initialCount = this.feedback.length;
    this.feedback = this.feedback.filter(f => new Date(f.timestamp) >= cutoff);

    // インデックスを再構築
    this.feedbackByItem.clear();
    this.feedbackByType.clear();

    for (const feedback of this.feedback) {
      if (!this.feedbackByItem.has(feedback.itemId)) {
        this.feedbackByItem.set(feedback.itemId, []);
      }
      this.feedbackByItem.get(feedback.itemId).push(feedback);

      if (!this.feedbackByType.has(feedback.itemType)) {
        this.feedbackByType.set(feedback.itemType, []);
      }
      this.feedbackByType.get(feedback.itemType).push(feedback);
    }

    const removedCount = initialCount - this.feedback.length;
    console.log(`✓ Cleaned up ${removedCount} old feedback entries`);

    return removedCount;
  }

  /**
   * 保存
   */
  async save() {
    const data = {
      version: '1.0.0',
      savedAt: new Date().toISOString(),
      feedback: this.feedback.map(f => f.toJSON()),
      stats: this.getStats()
    };

    // ディレクトリが存在しない場合は作成
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (err) {
      // ディレクトリが既に存在する場合は無視
    }

    await fs.writeFile(FEEDBACK_PATH, JSON.stringify(data, null, 2), 'utf8');
    await fs.writeFile(STATS_PATH, JSON.stringify(data.stats, null, 2), 'utf8');
  }

  /**
   * 読み込み
   */
  async load() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });

      const data = await fs.readFile(FEEDBACK_PATH, 'utf8');
      const parsed = JSON.parse(data);

      if (parsed.feedback) {
        for (const feedbackData of parsed.feedback) {
          const feedback = new Feedback(
            feedbackData.itemId,
            feedbackData.itemType,
            feedbackData
          );
          this.addFeedback(feedback);
        }
      }

      console.log(`✓ Loaded ${this.feedback.length} feedback entries`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('Error loading feedback:', err.message);
      }
      // 初回実行時はOK
    }
  }
}

/**
 * フィードバックアナライザー
 */
class FeedbackAnalyzer {
  constructor(feedbackStore) {
    this.feedbackStore = feedbackStore;
  }

  /**
   * アイテムの信頼度を計算
   */
  calculateItemConfidence(itemId) {
    const feedbacks = this.feedbackStore.getItemFeedback(itemId);

    if (feedbacks.length === 0) {
      return null;
    }

    const positive = feedbacks.filter(f => f.sentiment === FeedbackSentiment.POSITIVE).length;
    const sumRating = feedbacks.reduce((sum, f) => sum + f.rating, 0);
    const averageRating = sumRating / feedbacks.length;

    const confidence = averageRating / 5;

    return {
      itemId,
      confidence: Math.max(0, Math.min(1, confidence)),
      averageRating: Math.round(averageRating * 10) / 10,
      totalFeedback: feedbacks.length,
      positiveRatio: positive / feedbacks.length
    };
  }

  /**
   * トレンド分析
   */
  analyzeTrend(days = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const recentFeedbacks = this.feedbackStore.getFeedback({
      startDate: cutoff.toISOString()
    });

    if (recentFeedbacks.length === 0) {
      return {
        period: `${days}d`,
        positiveRatio: 0,
        averageRating: 0,
        total: 0
      };
    }

    const positive = recentFeedbacks.filter(f => f.sentiment === FeedbackSentiment.POSITIVE).length;
    const sumRating = recentFeedbacks.reduce((sum, f) => sum + f.rating, 0);

    return {
      period: `${days}d`,
      positiveRatio: positive / recentFeedbacks.length,
      averageRating: Math.round((sumRating / recentFeedbacks.length) * 10) / 10,
      total: recentFeedbacks.length
    };
  }

  /**
   * 改善提案を生成
   */
  generateRecommendations() {
    const stats = this.feedbackStore.getStats();
    const recommendations = [];

    // 平均評価が低い場合
    if (stats.averageRating < 3.5) {
      recommendations.push({
        type: 'quality',
        priority: 'high',
        message: '全体的な評価が低いです。品質改善が必要です。',
        metric: 'average_rating',
        value: stats.averageRating
      });
    }

    // ネガティブフィードバックが多い場合
    if (stats.positiveRatio < 0.6) {
      recommendations.push({
        type: 'accuracy',
        priority: 'high',
        message: '正のフィードバック比率が低いです。精度を向上してください。',
        metric: 'positive_ratio',
        value: stats.positiveRatio
      });
    }

    // 特定のタイプが低評価の場合
    for (const [type, count] of Object.entries(stats.byType)) {
      const typeFeedbacks = this.feedbackStore.getFeedback({ itemType: type });
      if (typeFeedbacks.length > 0) {
        const sumRating = typeFeedbacks.reduce((sum, f) => sum + f.rating, 0);
        const avgRating = sumRating / typeFeedbacks.length;

        if (avgRating < 3.0) {
          recommendations.push({
            type: 'specific',
            priority: 'medium',
            message: `${type} タイプの評価が低いです。改善が必要です。`,
            metric: `${type}_rating`,
            value: avgRating
          });
        }
      }
    }

    return recommendations;
  }
}

/**
 * メインフィードバックループマネージャー
 */
class FeedbackLoopManager {
  constructor(eventBus, config = {}) {
    this.eventBus = eventBus;
    this.config = {
      enabled: config.enabled !== false,
      autoUpdateConfidence: config.autoUpdateConfidence !== false,
      confidenceAdjustment: config.confidenceAdjustment || {
        positive: 0.1,
        negative: -0.15,
        perRating: 0.05
      },
      minFeedbackForUpdate: config.minFeedbackForUpdate || 3,
      analysisInterval: config.analysisInterval || 3600
    };

    this.feedbackStore = new FeedbackStore(config.storage);
    this.feedbackAnalyzer = new FeedbackAnalyzer(this.feedbackStore);
    this.contextManager = null;
    this.analysisTimer = null;
    this.initialized = false;
  }

  /**
   * 初期化
   */
  async initialize() {
    console.log('🔄 Feedback Loop Manager initializing...');

    // コンテキストマネージャーの初期化
    this.contextManager = new ContextSharingManager(this.eventBus, {
      maxItems: 1000,
      retentionDays: 90
    });

    // フィードバックの読み込み
    await this.feedbackStore.load();

    // イベント購読を設定
    this.setupEventSubscriptions();

    // 定期分析を開始
    if (this.config.enabled) {
      this.startPeriodicAnalysis();
    }

    this.initialized = true;
    console.log('✓ Feedback Loop Manager initialized successfully');

    // 初期化完了イベントを発行
    await this.eventBus.send({
      type: 'event',
      source: 'feedback-loop',
      target: '*',
      payload: {
        eventType: 'agent_ready',
        skillId: 'feedback-loop',
        version: '1.0.0',
        capabilities: ['feedback_collection', 'confidence_update', 'analysis']
      }
    });
  }

  /**
   * イベント購読を設定
   */
  setupEventSubscriptions() {
    // ユーザーフィードバックイベント
    this.eventBus.subscribe('feedback-loop', {
      type: 'event',
      payload: {
        eventType: 'user_feedback'
      }
    }, this.handleUserFeedback.bind(this));

    // リクエスト処理
    this.eventBus.subscribe('feedback-loop', {
      type: 'request',
      target: 'feedback-loop'
    }, this.handleRequest.bind(this));
  }

  /**
   * フィードバックを記録
   */
  async recordFeedback(data) {
    const { itemId, itemType, rating, sentiment, comment, context } = data;

    const feedback = new Feedback(itemId, itemType, {
      rating,
      sentiment,
      comment,
      context
    });

    this.feedbackStore.addFeedback(feedback);

    // イベントを発行
    await this.eventBus.send({
      type: 'event',
      source: 'feedback-loop',
      target: '*',
      payload: {
        eventType: 'feedback_recorded',
        feedback: feedback.toJSON()
      }
    });

    // 自動更新が有効な場合
    if (this.config.autoUpdateConfidence) {
      await this.processFeedback(feedback);
    }

    return feedback;
  }

  /**
   * 正のフィードバックを記録
   */
  async recordPositiveFeedback(itemId, itemType = 'pattern', comment = '') {
    return this.recordFeedback({
      itemId,
      itemType,
      rating: 5,
      sentiment: FeedbackSentiment.POSITIVE,
      comment,
      context: {
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * 負のフィードバックを記録
   */
  async recordNegativeFeedback(itemId, itemType = 'pattern', comment = '') {
    return this.recordFeedback({
      itemId,
      itemType,
      rating: 1,
      sentiment: FeedbackSentiment.NEGATIVE,
      comment,
      context: {
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * 評価を記録
   */
  async recordRating(itemId, itemType, rating, comment = '') {
    let sentiment = FeedbackSentiment.NEUTRAL;
    if (rating >= 4) {
      sentiment = FeedbackSentiment.POSITIVE;
    } else if (rating <= 2) {
      sentiment = FeedbackSentiment.NEGATIVE;
    }

    return this.recordFeedback({
      itemId,
      itemType,
      rating,
      sentiment,
      comment,
      context: {
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * ユーザーフィードバックハンドラ
   */
  async handleUserFeedback(event) {
    const { data } = event.payload;

    try {
      await this.recordFeedback(data);
    } catch (error) {
      console.error('Error handling user feedback:', error.message);
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
        case 'record_feedback':
          const feedback = await this.recordFeedback(params);
          await this.sendResponse(event, {
            status: 'success',
            data: { feedback: feedback.toJSON() }
          });
          break;

        case 'get_stats':
          const stats = this.feedbackStore.getStats();
          await this.sendResponse(event, {
            status: 'success',
            data: { stats }
          });
          break;

        case 'get_feedback':
          const feedbacks = this.feedbackStore.getFeedback(params.filters || {});
          await this.sendResponse(event, {
            status: 'success',
            data: { feedbacks }
          });
          break;

        case 'get_item_feedback':
          const itemFeedbacks = this.feedbackStore.getItemFeedback(params.itemId);
          await this.sendResponse(event, {
            status: 'success',
            data: { feedbacks: itemFeedbacks }
          });
          break;

        case 'get_recommendations':
          const recommendations = this.feedbackAnalyzer.generateRecommendations();
          await this.sendResponse(event, {
            status: 'success',
            data: { recommendations }
          });
          break;

        case 'analyze_trend':
          const trend = this.feedbackAnalyzer.analyzeTrend(params.days || 7);
          await this.sendResponse(event, {
            status: 'success',
            data: { trend }
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
   * フィードバックを処理
   */
  async processFeedback(feedback) {
    const itemFeedbacks = this.feedbackStore.getItemFeedback(feedback.itemId);

    // 最小フィードバック数に達した場合のみ更新
    if (itemFeedbacks.length >= this.config.minFeedbackForUpdate) {
      const itemStats = this.feedbackAnalyzer.calculateItemConfidence(feedback.itemId);

      if (itemStats) {
        await this.updateItemConfidence(
          feedback.itemId,
          feedback.itemType,
          itemStats.confidence
        );

        // イベントを発行
        await this.eventBus.send({
          type: 'event',
          source: 'feedback-loop',
          target: '*',
          payload: {
            eventType: 'pattern_confidence_updated',
            itemId: feedback.itemId,
            itemType: feedback.itemType,
            newConfidence: itemStats.confidence,
            stats: itemStats
          }
        });
      }
    }
  }

  /**
   * アイテム信頼度を更新
   */
  async updateItemConfidence(itemId, itemType, confidence) {
    // Self-Learning Agentに信頼度更新を依頼
    await this.eventBus.send({
      type: 'request',
      source: 'feedback-loop',
      target: 'self-learning-agent',
      payload: {
        action: 'update_pattern_confidence',
        params: {
          patternId: itemId,
          confidence
        }
      }
    });

    // コンテキストに記録
    await this.contextManager.addPattern('feedback_confidence_update', {
      itemId,
      itemType,
      confidence,
      timestamp: new Date().toISOString()
    }, 'feedback-loop');
  }

  /**
   * 統計情報を取得
   */
  async getStats() {
    const stats = this.feedbackStore.getStats();
    const trend7d = this.feedbackAnalyzer.analyzeTrend(7);
    const trend30d = this.feedbackAnalyzer.analyzeTrend(30);
    const recommendations = this.feedbackAnalyzer.generateRecommendations();

    return {
      ...stats,
      trends: {
        '7d': trend7d,
        '30d': trend30d
      },
      recommendations,
      config: this.config,
      initialized: this.initialized
    };
  }

  /**
   * レスポンス送信
   */
  async sendResponse(request, payload) {
    await this.eventBus.send({
      type: 'response',
      source: 'feedback-loop',
      target: request.source,
      correlationId: request.id,
      payload
    });
  }

  /**
   * 定期分析を開始
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
  async runPeriodicAnalysis() {
    console.log('🔍 Running periodic feedback analysis...');

    try {
      // 統計を取得
      const stats = await this.getStats();

      // フィードバックを保存
      await this.feedbackStore.save();

      // 古いフィードバックを削除
      await this.feedbackStore.cleanup();

      // コンテキストに記録
      await this.contextManager.addPattern('feedback_analysis', {
        timestamp: new Date().toISOString(),
        totalFeedback: stats.total,
        positiveRatio: stats.positiveRatio,
        averageRating: stats.averageRating,
        recommendationsCount: stats.recommendations.length
      }, 'feedback-loop');

      // イベントを発行
      await this.eventBus.send({
        type: 'event',
        source: 'feedback-loop',
        target: '*',
        payload: {
          eventType: 'feedback_analysis_completed',
          stats
        }
      });

      // 推奨がある場合は通知
      if (stats.recommendations.length > 0) {
        console.log('📝 Recommendations:', stats.recommendations.length);
      }

    } catch (error) {
      console.error('Error in periodic analysis:', error.message);
    }
  }

  /**
   * シャットダウン
   */
  async shutdown() {
    console.log('Shutting down Feedback Loop Manager...');

    // 定期分析を停止
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }

    // フィードバックを保存
    await this.feedbackStore.save();

    // 全ての購読を解除
    this.eventBus.unsubscribeAll('feedback-loop');

    // シャットダウンイベントを発行
    await this.eventBus.send({
      type: 'event',
      source: 'feedback-loop',
      target: '*',
      payload: {
        eventType: 'skill_shutdown',
        skillId: 'feedback-loop'
      }
    });

    this.initialized = false;
    console.log('✓ Feedback Loop Manager shut down');
  }
}

module.exports = {
  FeedbackLoopManager,
  FeedbackStore,
  FeedbackAnalyzer,
  Feedback,
  FeedbackSentiment,
  FeedbackItemType
};

// テスト用：メイン実行
if (require.main === module) {
  console.log('Testing Feedback Loop...\n');

  const eventBus = new SkillEventBus();

  // フィードバックループマネージャー初期化
  const manager = new FeedbackLoopManager(eventBus, {
    enabled: true,
    autoUpdateConfidence: true,
    minFeedbackForUpdate: 2,
    analysisInterval: 60
  });

  manager.initialize().then(() => {
    console.log('\n=== Testing Feedback Collection ===\n');

    // テスト：正のフィードバック
    manager.recordPositiveFeedback('pattern-123', 'pattern', '素晴らしい！').then(feedback => {
      console.log('Positive feedback recorded:', feedback.id);
    });

    // テスト：負のフィードバック
    manager.recordNegativeFeedback('pattern-456', 'pattern', '改善が必要').then(feedback => {
      console.log('Negative feedback recorded:', feedback.id);
    });

    // テスト：評価
    manager.recordRating('pattern-789', 'pattern', 4, '良い').then(feedback => {
      console.log('Rating recorded:', feedback.id);
    });

    // 統計表示
    setTimeout(async () => {
      const stats = await manager.getStats();
      console.log('\n--- Statistics ---\n');
      console.log(JSON.stringify(stats, null, 2));
    }, 1000);

    // フィードバック履歴表示
    setTimeout(() => {
      const feedbacks = manager.feedbackStore.getFeedback();
      console.log('\n--- Feedback History ---\n');
      console.log(JSON.stringify(feedbacks.map(f => ({
        id: f.id,
        itemType: f.itemType,
        rating: f.rating,
        sentiment: f.sentiment,
        comment: f.comment
      })), null, 2));
    }, 2000);

  }).catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}
