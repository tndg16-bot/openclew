/**
 * コンテキスト共有メカニズム (Context Sharing Mechanism)
 * スキル間でコンテキストを共有するための実装
 */

const fs = require('fs').promises;
const path = require('path');

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

const BASE_DIR = __dirname;
const CONTEXT_STORE_PATH = path.join(BASE_DIR, 'context-store.json');

/**
 * コンテキストタイプ
 */
const ContextTypes = {
  USER_PROFILE: 'user_profile',
  SESSION_DATA: 'session_data',
  PREFERENCES: 'preferences',
  PATTERNS: 'patterns',
  TASKS: 'tasks',
  ERROR_LOG: 'error_log',
  METRICS: 'metrics'
};

/**
 * アクセスレベル
 */
const AccessLevels = {
  PUBLIC: 'public',      // 全スキルがアクセス可能
  PROTECTED: 'protected',  // 特定のスキルのみアクセス可能
  PRIVATE: 'private'      // 作成スキルのみアクセス可能
};

/**
 * コンテキストアイテム
 */
class ContextItem {
  constructor(type, data, options = {}) {
    this.id = uuidv4();
    this.type = type;
    this.data = data;
    this.accessLevel = options.accessLevel || AccessLevels.PUBLIC;
    this.creator = options.creator || 'unknown';
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    this.expiresAt = options.expiresAt || null;
    this.tags = options.tags || [];
    this.metadata = options.metadata || {};
  }

  /**
   * アイテムが有効かチェック
   */
  isValid() {
    if (this.expiresAt) {
      return new Date(this.expiresAt) > new Date();
    }
    return true;
  }

  /**
   * アイテムを更新
   */
  update(data, options = {}) {
    this.data = data;
    this.updatedAt = new Date().toISOString();
    if (options.expiresAt) {
      this.expiresAt = options.expiresAt;
    }
    if (options.tags) {
      this.tags = options.tags;
    }
  }
}

/**
 * コンテキストストア
 */
class ContextStore {
  constructor(config = {}) {
    this.config = {
      maxItems: config.maxItems || 10000,
      retentionDays: config.retentionDays || 90,
      autoCleanup: config.autoCleanup !== false,
      persistenceEnabled: config.persistenceEnabled !== false
    };

    this.items = new Map();
    this.tagsIndex = new Map();
    this.typeIndex = new Map();
    this.creatorIndex = new Map();

    this.load().catch(err => {
      console.error('Failed to load context store:', err.message);
    });
  }

  /**
   * コンテキストを追加
   */
  async add(type, data, options = {}) {
    const item = new ContextItem(type, data, options);

    // 最大アイテム数チェック
    if (this.items.size >= this.config.maxItems) {
      await this.cleanup();
    }

    this.items.set(item.id, item);
    this.updateIndexes(item);

    if (this.config.persistenceEnabled) {
      await this.save();
    }

    console.log(`✓ Context added: ${item.type} (${item.id})`);
    return item;
  }

  /**
   * コンテキストを取得
   */
  async get(id) {
    const item = this.items.get(id);

    if (!item) {
      return null;
    }

    if (!item.isValid()) {
      await this.remove(id);
      return null;
    }

    return item;
  }

  /**
   * タイプでコンテキストを検索
   */
  async getByType(type, options = {}) {
    const limit = options.limit || 100;
    const offset = options.offset || 0;
    const sortBy = options.sortBy || 'createdAt';
    const sortOrder = options.sortOrder || 'desc';

    const items = Array.from(this.items.values())
      .filter(item => item.type === type && item.isValid());

    // ソート
    items.sort((a, b) => {
      const valueA = new Date(a[sortBy]).getTime();
      const valueB = new Date(b[sortBy]).getTime();
      return sortOrder === 'asc' ? valueA - valueB : valueB - valueA;
    });

    // ページネーション
    return items.slice(offset, offset + limit);
  }

  /**
   * タグでコンテキストを検索
   */
  async getByTags(tags, options = {}) {
    const limit = options.limit || 100;
    const offset = options.offset || 0;
    const operator = options.operator || 'and'; // 'and' or 'or'

    const items = Array.from(this.items.values())
      .filter(item => {
        if (!item.isValid()) {
          return false;
        }

        if (operator === 'and') {
          return tags.every(tag => item.tags.includes(tag));
        } else {
          return tags.some(tag => item.tags.includes(tag));
        }
      });

    return items.slice(offset, offset + limit);
  }

  /**
   * キーワードでコンテキストを検索
   */
  async search(keyword, options = {}) {
    const limit = options.limit || 100;
    const offset = options.offset || 0;
    const fields = options.fields || ['data']; // 検索対象フィールド

    const lowerKeyword = keyword.toLowerCase();

    const items = Array.from(this.items.values())
      .filter(item => {
        if (!item.isValid()) {
          return false;
        }

        return fields.some(field => {
          const value = item[field];
          if (typeof value === 'string') {
            return value.toLowerCase().includes(lowerKeyword);
          } else if (typeof value === 'object' && value !== null) {
            return JSON.stringify(value).toLowerCase().includes(lowerKeyword);
          }
          return false;
        });
      });

    return items.slice(offset, offset + limit);
  }

  /**
   * ユーザープロファイルを取得
   */
  async getUserProfile() {
    return await this.getByType(ContextTypes.USER_PROFILE, { limit: 1 });
  }

  /**
   * ユーザープロファイルを設定
   */
  async setUserProfile(profile, creator = 'personalized-ai-agent') {
    // 既存のプロファイルを削除
    const existing = await this.getUserProfile();
    if (existing.length > 0) {
      for (const item of existing) {
        await this.remove(item.id);
      }
    }

    // 新しいプロファイルを追加
    return await this.add(ContextTypes.USER_PROFILE, profile, {
      creator,
      accessLevel: AccessLevels.PROTECTED,
      tags: ['user', 'profile'],
      expiresAt: null // プロファイルは期限なし
    });
  }

  /**
   * パターンを追加
   */
  async addPattern(patternType, patternData, creator = 'self-learning-agent') {
    return await this.add(ContextTypes.PATTERNS, {
      type: patternType,
      ...patternData
    }, {
      creator,
      accessLevel: AccessLevels.PROTECTED,
      tags: ['pattern', patternType],
      metadata: {
        confidence: patternData.confidence || 0.5
      },
      expiresAt: this.calculateExpiryDate()
    });
  }

  /**
   * タスクを追加
   */
  async addTask(task, creator = 'task-tracker') {
    return await this.add(ContextTypes.TASKS, task, {
      creator,
      accessLevel: AccessLevels.PUBLIC,
      tags: ['task', task.status || 'pending'],
      expiresAt: task.completedAt ? this.calculateExpiryDate() : null
    });
  }

  /**
   * エラーを記録
   */
  async logError(error, creator = 'error-auto-healer') {
    return await this.add(ContextTypes.ERROR_LOG, {
      message: error.message,
      stack: error.stack,
      code: error.code || 'ERR_UNKNOWN',
      timestamp: new Date().toISOString()
    }, {
      creator,
      accessLevel: AccessLevels.PRIVATE,
      tags: ['error', error.code || 'unknown'],
      expiresAt: this.calculateExpiryDate()
    });
  }

  /**
   * コンテキストを更新
   */
  async update(id, data, options = {}) {
    const item = this.items.get(id);

    if (!item) {
      throw new Error(`Context item not found: ${id}`);
    }

    item.update(data, options);

    this.updateIndexes(item);

    if (this.config.persistenceEnabled) {
      await this.save();
    }

    console.log(`✓ Context updated: ${item.type} (${id})`);
    return item;
  }

  /**
   * コンテキストを削除
   */
  async remove(id) {
    const item = this.items.get(id);

    if (!item) {
      return false;
    }

    this.removeFromIndexes(item);
    this.items.delete(id);

    if (this.config.persistenceEnabled) {
      await this.save();
    }

    console.log(`✓ Context removed: ${item.type} (${id})`);
    return true;
  }

  /**
   * タイプ別にコンテキストを削除
   */
  async removeByType(type) {
    const items = Array.from(this.items.values())
      .filter(item => item.type === type);

    for (const item of items) {
      await this.remove(item.id);
    }

    return items.length;
  }

  /**
   * 期限切れコンテキストを削除
   */
  async cleanup() {
    const now = new Date();
    let removed = 0;

    for (const [id, item] of this.items) {
      if (!item.isValid()) {
        await this.remove(id);
        removed++;
      }
    }

    // 期限切れを検出
    const expired = Array.from(this.items.values())
      .filter(item => item.expiresAt && new Date(item.expiresAt) < now);

    for (const item of expired) {
      await this.remove(item.id);
      removed++;
    }

    console.log(`✓ Cleaned up ${removed} expired context items`);
    return removed;
  }

  /**
   * インデックスを更新
   */
  updateIndexes(item) {
    // タグインデックス
    for (const tag of item.tags) {
      if (!this.tagsIndex.has(tag)) {
        this.tagsIndex.set(tag, new Set());
      }
      this.tagsIndex.get(tag).add(item.id);
    }

    // タイプインデックス
    if (!this.typeIndex.has(item.type)) {
      this.typeIndex.set(item.type, new Set());
    }
    this.typeIndex.get(item.type).add(item.id);

    // 作成者インデックス
    if (!this.creatorIndex.has(item.creator)) {
      this.creatorIndex.set(item.creator, new Set());
    }
    this.creatorIndex.get(item.creator).add(item.id);
  }

  /**
   * インデックスから削除
   */
  removeFromIndexes(item) {
    for (const tag of item.tags) {
      const index = this.tagsIndex.get(tag);
      if (index) {
        index.delete(item.id);
        if (index.size === 0) {
          this.tagsIndex.delete(tag);
        }
      }
    }

    const typeIndex = this.typeIndex.get(item.type);
    if (typeIndex) {
      typeIndex.delete(item.id);
      if (typeIndex.size === 0) {
        this.typeIndex.delete(item.type);
      }
    }

    const creatorIndex = this.creatorIndex.get(item.creator);
    if (creatorIndex) {
      creatorIndex.delete(item.id);
      if (creatorIndex.size === 0) {
        this.creatorIndex.delete(item.creator);
      }
    }
  }

  /**
   * 有効期限を計算
   */
  calculateExpiryDate() {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + this.config.retentionDays);
    return expiryDate.toISOString();
  }

  /**
   * ストアを保存
   */
  async save() {
    const data = {
      version: '1.0.0',
      savedAt: new Date().toISOString(),
      items: Array.from(this.items.values())
    };

    await fs.writeFile(CONTEXT_STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
  }

  /**
   * ストアを読み込み
   */
  async load() {
    try {
      const data = await fs.readFile(CONTEXT_STORE_PATH, 'utf8');
      const parsed = JSON.parse(data);

      if (parsed.items) {
        for (const itemData of parsed.items) {
          const item = new ContextItem(itemData.type, itemData.data, {
            accessLevel: itemData.accessLevel,
            creator: itemData.creator,
            tags: itemData.tags,
            metadata: itemData.metadata,
            expiresAt: itemData.expiresAt
          });
          item.id = itemData.id;
          item.createdAt = itemData.createdAt;
          item.updatedAt = itemData.updatedAt;
          this.items.set(item.id, item);
          this.updateIndexes(item);
        }
      }

      console.log(`✓ Loaded ${this.items.size} context items`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('Error loading context store:', err.message);
      }
    }
  }

  /**
   * 統計情報を取得
   */
  getStats() {
    const items = Array.from(this.items.values());
    const validItems = items.filter(item => item.isValid());
    const expiredItems = items.filter(item => !item.isValid());

    const typeStats = {};
    for (const item of validItems) {
      typeStats[item.type] = (typeStats[item.type] || 0) + 1;
    }

    const creatorStats = {};
    for (const item of validItems) {
      creatorStats[item.creator] = (creatorStats[item.creator] || 0) + 1;
    }

    return {
      total: items.length,
      valid: validItems.length,
      expired: expiredItems.length,
      utilization: `${((items.length / this.config.maxItems) * 100).toFixed(1)}%`,
      byType: typeStats,
      byCreator: creatorStats,
      tagCount: this.tagsIndex.size,
      typeCount: this.typeIndex.size,
      creatorCount: this.creatorIndex.size
    };
  }
}

/**
 * コンテキスト共有マネージャー
 */
class ContextSharingManager {
  constructor(eventBus, config = {}) {
    this.eventBus = eventBus;
    this.store = new ContextStore(config);

    // イベント購読を設定
    this.setupEventSubscriptions();
  }

  /**
   * イベント購読を設定
   */
  setupEventSubscriptions() {
    // コンテキスト更新イベント
    this.eventBus.subscribe('context-sharing-manager', {
      type: 'event',
      payload: {
        eventType: 'context_update'
      }
    }, this.handleContextUpdate.bind(this));

    // コンテキストリクエストイベント
    this.eventBus.subscribe('context-sharing-manager', {
      type: 'request',
      payload: {
        action: 'get_context'
      }
    }, this.handleGetContext.bind(this));

    // プロファイル更新イベント
    this.eventBus.subscribe('context-sharing-manager', {
      type: 'event',
      payload: {
        eventType: 'profile_updated'
      }
    }, this.handleProfileUpdate.bind(this));
  }

  /**
   * コンテキスト更新を処理
   */
  async handleContextUpdate(event) {
    const { type, data, options } = event.payload.data;

    try {
      await this.store.add(type, data, options);
    } catch (error) {
      console.error('Error handling context update:', error.message);
    }
  }

  /**
   * コンテキスト取得リクエストを処理
   */
  async handleGetContext(request) {
    const { action, params } = request.payload;

    if (action === 'get_context') {
      try {
        const { type, id, tags, keyword } = params;
        let items;

        if (id) {
          const item = await this.store.get(id);
          items = item ? [item] : [];
        } else if (type) {
          items = await this.store.getByType(type, params);
        } else if (tags) {
          items = await this.store.getByTags(tags, params);
        } else if (keyword) {
          items = await this.store.search(keyword, params);
        } else {
          items = [];
        }

        await this.eventBus.send({
          type: 'response',
          source: 'context-sharing-manager',
          target: request.source,
          correlationId: request.id,
          payload: {
            status: 'success',
            data: { items }
          }
        });
      } catch (error) {
        await this.eventBus.send({
          type: 'response',
          source: 'context-sharing-manager',
          target: request.source,
          correlationId: request.id,
          payload: {
            status: 'error',
            error: {
              code: 'ERR_CONTEXT_GET_FAILED',
              message: error.message
            }
          }
        });
      }
    }
  }

  /**
   * プロファイル更新を処理
   */
  async handleProfileUpdate(event) {
    const { profile, creator } = event.payload.data;

    try {
      await this.store.setUserProfile(profile, creator);

      // プロファイル更新イベントを発行
      await this.eventBus.send({
        type: 'event',
        source: 'context-sharing-manager',
        target: '*',
        payload: {
          eventType: 'profile_synced',
          data: { profile }
        }
      });
    } catch (error) {
      console.error('Error handling profile update:', error.message);
    }
  }

  /**
   * 統計情報を取得
   */
  async getStats() {
    return this.store.getStats();
  }

  /**
   * クリーンアップを実行
   */
  async cleanup() {
    return await this.store.cleanup();
  }
}

module.exports = {
  ContextTypes,
  AccessLevels,
  ContextStore,
  ContextSharingManager,
  ContextItem
};

// テスト用：メイン実行
if (require.main === module) {
  const { SkillEventBus } = require('./skill-event-bus');

  console.log('Testing Context Sharing Mechanism...\n');

  // イベントバス初期化
  const eventBus = new SkillEventBus();

  // コンテキスト共有マネージャー初期化
  const manager = new ContextSharingManager(eventBus, {
    maxItems: 100,
    retentionDays: 30
  });

  // テスト：プロファイル追加
  manager.store.setUserProfile({
    name: 'Test User',
    preferences: {
      theme: 'dark',
      language: 'ja'
    }
  }, 'test').then(() => {
    console.log('✓ Profile added');
  });

  // テスト：パターン追加
  manager.store.addPattern('coding_pattern', {
    frequency: 10,
    timeOfDay: 'afternoon',
    confidence: 0.85
  }, 'test').then(() => {
    console.log('✓ Pattern added');
  });

  // テスト：統計表示
  setTimeout(() => {
    console.log('\n--- Statistics ---\n');
    console.log(JSON.stringify(manager.getStats(), null, 2));
  }, 1000);
}
