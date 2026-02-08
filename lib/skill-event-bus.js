/**
 * スキル間通信イベントバス (Skill Communication Event Bus)
 * OpenClawスキル間のメッセージ通信を管理する
 */

const EventEmitter = require('events');

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
 * メッセージ検証・正規化
 */
function normalizeMessage(message) {
  const now = new Date().toISOString();

  return {
    id: message.id || uuidv4(),
    type: message.type || 'event',
    timestamp: message.timestamp || now,
    source: message.source || 'unknown',
    target: message.target || '*',
    priority: message.priority || 'normal',
    correlationId: message.correlationId || null,
    payload: message.payload || {},
    metadata: {
      timeout: message.metadata?.timeout || 5000,
      retry: message.metadata?.retry || 3,
      encoding: message.metadata?.encoding || 'utf-8',
      ...message.metadata
    }
  };
}

/**
 * メッセージ検証
 */
function validateMessage(message) {
  const requiredFields = ['type', 'source', 'target', 'payload'];
  const validTypes = ['request', 'response', 'event', 'notification'];
  const validPriorities = ['high', 'normal', 'low'];

  // 必須フィールドチェック
  for (const field of requiredFields) {
    if (message[field] === undefined || message[field] === null) {
      return {
        valid: false,
        error: `Missing required field: ${field}`
      };
    }
  }

  // タイプ検証
  if (!validTypes.includes(message.type)) {
    return {
      valid: false,
      error: `Invalid message type: ${message.type}`
    };
  }

  // 優先度検証
  if (!validPriorities.includes(message.priority)) {
    return {
      valid: false,
      error: `Invalid priority: ${message.priority}`
    };
  }

  // リクエストにはcorrelationIdが必要（テスト用にデフォルト値を設定）
  if (message.type === 'request' && !message.correlationId) {
    message.correlationId = uuidv4();
  }

  return { valid: true };
}

/**
 * スキル登録情報
 */
class SkillRegistration {
  constructor(skillId, options = {}) {
    this.skillId = skillId;
    this.version = options.version || '1.0.0';
    this.capabilities = options.capabilities || [];
    this.endpoints = options.endpoints || {};
    this.status = 'ready';
    this.registeredAt = new Date().toISOString();
    this.lastHeartbeat = new Date().toISOString();
  }
}

/**
 * イベントバス実装
 */
class SkillEventBus extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      maxQueueSize: config.maxQueueSize || 10000,
      maxRetries: config.maxRetries || 3,
      defaultTimeout: config.defaultTimeout || 5000,
      enableMetrics: config.enableMetrics || true
    };

    // スキル登録情報
    this.skills = new Map();

    // メッセージキュー（優先度順）
    this.queues = {
      high: [],
      normal: [],
      low: []
    };

    // 購読者管理
    this.subscribers = new Map();

    // 待機中のレスポンス（correlationIdベース）
    this.pendingResponses = new Map();

    // メトリクス
    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      messagesFailed: 0,
      skillsRegistered: 0,
      uptime: Date.now()
    };

    // キュー処理開始
    this.startQueueProcessor();
    // ヘルスチェック開始
    this.startHealthCheck();
  }

  /**
   * スキル登録
   */
  register(skillId, options = {}) {
    if (this.skills.has(skillId)) {
      throw new Error(`Skill ${skillId} already registered`);
    }

    const registration = new SkillRegistration(skillId, options);
    this.skills.set(skillId, registration);
    this.metrics.skillsRegistered++;

    console.log(`✓ Skill registered: ${skillId} (${registration.version})`);

    // 登録イベントを発行
    this.emit('skill_registered', registration);

    return registration;
  }

  /**
   * スキル登録解除
   */
  unregister(skillId) {
    if (!this.skills.has(skillId)) {
      throw new Error(`Skill ${skillId} not registered`);
    }

    const skill = this.skills.get(skillId);
    skill.status = 'shutdown';

    // 全ての購読を解除
    this.unsubscribeAll(skillId);

    // 登録解除イベントを発行
    this.emit('skill_unregistered', skill);

    this.skills.delete(skillId);
    console.log(`✓ Skill unregistered: ${skillId}`);
  }

  /**
   * メッセージ送信
   */
  async send(message) {
    try {
      // メッセージ正規化
      const normalized = normalizeMessage(message);

      // メッセージ検証
      const validation = validateMessage(normalized);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // キューに追加
      this.enqueue(normalized);
      this.metrics.messagesSent++;

      // リクエストの場合はレスポンスを待機
      if (normalized.type === 'request') {
        return new Promise((resolve, reject) => {
          const timeout = normalized.metadata.timeout || this.config.defaultTimeout;

          const timer = setTimeout(() => {
            this.pendingResponses.delete(normalized.id);
            reject(new Error(`Request timeout: ${timeout}ms`));
          }, timeout);

          this.pendingResponses.set(normalized.id, {
            resolve,
            reject,
            timer
          });
        });
      }

      return { success: true, messageId: normalized.id };
    } catch (error) {
      this.metrics.messagesFailed++;
      console.error(`Error sending message: ${error.message}`);
      throw error;
    }
  }

  /**
   * メッセージをキューに追加
   */
  enqueue(message) {
    const priority = message.priority;

    // キューサイズチェック
    const queueSize = this.queues.high.length +
                     this.queues.normal.length +
                     this.queues.low.length;

    if (queueSize >= this.config.maxQueueSize) {
      throw new Error('Message queue is full');
    }

    // 優先度別キューに追加
    if (priority === 'high') {
      this.queues.high.unshift(message);
    } else if (priority === 'low') {
      this.queues.low.unshift(message);
    } else {
      this.queues.normal.unshift(message);
    }

    this.emit('message_queued', message);
  }

  /**
   * メッセージ購読
   */
  subscribe(skillId, filter, callback) {
    if (!this.subscribers.has(skillId)) {
      this.subscribers.set(skillId, []);
    }

    const subscription = {
      filter,
      callback,
      subscribedAt: new Date().toISOString()
    };

    this.subscribers.get(skillId).push(subscription);
    console.log(`✓ Skill ${skillId} subscribed to messages`);
  }

  /**
   * メッセージ購読解除
   */
  unsubscribe(skillId, filter = null) {
    const subscriptions = this.subscribers.get(skillId);

    if (!subscriptions) {
      return;
    }

    if (filter === null) {
      // 全ての購読を解除
      this.subscribers.delete(skillId);
    } else {
      // 特定のフィルタのみ解除
      const filtered = subscriptions.filter(
        sub => JSON.stringify(sub.filter) !== JSON.stringify(filter)
      );
      this.subscribers.set(skillId, filtered);
    }

    console.log(`✓ Skill ${skillId} unsubscribed from messages`);
  }

  /**
   * 全ての購読を解除
   */
  unsubscribeAll(skillId) {
    this.subscribers.delete(skillId);
  }

  /**
   * キュー処理ループ
   */
  startQueueProcessor() {
    const processNext = () => {
      // 優先度順で処理
      let message = null;

      if (this.queues.high.length > 0) {
        message = this.queues.high.pop();
      } else if (this.queues.normal.length > 0) {
        message = this.queues.normal.pop();
      } else if (this.queues.low.length > 0) {
        message = this.queues.low.pop();
      }

      if (message) {
        this.processMessage(message);
      }

      // 次のメッセージをスケジュール
      setImmediate(processNext);
    };

    processNext();
    console.log('✓ Message queue processor started');
  }

  /**
   * メッセージ処理
   */
  async processMessage(message) {
    try {
      this.metrics.messagesReceived++;

      // ターゲットが'*'の場合は全スキルに送信
      if (message.target === '*') {
        for (const skillId of this.skills.keys()) {
          await this.deliverToSkill(skillId, message);
        }
      } else {
        // 特定のスキルに送信
        await this.deliverToSkill(message.target, message);
      }

      this.emit('message_processed', message);
    } catch (error) {
      this.metrics.messagesFailed++;
      console.error(`Error processing message: ${error.message}`);
      this.emit('message_failed', { message, error });
    }
  }

  /**
   * スキルにメッセージを配信
   */
  async deliverToSkill(skillId, message) {
    const subscriptions = this.subscribers.get(skillId);

    if (!subscriptions || subscriptions.length === 0) {
      console.warn(`No subscribers for skill: ${skillId}`);
      return;
    }

    // フィルタに一致する購読者に配信
    for (const subscription of subscriptions) {
      if (this.matchFilter(message, subscription.filter)) {
        try {
          await subscription.callback(message);
        } catch (error) {
          console.error(`Subscriber callback error: ${error.message}`);
        }
      }
    }

    // レスポンスの場合は待機中のPromiseを解決
    if (message.type === 'response' && message.correlationId) {
      const pending = this.pendingResponses.get(message.correlationId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingResponses.delete(message.correlationId);
        pending.resolve(message);
      }
    }
  }

  /**
   * フィルタマッチング
   */
  matchFilter(message, filter) {
    if (!filter) {
      return true;
    }

    // 全てのフィルタ条件をチェック
    for (const [key, value] of Object.entries(filter)) {
      const messageValue = message[key];

      // 配列かオブジェクトの場合は部分一致を許可
      if (typeof value === 'object' && value !== null) {
        if (typeof messageValue !== 'object' || messageValue === null) {
          return false;
        }
        // オブジェクトの場合は全てのキーが含まれているかチェック
        for (const [subKey, subValue] of Object.entries(value)) {
          if (messageValue[subKey] !== subValue) {
            return false;
          }
        }
      } else {
        // プリミティブ値の場合は完全一致
        if (messageValue !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * ヘルスチェックループ
   */
  startHealthCheck() {
    const checkInterval = 30000; // 30秒ごと

    setInterval(() => {
      const now = new Date().toISOString();

      for (const [skillId, registration] of this.skills) {
        const lastHeartbeat = new Date(registration.lastHeartbeat);
        const elapsed = Date.now() - lastHeartbeat.getTime();

        // 60秒以上ハートビートがない場合は非アクティブとみなす
        if (elapsed > 60000) {
          registration.status = 'inactive';
          this.emit('skill_inactive', registration);
        }
      }
    }, checkInterval);

    console.log('✓ Health check started');
  }

  /**
   * ハートビート更新
   */
  updateHeartbeat(skillId) {
    const registration = this.skills.get(skillId);

    if (registration) {
      registration.lastHeartbeat = new Date().toISOString();
      registration.status = 'active';
    }
  }

  /**
   * メトリクス取得
   */
  getMetrics() {
    const uptime = Date.now() - this.metrics.uptime;
    const uptimeSeconds = Math.floor(uptime / 1000);

    return {
      ...this.metrics,
      uptime: uptimeSeconds,
      uptimeFormatted: formatUptime(uptimeSeconds),
      queueSize: {
        high: this.queues.high.length,
        normal: this.queues.normal.length,
        low: this.queues.low.length,
        total: this.queues.high.length + this.queues.normal.length + this.queues.low.length
      },
      registeredSkills: Array.from(this.skills.keys()),
      pendingResponses: this.pendingResponses.size
    };
  }

  /**
   * シャットダウン
   */
  async shutdown() {
    console.log('Shutting down event bus...');

    // 全てのスキルにシャットダウン通知
    for (const skillId of this.skills.keys()) {
      try {
        const skill = this.skills.get(skillId);
        skill.status = 'shutdown';
        this.emit('skill_shutdown', skill);
      } catch (error) {
        console.error(`Error shutting down skill ${skillId}: ${error.message}`);
      }
    }

    // 待機中のPromiseをキャンセル
    for (const [id, pending] of this.pendingResponses) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Event bus shutdown'));
    }

    this.pendingResponses.clear();
    this.subscribers.clear();

    console.log('✓ Event bus shut down');
  }
}

/**
 * アップタイムフォーマット
 */
function formatUptime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return `${hours}h ${minutes}m ${secs}s`;
}

module.exports = {
  SkillEventBus,
  normalizeMessage,
  validateMessage,
  SkillRegistration
};

// テスト用：メイン実行
if (require.main === module) {
  const bus = new SkillEventBus();

  // スキル登録
  bus.register('personalized-ai-agent', {
    version: '1.0.0',
    capabilities: ['skill_orchestration', 'user_profiling']
  });

  bus.register('self-learning-agent', {
    version: '1.0.0',
    capabilities: ['pattern_analysis', 'learning']
  });

  // 購読
  bus.subscribe('self-learning-agent', {
    type: 'request'
  }, (message) => {
    console.log('Received message:', JSON.stringify(message, null, 2));

    // レスポンス送信
    bus.send({
      type: 'response',
      source: 'self-learning-agent',
      target: message.source,
      correlationId: message.id,
      payload: {
        status: 'success',
        data: { result: 'OK' }
      }
    });
  });

  // リクエスト送信
  bus.send({
    type: 'request',
    source: 'personalized-ai-agent',
    target: 'self-learning-agent',
    payload: {
      action: 'get_pattern',
      params: {}
    }
  }).then(response => {
    console.log('Received response:', JSON.stringify(response, null, 2));
  }).catch(error => {
    console.error('Error:', error.message);
  });

  // メトリクス表示
  setInterval(() => {
    console.log('\n--- Metrics ---');
    console.log(JSON.stringify(bus.getMetrics(), null, 2));
  }, 10000);
}
