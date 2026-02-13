/**
 * スキルアダプター (Skill Adapter)
 * 全てのスキルが実装すべき共通インターフェース
 */

/**
 * UUID生成
 */
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * 基底スキルアダプター
 * スキル開発者が継承して使用する
 */
class BaseSkillAdapter {
  constructor(skillId, eventBus, config = {}) {
    this.skillId = skillId;
    this.eventBus = eventBus;
    this.config = {
      version: config.version || '1.0.0',
      capabilities: config.capabilities || [],
      heartbeatInterval: config.heartbeatInterval || 30000,
      autoResubscribe: config.autoResubscribe !== false
    };

    this.state = {
      status: 'initializing',
      subscriptions: [],
      metrics: {
        messagesReceived: 0,
        messagesProcessed: 0,
        messagesFailed: 0,
        lastActivity: null
      }
    };

    this.heartbeatTimer = null;
  }

  /**
   * 初期化（サブクラスでオーバーライド）
   */
  async initialize() {
    console.log(`Initializing skill: ${this.skillId}...`);

    // イベントバスにスキルを登録
    this.eventBus.register(this.skillId, {
      version: this.config.version,
      capabilities: this.config.capabilities
    });

    // デフォルト購読を設定
    this.setupDefaultSubscriptions();

    // ハートビート開始
    this.startHeartbeat();

    this.state.status = 'ready';

    console.log(`✓ Skill ${this.skillId} initialized successfully`);
  }

  /**
   * デフォルト購読の設定
   */
  setupDefaultSubscriptions() {
    // 自分へのリクエストを購読
    this.subscribe({
      type: 'request',
      target: this.skillId
    }, this.handleRequest.bind(this));

    // 自分へのレスポンスを購読
    this.subscribe({
      type: 'response',
      target: this.skillId
    }, this.handleResponse.bind(this));

    // 全てのイベントを購読
    this.subscribe({
      type: 'event',
      target: this.skillId
    }, this.handleEvent.bind(this));

    // 自分への通知を購読
    this.subscribe({
      type: 'notification',
      target: this.skillId
    }, this.handleNotification.bind(this));

    // エラーイベントを購読
    this.subscribe({
      type: 'event',
      payload: {
        eventType: 'error_occurred'
      }
    }, this.handleError.bind(this));

    // シャットダウンイベントを購読
    this.subscribe({
      type: 'event',
      payload: {
        eventType: 'skill_shutdown'
      },
      target: this.skillId
    }, this.handleShutdown.bind(this));
  }

  /**
   * メッセージ処理（サブクラスでオーバーライド）
   */
  async handle(message) {
    this.state.metrics.messagesReceived++;
    this.state.metrics.lastActivity = new Date().toISOString();

    console.log(`${this.skillId} received message:`, message.type);

    // メッセージタイプに応じて処理をルーティング
    switch (message.type) {
      case 'request':
        await this.handleRequest(message);
        break;

      case 'response':
        await this.handleResponse(message);
        break;

      case 'event':
        await this.handleEvent(message);
        break;

      case 'notification':
        await this.handleNotification(message);
        break;

      default:
        console.warn(`Unknown message type: ${message.type}`);
    }

    this.state.metrics.messagesProcessed++;
  }

  /**
   * リクエスト処理（サブクラスでオーバーライド）
   */
  async handleRequest(message) {
    console.log(`${this.skillId} handling request:`, message.payload.action);

    // デフォルト：サポートしていないアクション
    await this.sendResponse(message, {
      status: 'error',
      error: {
        code: 'ERR_UNSUPPORTED_ACTION',
        message: `Action ${message.payload.action} is not supported`
      }
    });
  }

  /**
   * レスポンス処理（サブクラスでオーバーライド）
   */
  async handleResponse(message) {
    console.log(`${this.skillId} received response:`, message);
    // サブクラスでカスタムロジックを実装
  }

  /**
   * イベント処理（サブクラスでオーバーライド）
   */
  async handleEvent(message) {
    console.log(`${this.skillId} received event:`, message.payload.eventType);
    // サブクラスでカスタムロジックを実装
  }

  /**
   * 通知処理（サブクラスでオーバーライド）
   */
  async handleNotification(message) {
    console.log(`${this.skillId} received notification:`, message.payload);
    // サブクラスでカスタムロジックを実装
  }

  /**
   * エラー処理
   */
  async handleError(message) {
    console.error(`${this.skillId} received error:`, message.payload);
    this.state.metrics.messagesFailed++;

    // サブクラスでカスタムエラーハンドリングを実装
  }

  /**
   * シャットダウン処理
   */
  async handleShutdown(message) {
    console.log(`${this.skillId} received shutdown request`);
    await this.shutdown();
  }

  /**
   * メッセージ送信
   */
  async send(message) {
    const normalizedMessage = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      source: this.skillId,
      ...message
    };

    return await this.eventBus.send(normalizedMessage);
  }

  /**
   * レスポンス送信
   */
  async sendResponse(originalMessage, payload) {
    return await this.send({
      type: 'response',
      target: originalMessage.source,
      correlationId: originalMessage.id,
      payload
    });
  }

  /**
   * イベント発行
   */
  async emit(eventType, payload = {}) {
    return await this.send({
      type: 'event',
      target: '*',
      payload: {
        eventType,
        ...payload
      }
    });
  }

  /**
   * リクエスト送信
   */
  async request(targetSkillId, action, params = {}, options = {}) {
    return await this.send({
      type: 'request',
      target: targetSkillId,
      payload: {
        action,
        params
      },
      metadata: options
    });
  }

  /**
   * メッセージ購読
   */
  subscribe(filter, callback) {
    const subscription = {
      filter,
      callback,
      skillId: this.skillId
    };

    this.eventBus.subscribe(this.skillId, filter, callback);
    this.state.subscriptions.push(subscription);
  }

  /**
   * 全ての購読を解除
   */
  unsubscribeAll() {
    this.eventBus.unsubscribeAll(this.skillId);
    this.state.subscriptions = [];
  }

  /**
   * ハートビート開始
   */
  startHeartbeat() {
    if (this.heartbeatTimer) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      this.eventBus.updateHeartbeat(this.skillId);
      this.emit('heartbeat', {
        timestamp: new Date().toISOString(),
        status: this.state.status
      });
    }, this.config.heartbeatInterval);

    console.log(`✓ Heartbeat started for ${this.skillId}`);
  }

  /**
   * ハートビート停止
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      console.log(`✓ Heartbeat stopped for ${this.skillId}`);
    }
  }

  /**
   * メトリクス取得
   */
  getMetrics() {
    return {
      skillId: this.skillId,
      ...this.state.metrics,
      uptime: Date.now() - (this.state.initializedAt || Date.now()),
      subscriptions: this.state.subscriptions.length
    };
  }

  /**
   * シャットダウン
   */
  async shutdown() {
    console.log(`Shutting down skill: ${this.skillId}...`);

    this.state.status = 'shutting_down';

    // ハートビート停止
    this.stopHeartbeat();

    // 全ての購読を解除
    this.unsubscribeAll();

    // イベントバスからスキルを登録解除
    this.eventBus.unregister(this.skillId);

    this.state.status = 'shutdown';

    console.log(`✓ Skill ${this.skillId} shut down`);
  }
}

/**
 * スキルファクトリ
 * スキルIDからアダプターインスタンスを作成
 */
class SkillFactory {
  constructor(eventBus, config = {}) {
    this.eventBus = eventBus;
    this.config = config;
    this.skillRegistry = new Map();
  }

  /**
   * スキルタイプを登録
   */
  registerSkillType(skillId, adapterClass) {
    this.skillRegistry.set(skillId, adapterClass);
    console.log(`✓ Skill type registered: ${skillId}`);
  }

  /**
   * スキルインスタンスを作成
   */
  createSkill(skillId, skillConfig = {}) {
    const AdapterClass = this.skillRegistry.get(skillId);

    if (!AdapterClass) {
      throw new Error(`Skill type not registered: ${skillId}`);
    }

    return new AdapterClass(skillId, this.eventBus, skillConfig);
  }

  /**
   * 全てのスキルを初期化
   */
  async initializeAll(skillsToInitialize = []) {
    const initializedSkills = [];

    for (const skillId of skillsToInitialize) {
      try {
        const skill = this.createSkill(skillId);
        await skill.initialize();
        initializedSkills.push(skill);
      } catch (error) {
        console.error(`Failed to initialize skill ${skillId}:`, error.message);
      }
    }

    return initializedSkills;
  }
}

/**
 * エラーハンドラーユーティリティ
 */
class SkillErrorHandler {
  static handle(skillId, error, context = {}) {
    const errorInfo = {
      skillId,
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code || 'ERR_UNKNOWN'
      },
      context
    };

    console.error('Skill error:', JSON.stringify(errorInfo, null, 2));

    // エラーイベントを発行
    return errorInfo;
  }

  static isRecoverable(error) {
    const recoverableErrors = [
      'ERR_TIMEOUT',
      'ERR_RATE_LIMITED',
      'ERR_PAYLOAD_TOO_LARGE'
    ];

    return recoverableErrors.includes(error.code);
  }
}

module.exports = {
  BaseSkillAdapter,
  SkillFactory,
  SkillErrorHandler
};

// テスト用：メイン実行
if (require.main === module) {
  const { SkillEventBus } = require('./skill-event-bus');

  // イベントバス初期化
  const eventBus = new SkillEventBus();

  // スキルファクトリ作成
  const factory = new SkillFactory(eventBus);

  // カスタムスキルクラス定義
  class TestSkill extends BaseSkillAdapter {
    async initialize() {
      await super.initialize();
      console.log('Test skill custom initialization');
    }

    async handleRequest(message) {
      console.log('Test skill handling custom request');
      await this.sendResponse(message, {
        status: 'success',
        data: { result: 'custom_response' }
      });
    }
  }

  // スキルタイプを登録
  factory.registerSkillType('test-skill', TestSkill);

  // スキル作成・初期化
  const skill = factory.createSkill('test-skill');
  skill.initialize().then(() => {
    console.log('Skill initialized successfully');
  }).catch(error => {
    console.error('Initialization failed:', error.message);
  });
}
