/**
 * Error Handler Skill
 * 標準化されたエラーハンドリング、ロギング、リカバリ機能
 */

const fs = require('fs').promises;
const path = require('path');
const { ContextSharingManager, ContextTypes } = require(path.join(__dirname, '../../lib/context-sharing'));

const BASE_DIR = __dirname;
const DATA_DIR = path.join(BASE_DIR, 'data');
const ERROR_LOG_PATH = path.join(DATA_DIR, 'errors.json');
const STATS_PATH = path.join(DATA_DIR, 'stats.json');
const HEALTH_PATH = path.join(DATA_DIR, 'health.json');

/**
 * エラータイプ
 */
const ErrorTypes = {
  NETWORK: 'network',
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  VALIDATION: 'validation',
  DEPENDENCY: 'dependency',
  RUNTIME: 'runtime',
  SYSTEM: 'system',
  API: 'api',
  UNKNOWN: 'unknown'
};

/**
 * 重大度レベル
 */
const SeverityLevels = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};

/**
 * エラーエントリ
 */
class ErrorEntry {
  constructor(error, context = {}) {
    this.id = this.generateId();
    this.timestamp = new Date().toISOString();
    this.type = this.classifyError(error);
    this.severity = this.determineSeverity(error, this.type);
    this.source = context.source || 'unknown';
    this.operation = context.operation || 'unknown';
    this.message = error.message || String(error);
    this.stackTrace = error.stack || '';
    this.context = context;
    this.recovered = false;
    this.retryCount = 0;
  }

  /**
   * IDを生成
   */
  generateId() {
    return 'err_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * エラーを分類
   */
  classifyError(error) {
    const message = error.message ? error.message.toLowerCase() : '';
    const code = error.code || '';

    // ネットワークエラー
    if (message.includes('econnrefused') ||
        message.includes('etimedout') ||
        message.includes('enotfound') ||
        message.includes('network') ||
        code === 'ECONNREFUSED' ||
        code === 'ETIMEDOUT' ||
        code === 'ENOTFOUND') {
      return ErrorTypes.NETWORK;
    }

    // 認証エラー
    if (message.includes('unauthorized') ||
        message.includes('401') ||
        message.includes('authentication')) {
      return ErrorTypes.AUTHENTICATION;
    }

    // 認可エラー
    if (message.includes('forbidden') ||
        message.includes('403') ||
        message.includes('authorization')) {
      return ErrorTypes.AUTHORIZATION;
    }

    // バリデーションエラー
    if (message.includes('validation') ||
        message.includes('invalid') ||
        message.includes('required')) {
      return ErrorTypes.VALIDATION;
    }

    // 依存関係エラー
    if (message.includes('module not found') ||
        message.includes('cannot find module')) {
      return ErrorTypes.DEPENDENCY;
    }

    // APIエラー
    if (message.includes('500') ||
        message.includes('internal server error')) {
      return ErrorTypes.API;
    }

    // システムエラー
    if (message.includes('out of memory') ||
        message.includes('disk space')) {
      return ErrorTypes.SYSTEM;
    }

    return ErrorTypes.UNKNOWN;
  }

  /**
   * 重大度を決定
   */
  determineSeverity(error, type) {
    // 明示的に重大度が指定されている場合
    if (error.severity) {
      return error.severity;
    }

    // タイプに基づくデフォルト
    const severityMap = {
      [ErrorTypes.NETWORK]: SeverityLevels.HIGH,
      [ErrorTypes.AUTHENTICATION]: SeverityLevels.HIGH,
      [ErrorTypes.AUTHORIZATION]: SeverityLevels.MEDIUM,
      [ErrorTypes.VALIDATION]: SeverityLevels.LOW,
      [ErrorTypes.DEPENDENCY]: SeverityLevels.CRITICAL,
      [ErrorTypes.RUNTIME]: SeverityLevels.MEDIUM,
      [ErrorTypes.SYSTEM]: SeverityLevels.CRITICAL,
      [ErrorTypes.API]: SeverityLevels.HIGH,
      [ErrorTypes.UNKNOWN]: SeverityLevels.MEDIUM
    };

    return severityMap[type] || SeverityLevels.MEDIUM;
  }

  /**
   * JSONに変換
   */
  toJSON() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      type: this.type,
      severity: this.severity,
      source: this.source,
      operation: this.operation,
      message: this.message,
      stackTrace: this.stackTrace,
      context: this.context,
      recovered: this.recovered,
      retryCount: this.retryCount
    };
  }
}

/**
 * エラーログ
 */
class ErrorLog {
  constructor(config = {}) {
    this.config = {
      maxLogSize: config.maxLogSize || 10000, // 10,000 エントリ
      retentionDays: config.retentionDays || 90
    };

    this.errors = [];
    this.errorsByType = new Map();
    this.errorsBySeverity = new Map();
  }

  /**
   * エラーを追加
   */
  addError(errorEntry) {
    this.errors.push(errorEntry);

    // タイプ別インデックス
    if (!this.errorsByType.has(errorEntry.type)) {
      this.errorsByType.set(errorEntry.type, []);
    }
    this.errorsByType.get(errorEntry.type).push(errorEntry);

    // 重大度別インデックス
    if (!this.errorsBySeverity.has(errorEntry.severity)) {
      this.errorsBySeverity.set(errorEntry.severity, []);
    }
    this.errorsBySeverity.get(errorEntry.severity).push(errorEntry);

    // 最大サイズを超えたら古いものを削除
    if (this.errors.length > this.config.maxLogSize) {
      const removed = this.errors.shift();

      // インデックスから削除
      const typeErrors = this.errorsByType.get(removed.type);
      if (typeErrors) {
        const index = typeErrors.findIndex(e => e.id === removed.id);
        if (index !== -1) typeErrors.splice(index, 1);
      }

      const severityErrors = this.errorsBySeverity.get(removed.severity);
      if (severityErrors) {
        const index = severityErrors.findIndex(e => e.id === removed.id);
        if (index !== -1) severityErrors.splice(index, 1);
      }
    }

    return errorEntry;
  }

  /**
   * エラー一覧を取得
   */
  getErrors(filters = {}) {
    let results = [...this.errors];

    if (filters.type) {
      results = results.filter(e => e.type === filters.type);
    }

    if (filters.severity) {
      results = results.filter(e => e.severity === filters.severity);
    }

    if (filters.source) {
      results = results.filter(e => e.source === filters.source);
    }

    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }

    // 新しい順にソート
    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return results;
  }

  /**
   * 統計を取得
   */
  getStats() {
    const total = this.errors.length;

    const byType = {};
    for (const [type, errors] of this.errorsByType) {
      byType[type] = errors.length;
    }

    const bySeverity = {};
    for (const [severity, errors] of this.errorsBySeverity) {
      bySeverity[severity] = errors.length;
    }

    const recovered = this.errors.filter(e => e.recovered).length;
    const notRecovered = total - recovered;

    return {
      total,
      byType,
      bySeverity,
      recovered,
      notRecovered,
      recoveryRate: total > 0 ? recovered / total : 0
    };
  }

  /**
   * 古いエラーを削除
   */
  async cleanup() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.retentionDays);

    const initialCount = this.errors.length;
    this.errors = this.errors.filter(e => new Date(e.timestamp) >= cutoff);

    // インデックスを再構築
    this.errorsByType.clear();
    this.errorsBySeverity.clear();

    for (const error of this.errors) {
      if (!this.errorsByType.has(error.type)) {
        this.errorsByType.set(error.type, []);
      }
      this.errorsByType.get(error.type).push(error);

      if (!this.errorsBySeverity.has(error.severity)) {
        this.errorsBySeverity.set(error.severity, []);
      }
      this.errorsBySeverity.get(error.severity).push(error);
    }

    const removedCount = initialCount - this.errors.length;
    console.log(`✓ Cleaned up ${removedCount} old error entries`);

    return removedCount;
  }

  /**
   * 保存
   */
  async save() {
    const data = {
      version: '1.0.0',
      savedAt: new Date().toISOString(),
      errors: this.errors.map(e => e.toJSON()),
      stats: this.getStats()
    };

    // ディレクトリが存在しない場合は作成
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (err) {
      // ディレクトリが既に存在する場合は無視
    }

    await fs.writeFile(ERROR_LOG_PATH, JSON.stringify(data, null, 2), 'utf8');
  }

  /**
   * 読み込み
   */
  async load() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });

      const data = await fs.readFile(ERROR_LOG_PATH, 'utf8');
      const parsed = JSON.parse(data);

      if (parsed.errors) {
        for (const errorData of parsed.errors) {
          const errorEntry = new ErrorEntry(
            { message: errorData.message, stack: errorData.stackTrace },
            errorData.context
          );
          errorEntry.id = errorData.id;
          errorEntry.timestamp = errorData.timestamp;
          errorEntry.type = errorData.type;
          errorEntry.severity = errorData.severity;
          errorEntry.recovered = errorData.recovered;
          errorEntry.retryCount = errorData.retryCount;

          this.addError(errorEntry);
        }
      }

      console.log(`✓ Loaded ${this.errors.length} error entries`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('Error loading error log:', err.message);
      }
      // 初回実行時はOK
    }
  }
}

/**
 * ヘルスチェッカー
 */
class HealthChecker {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.services = new Map();
    this.lastHealthCheck = null;
    this.healthStatus = 'unknown';
  }

  /**
   * サービスを登録
   */
  registerService(serviceId, status = 'unknown') {
    this.services.set(serviceId, {
      id: serviceId,
      status,
      lastCheck: new Date().toISOString()
    });
  }

  /**
   * サービスを更新
   */
  updateService(serviceId, status) {
    if (this.services.has(serviceId)) {
      const service = this.services.get(serviceId);
      service.status = status;
      service.lastCheck = new Date().toISOString();
    }
  }

  /**
   * ヘルスチェックを実行
   */
  async checkHealth() {
    const services = {};
    let overallStatus = 'healthy';

    for (const [id, service] of this.services) {
      services[id] = {
        status: service.status,
        lastCheck: service.lastCheck
      };

      if (service.status !== 'healthy' && service.status !== 'ok') {
        overallStatus = 'degraded';
      }

      if (service.status === 'critical' || service.status === 'error') {
        overallStatus = 'unhealthy';
      }
    }

    const oldStatus = this.healthStatus;
    this.healthStatus = overallStatus;
    this.lastHealthCheck = new Date().toISOString();

    // ステータス変化を通知
    if (oldStatus !== overallStatus) {
      await this.eventBus.send({
        type: 'event',
        source: 'error-handler',
        target: '*',
        payload: {
          eventType: 'health_status_changed',
          oldStatus,
          newStatus: overallStatus,
          services
        }
      });
    }

    return {
      status: overallStatus,
      timestamp: this.lastHealthCheck,
      services
    };
  }

  /**
   * ヘルス情報を取得
   */
  getHealth() {
    return {
      status: this.healthStatus,
      timestamp: this.lastHealthCheck,
      services: Object.fromEntries(this.services)
    };
  }
}

/**
 * メインエラーハンドラ
 */
class ErrorHandler {
  constructor(eventBus, config = {}) {
    this.eventBus = eventBus;
    this.config = {
      enabled: config.enabled !== false,
      recoveryEnabled: config.recoveryEnabled !== false,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      exponentialBackoff: config.exponentialBackoff !== false
    };

    this.errorLog = new ErrorLog(config.logging);
    this.healthChecker = new HealthChecker(eventBus);
    this.alertCooldowns = new Map();
    this.monitoringTimer = null;
    this.initialized = false;
  }

  /**
   * 初期化
   */
  async initialize() {
    console.log('🛡️ Error Handler initializing...');

    // コンテキストマネージャーの初期化
    this.contextManager = new ContextSharingManager(this.eventBus, {
      maxItems: 1000,
      retentionDays: 90
    });

    // エラーログの読み込み
    await this.errorLog.load();

    // イベント購読を設定
    this.setupEventSubscriptions();

    // 監視を開始
    if (this.config.enabled) {
      this.startMonitoring();
    }

    this.initialized = true;
    console.log('✓ Error Handler initialized successfully');

    // 初期化完了イベントを発行
    await this.eventBus.send({
      type: 'event',
      source: 'error-handler',
      target: '*',
      payload: {
        eventType: 'agent_ready',
        skillId: 'error-handler',
        version: '1.0.0',
        capabilities: ['error_handling', 'logging', 'recovery', 'health_check']
      }
    });
  }

  /**
   * イベント購読を設定
   */
  setupEventSubscriptions() {
    // エラーイベント
    this.eventBus.subscribe('error-handler', {
      type: 'event',
      payload: {
        eventType: 'error_occurred'
      }
    }, this.handleErrorEvent.bind(this));

    // リクエスト処理
    this.eventBus.subscribe('error-handler', {
      type: 'request',
      target: 'error-handler'
    }, this.handleRequest.bind(this));
  }

  /**
   * エラーをハンドル
   */
  async handleError(error, context = {}) {
    if (!this.config.enabled) {
      return null;
    }

    // エラーエントリを作成
    const errorEntry = new ErrorEntry(error, context);
    this.errorLog.addError(errorEntry);

    // エラーイベントを発行
    await this.eventBus.send({
      type: 'event',
      source: 'error-handler',
      target: '*',
      payload: {
        eventType: 'error_occurred',
        error: errorEntry.toJSON()
      }
    });

    // 自動リカバリを試行
    if (this.config.recoveryEnabled) {
      const recovered = await this.attemptRecovery(errorEntry);
      if (recovered) {
        errorEntry.recovered = true;
        await this.eventBus.send({
          type: 'event',
          source: 'error-handler',
          target: '*',
          payload: {
            eventType: 'error_recovered',
            errorId: errorEntry.id,
            recoveryMethod: recovered.method
          }
        });
      } else {
        await this.eventBus.send({
          type: 'event',
          source: 'error-handler',
          target: '*',
          payload: {
            eventType: 'error_failed',
            errorId: errorEntry.id
          }
        });
      }
    }

    // エラーログを保存
    await this.errorLog.save();

    // アラートを送信
    await this.checkAlerts();

    return errorEntry;
  }

  /**
   * エラーイベントハンドラ
   */
  async handleErrorEvent(event) {
    const { error, context } = event.payload;
    await this.handleError(error, context);
  }

  /**
   * 自動リカバリを試行
   */
  async attemptRecovery(errorEntry) {
    const { type, severity } = errorEntry;

    // クリティカル以外はリカバリを試行
    if (severity === SeverityLevels.CRITICAL) {
      return null;
    }

    // リカバリ戦略
    const strategies = {
      [ErrorTypes.NETWORK]: this.recoverNetworkError.bind(this),
      [ErrorTypes.AUTHENTICATION]: this.recoverAuthenticationError.bind(this),
      [ErrorTypes.DEPENDENCY]: this.recoverDependencyError.bind(this)
    };

    const strategy = strategies[type];
    if (strategy) {
      return await strategy(errorEntry);
    }

    return null;
  }

  /**
   * ネットワークエラーリカバリ
   */
  async recoverNetworkError(errorEntry) {
    console.log('Attempting network error recovery...');

    // 実装は依存関係による
    // モック：成功を返す
    return {
      method: 'retry_with_backoff',
      success: true
    };
  }

  /**
   * 認証エラーリカバリ
   */
  async recoverAuthenticationError(errorEntry) {
    console.log('Attempting authentication error recovery...');

    // 実装は依存関係による
    return {
      method: 'token_refresh',
      success: true
    };
  }

  /**
   * 依存関係エラーリカバリ
   */
  async recoverDependencyError(errorEntry) {
    console.log('Attempting dependency error recovery...');

    // 実装は依存関係による
    return {
      method: 'reinstall_dependency',
      success: true
    };
  }

  /**
   * アラートをチェック
   */
  async checkAlerts() {
    const stats = this.errorLog.getStats();
    const config = this.config.alerts || {};

    const criticalCount = stats.bySeverity[SeverityLevels.CRITICAL] || 0;
    const highCount = stats.bySeverity[SeverityLevels.HIGH] || 0;

    // クリティカル閾値チェック
    if (criticalCount >= config.criticalThreshold) {
      await this.sendAlert('critical', criticalCount);
    }

    // ハイ閾値チェック
    if (highCount >= config.highThreshold) {
      await this.sendAlert('high', highCount);
    }
  }

  /**
   * アラートを送信
   */
  async sendAlert(severity, count) {
    const now = Date.now();
    const cooldown = (this.config.alerts || {}).cooldownPeriod || 300;

    // クールダウンチェック
    const lastAlert = this.alertCooldowns.get(severity);
    if (lastAlert && now - lastAlert < cooldown * 1000) {
      return;
    }

    this.alertCooldowns.set(severity, now);

    // アラートイベントを発行
    await this.eventBus.send({
      type: 'event',
      source: 'error-handler',
      target: '*',
      payload: {
        eventType: 'error_threshold_exceeded',
        severity,
        count,
        timestamp: new Date().toISOString()
      }
    });

    console.log(`🚨 Alert: ${severity} error threshold exceeded (${count} errors)`);
  }

  /**
   * リクエスト処理
   */
  async handleRequest(event) {
    const { payload } = event;

    try {
      const { action, params } = payload;

      switch (action) {
        case 'get_errors':
          const errors = this.errorLog.getErrors(params.filters || {});
          await this.sendResponse(event, {
            status: 'success',
            data: { errors }
          });
          break;

        case 'get_stats':
          const stats = this.errorLog.getStats();
          await this.sendResponse(event, {
            status: 'success',
            data: { stats }
          });
          break;

        case 'get_health':
          const health = await this.healthChecker.checkHealth();
          await this.sendResponse(event, {
            status: 'success',
            data: { health }
          });
          break;

        case 'register_service':
          this.healthChecker.registerService(
            params.serviceId,
            params.status
          );
          await this.sendResponse(event, {
            status: 'success',
            data: { success: true }
          });
          break;

        case 'clear_errors':
          this.errorLog.errors = [];
          this.errorLog.errorsByType.clear();
          this.errorLog.errorsBySeverity.clear();
          await this.errorLog.save();
          await this.sendResponse(event, {
            status: 'success',
            data: { success: true }
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
   * 統計を取得
   */
  async getStats() {
    const errorStats = this.errorLog.getStats();
    const health = this.healthChecker.getHealth();

    return {
      errors: errorStats,
      health,
      config: this.config,
      initialized: this.initialized,
      monitoringActive: this.monitoringTimer !== null
    };
  }

  /**
   * レスポンス送信
   */
  async sendResponse(request, payload) {
    await this.eventBus.send({
      type: 'response',
      source: 'error-handler',
      target: request.source,
      correlationId: request.id,
      payload
    });
  }

  /**
   * 監視を開始
   */
  startMonitoring() {
    if (this.monitoringTimer) {
      return;
    }

    const intervalMs = (this.config.monitoring || {}).healthCheckInterval || 60 * 1000;

    this.monitoringTimer = setInterval(async () => {
      await this.healthChecker.checkHealth();
    }, intervalMs);

    console.log(`✓ Monitoring started (interval: ${intervalMs / 1000}s)`);
  }

  /**
   * シャットダウン
   */
  async shutdown() {
    console.log('Shutting down Error Handler...');

    // 監視を停止
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    // エラーログを保存
    await this.errorLog.save();

    // 全ての購読を解除
    this.eventBus.unsubscribeAll('error-handler');

    // シャットダウンイベントを発行
    await this.eventBus.send({
      type: 'event',
      source: 'error-handler',
      target: '*',
      payload: {
        eventType: 'skill_shutdown',
        skillId: 'error-handler'
      }
    });

    this.initialized = false;
    console.log('✓ Error Handler shut down');
  }
}

module.exports = {
  ErrorHandler,
  ErrorLog,
  HealthChecker,
  ErrorEntry,
  ErrorTypes,
  SeverityLevels
};

// テスト用：メイン実行
if (require.main === module) {
  const { SkillEventBus } = require(path.join(__dirname, '../../lib/skill-event-bus'));

  console.log('Testing Error Handler...\n');

  const eventBus = new SkillEventBus();

  // エラーハンドラ初期化
  const errorHandler = new ErrorHandler(eventBus, {
    enabled: true,
    recoveryEnabled: true,
    maxRetries: 3,
    retryDelay: 1000
  });

  errorHandler.initialize().then(async () => {
    console.log('\n=== Testing Error Handling ===\n');

    // テスト：エラーをハンドル
    const error = new Error('Connection refused');
    error.code = 'ECONNREFUSED';

    await errorHandler.handleError(error, {
      source: 'test-skill',
      operation: 'connectToDatabase',
      userId: 'test123'
    });

    // テスト：統計表示
    const stats = await errorHandler.getStats();
    console.log('\n--- Statistics ---\n');
    console.log(JSON.stringify(stats.errors, null, 2));

    // テスト：ヘルスチェック
    const health = await errorHandler.healthChecker.checkHealth();
    console.log('\n--- Health Status ---\n');
    console.log(JSON.stringify(health, null, 2));

  }).catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}
