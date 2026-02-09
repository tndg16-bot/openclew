/**
 * Google Calendar Integration
 * Google Calendar APIと統合してスケジュール管理・同期・分析を行う
 */

const fs = require('fs').promises;
const path = require('path');
const { ContextSharingManager, ContextTypes } = require(path.join(__dirname, '../../lib/context-sharing'));

const BASE_DIR = __dirname;
const CREDENTIALS_DIR = path.join(BASE_DIR, 'credentials');

/**
 * Google Calendar Manager
 */
class GoogleCalendarManager {
  constructor(eventBus, config = {}) {
    this.eventBus = eventBus;
    this.config = {
      enabled: config.enabled !== false,
      autoSync: config.autoSync !== false,
      syncInterval: config.syncInterval || 300, // 5分
      maxRetries: config.maxRetries || 3
    };

    this.calendar = null;
    this.auth = null;
    this.syncTimer = null;
    this.eventCache = new Map();
    this.initialized = false;
  }

  /**
   * 初期化
   */
  async initialize() {
    console.log('📅 Google Calendar Manager initializing...');

    try {
      // 認証を設定
      await this.setupAuth();

      // Google Calendar APIクライアントを初期化
      this.calendar = this.createCalendarClient();

      // 初期同期
      if (this.config.enabled) {
        await this.syncCalendar();
      }

      // イベント購読を設定
      this.setupEventSubscriptions();

      // 定期同期を開始
      if (this.config.enabled && this.config.autoSync) {
        this.startPeriodicSync();
      }

      this.initialized = true;
      console.log('✓ Google Calendar Manager initialized successfully');

      // 初期化完了イベントを発行
      await this.eventBus.send({
        type: 'event',
        source: 'google-calendar',
        target: '*',
        payload: {
          eventType: 'agent_ready',
          skillId: 'google-calendar',
          version: '1.0.0',
          capabilities: ['event_management', 'schedule_sync', 'calendar_analysis']
        }
      });
    } catch (error) {
      console.error('Failed to initialize Google Calendar Manager:', error.message);
      // APIが利用できない場合でも初期化を続行（モックモード）
      this.initialized = true;
      console.log('✓ Google Calendar Manager initialized in mock mode');
    }
  }

  /**
   * 認証を設定
   */
  async setupAuth() {
    // モック実装（本番環境ではgoogle-auth-libraryを使用）
    console.log('Setting up authentication (mock mode)...');
    this.auth = { authenticated: true };
  }

  /**
   * Calendarクライアントを作成
   */
  createCalendarClient() {
    // モック実装
    return {
      events: {
        insert: this.mockInsert.bind(this),
        list: this.mockList.bind(this),
        update: this.mockUpdate.bind(this),
        delete: this.mockDelete.bind(this)
      }
    };
  }

  /**
   * モック：イベント挿入
   */
  async mockInsert(params) {
    const event = {
      id: this.generateEventId(),
      ...params.requestBody
    };

    console.log('Mock: Created event', event.id, event.summary);

    // キャッシュに保存
    this.eventCache.set(event.id, event);

    // イベントを発行
    await this.eventBus.send({
      type: 'event',
      source: 'google-calendar',
      target: '*',
      payload: {
        eventType: 'calendar_event_created',
        event
      }
    });

    return { data: event };
  }

  /**
   * モック：イベント一覧取得
   */
  async mockList(params) {
    const events = Array.from(this.eventCache.values());

    console.log('Mock: Listed events', events.length);

    return {
      data: {
        items: events
      }
    };
  }

  /**
   * モック：イベント更新
   */
  async mockUpdate(params) {
    const eventId = params.eventId;
    const existingEvent = this.eventCache.get(eventId);

    if (!existingEvent) {
      throw new Error(`Event not found: ${eventId}`);
    }

    const updatedEvent = {
      ...existingEvent,
      ...params.requestBody
    };

    this.eventCache.set(eventId, updatedEvent);

    console.log('Mock: Updated event', eventId);

    // イベントを発行
    await this.eventBus.send({
      type: 'event',
      source: 'google-calendar',
      target: '*',
      payload: {
        eventType: 'calendar_event_updated',
        event: updatedEvent
      }
    });

    return { data: updatedEvent };
  }

  /**
   * モック：イベント削除
   */
  async mockDelete(params) {
    const eventId = params.eventId;
    const deleted = this.eventCache.delete(eventId);

    if (!deleted) {
      throw new Error(`Event not found: ${eventId}`);
    }

    console.log('Mock: Deleted event', eventId);

    // イベントを発行
    await this.eventBus.send({
      type: 'event',
      source: 'google-calendar',
      target: '*',
      payload: {
        eventType: 'calendar_event_deleted',
        eventId
      }
    });

    return { data: {} };
  }

  /**
   * イベント購読を設定
   */
  setupEventSubscriptions() {
    // リクエスト処理
    this.eventBus.subscribe('google-calendar', {
      type: 'request',
      target: 'google-calendar'
    }, this.handleRequest.bind(this));
  }

  /**
   * リクエスト処理
   */
  async handleRequest(event) {
    const { payload } = event;

    try {
      const { action, params } = payload;

      switch (action) {
        case 'create_event':
          const createdEvent = await this.createEvent(params);
          await this.sendResponse(event, {
            status: 'success',
            data: { event: createdEvent }
          });
          break;

        case 'get_events':
          const events = await this.getEvents(params);
          await this.sendResponse(event, {
            status: 'success',
            data: { events }
          });
          break;

        case 'get_events_for_week':
          const weekEvents = await this.getEventsForWeek();
          await this.sendResponse(event, {
            status: 'success',
            data: { events: weekEvents }
          });
          break;

        case 'update_event':
          const updatedEvent = await this.updateEvent(params.eventId, params.data);
          await this.sendResponse(event, {
            status: 'success',
            data: { event: updatedEvent }
          });
          break;

        case 'delete_event':
          await this.deleteEvent(params.eventId);
          await this.sendResponse(event, {
            status: 'success',
            data: { success: true }
          });
          break;

        case 'sync_calendar':
          await this.syncCalendar();
          await this.sendResponse(event, {
            status: 'success',
            data: { success: true }
          });
          break;

        case 'analyze_schedule':
          const analysis = await this.analyzeSchedule(params);
          await this.sendResponse(event, {
            status: 'success',
            data: { analysis }
          });
          break;

        case 'get_stats':
          const stats = await this.getStats();
          await this.sendResponse(event, {
            status: 'success',
            data: { stats }
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
   * イベントを作成
   */
  async createEvent(eventData) {
    const event = {
      summary: eventData.title || eventData.summary || 'No Title',
      description: eventData.description || '',
      location: eventData.location || '',
      start: {
        dateTime: eventData.start || new Date().toISOString(),
        timeZone: 'Asia/Tokyo'
      },
      end: {
        dateTime: eventData.end || new Date(Date.now() + 3600000).toISOString(),
        timeZone: 'Asia/Tokyo'
      },
      reminders: {
        useDefault: false,
        overrides: eventData.reminders || [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 15 }
        ]
      }
    };

    const response = await this.calendar.events.insert({
      calendarId: 'primary',
      requestBody: event
    });

    return response.data;
  }

  /**
   * イベント一覧を取得
   */
  async getEvents(params = {}) {
    const now = new Date();

    const response = await this.calendar.events.list({
      calendarId: 'primary',
      timeMin: params.timeMin || now.toISOString(),
      timeMax: params.timeMax,
      maxResults: params.maxResults || 50,
      singleEvents: true,
      orderBy: 'startTime'
    });

    return response.data.items || [];
  }

  /**
   * 今週のイベントを取得
   */
  async getEventsForWeek() {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    endOfWeek.setHours(23, 59, 59, 999);

    return this.getEvents({
      timeMin: startOfWeek.toISOString(),
      timeMax: endOfWeek.toISOString()
    });
  }

  /**
   * イベントを更新
   */
  async updateEvent(eventId, eventData) {
    const response = await this.calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: eventData
    });

    return response.data;
  }

  /**
   * イベントを削除
   */
  async deleteEvent(eventId) {
    await this.calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId
    });
  }

  /**
   * カレンダーを同期
   */
  async syncCalendar() {
    console.log('🔄 Syncing calendar...');

    try {
      // イベントを取得
      const events = await this.getEvents();

      // キャッシュを更新
      this.eventCache.clear();
      for (const event of events) {
        if (event.id) {
          this.eventCache.set(event.id, event);
        }
      }

      // 統計を更新
      const stats = this.calculateStats(events);

      // イベントを発行
      await this.eventBus.send({
        type: 'event',
        source: 'google-calendar',
        target: '*',
        payload: {
          eventType: 'calendar_sync_completed',
          stats
        }
      });

      console.log('✓ Calendar sync completed');
      return stats;
    } catch (error) {
      console.error('Error syncing calendar:', error.message);
      throw error;
    }
  }

  /**
   * スケジュールを分析
   */
  async analyzeSchedule(params = {}) {
    const days = params.days || 7;

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - days);

    const events = await this.getEvents({
      timeMin: startDate.toISOString(),
      timeMax: now.toISOString()
    });

    const analysis = {
      totalEvents: events.length,
      meetingEvents: 0,
      avgDailyHours: 0,
      busyHours: 0,
      eventTypes: {},
      busiestDay: null,
      quietestDay: null
    };

    const dailyEvents = {};

    for (const event of events) {
      if (event.start && event.end) {
        const start = new Date(event.start.dateTime || event.start.date);
        const end = new Date(event.end.dateTime || event.end.date);
        const duration = (end - start) / 1000 / 3600; // 時間

        analysis.busyHours += duration;

        // 曜日ごとの集計
        const dayKey = start.toISOString().split('T')[0];
        dailyEvents[dayKey] = (dailyEvents[dayKey] || 0) + 1;

        // 会議イベント
        if (event.summary && event.summary.includes('会議')) {
          analysis.meetingEvents++;
        }

        // イベントタイプ
        const eventType = this.classifyEventType(event);
        analysis.eventTypes[eventType] = (analysis.eventTypes[eventType] || 0) + 1;
      }
    }

    // 平均一日あたりの時間
    analysis.avgDailyHours = analysis.busyHours / days;

    // 最も忙しい日
    const daysArray = Object.entries(dailyEvents);
    if (daysArray.length > 0) {
      daysArray.sort((a, b) => b[1] - a[1]);
      analysis.busiestDay = daysArray[0][0];
      analysis.quietestDay = daysArray[daysArray.length - 1][0];
    }

    return analysis;
  }

  /**
   * イベントタイプを分類
   */
  classifyEventType(event) {
    const summary = (event.summary || '').toLowerCase();
    const description = (event.description || '').toLowerCase();

    if (summary.includes('会議') || summary.includes('meeting')) {
      return 'meeting';
    }
    if (summary.includes('学習') || summary.includes('勉強') || summary.includes('study')) {
      return 'study';
    }
    if (summary.includes('仕事') || summary.includes('work')) {
      return 'work';
    }
    if (summary.includes('休憩') || summary.includes('break')) {
      return 'break';
    }

    return 'other';
  }

  /**
   * 統計を計算
   */
  calculateStats(events) {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const stats = {
      totalEvents: events.length,
      eventsToday: 0,
      eventsThisWeek: 0,
      eventsThisMonth: 0,
      busyHours: 0,
      meetingCount: 0
    };

    for (const event of events) {
      if (!event.start) continue;

      const eventDate = new Date(event.start.dateTime || event.start.date);

      if (eventDate >= todayStart && eventDate <= todayEnd) {
        stats.eventsToday++;
      }

      if (eventDate >= weekStart) {
        stats.eventsThisWeek++;
      }

      if (eventDate >= monthStart) {
        stats.eventsThisMonth++;
      }

      // 会議カウント
      if (event.summary && event.summary.includes('会議')) {
        stats.meetingCount++;
      }

      // 稼働時間の計算
      if (event.start && event.end) {
        const start = new Date(event.start.dateTime);
        const end = new Date(event.end.dateTime);
        stats.busyHours += (end - start) / 1000 / 3600;
      }
    }

    return stats;
  }

  /**
   * 統計を取得
   */
  async getStats() {
    const events = await this.getEvents();
    const stats = this.calculateStats(events);

    return {
      ...stats,
      config: this.config,
      initialized: this.initialized,
      syncTimerActive: this.syncTimer !== null
    };
  }

  /**
   * 定期同期を開始
   */
  startPeriodicSync() {
    if (this.syncTimer) {
      return;
    }

    const intervalMs = this.config.syncInterval * 1000;

    this.syncTimer = setInterval(() => {
      this.syncCalendar().catch(err => {
        console.error('Error in periodic sync:', err.message);
      });
    }, intervalMs);

    console.log(`✓ Periodic sync started (interval: ${this.config.syncInterval}s)`);
  }

  /**
   * レスポンス送信
   */
  async sendResponse(request, payload) {
    await this.eventBus.send({
      type: 'response',
      source: 'google-calendar',
      target: request.source,
      correlationId: request.id,
      payload
    });
  }

  /**
   * イベントIDを生成
   */
  generateEventId() {
    return 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * シャットダウン
   */
  async shutdown() {
    console.log('Shutting down Google Calendar Manager...');

    // 定期同期を停止
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    // 全ての購読を解除
    this.eventBus.unsubscribeAll('google-calendar');

    // シャットダウンイベントを発行
    await this.eventBus.send({
      type: 'event',
      source: 'google-calendar',
      target: '*',
      payload: {
        eventType: 'skill_shutdown',
        skillId: 'google-calendar'
      }
    });

    this.initialized = false;
    console.log('✓ Google Calendar Manager shut down');
  }
}

module.exports = {
  GoogleCalendarManager
};

// テスト用：メイン実行
if (require.main === module) {
  const { SkillEventBus } = require(path.join(__dirname, '../../lib/skill-event-bus'));

  console.log('Testing Google Calendar Integration...\n');

  const eventBus = new SkillEventBus();

  // Google Calendar Manager初期化
  const manager = new GoogleCalendarManager(eventBus, {
    enabled: true,
    autoSync: true,
    syncInterval: 60
  });

  manager.initialize().then(() => {
    console.log('\n=== Testing Calendar Functions ===\n');

    // テスト：イベント作成
    manager.createEvent({
      title: 'テスト会議',
      start: new Date(Date.now() + 3600000).toISOString(),
      end: new Date(Date.now() + 7200000).toISOString(),
      description: 'テスト用の会議です',
      location: '会議室A'
    }).then(event => {
      console.log('Event created:', event.id, event.summary);
    });

    // テスト：イベント一覧
    setTimeout(async () => {
      const events = await manager.getEvents();
      console.log('\n--- Events ---\n');
      console.log(`Total events: ${events.length}`);
      events.forEach(event => {
        console.log(`- ${event.summary || 'No Title'} (${event.start?.dateTime || event.start?.date})`);
      });
    }, 1000);

    // テスト：スケジュール分析
    setTimeout(async () => {
      const analysis = await manager.analyzeSchedule({ days: 7 });
      console.log('\n--- Schedule Analysis ---\n');
      console.log(JSON.stringify(analysis, null, 2));
    }, 2000);

    // 統計表示
    setTimeout(async () => {
      const stats = await manager.getStats();
      console.log('\n--- Statistics ---\n');
      console.log(JSON.stringify(stats, null, 2));
    }, 3000);

  }).catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}
