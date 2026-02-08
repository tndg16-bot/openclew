/**
 * 作業ログ管理ユーティリティ
 * 全スキルから統一的にログ出力・管理する
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class WorkLogger {
  constructor(config) {
    this.config = config;
    this.logDir = config.logDir || './logs/work';
    this.maxLogSize = config.maxLogSize || 10;
    this.retentionDays = config.retentionDays || 90;
    this.errorLogPath = path.join(this.logDir, 'errors.json');
    this.activityLogPath = path.join(this.logDir, 'activity.json');
  }

  /**
   * 初期化：ディレクトリ作成と既存ログのアーカイブ
   */
  async init() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      
      // エラーログ初期化（空なら作成）
      await this.loadErrorLog();
      
      console.log(`📋 Work Logger initialized: ${this.logDir}`);
      console.log(`   最大ログ保存数: ${this.maxLogSize}`);
      console.log(`   ログ保持期間: ${this.retentionDays}日`);
    } catch (e) {
      console.error('Failed to initialize WorkLogger:', e.message);
    }
  }

  /**
   * エラーログを記録
   */
  async logError(error, context = {}) {
    const errors = await this.loadErrorLog();
    const errorEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      level: error.level || 'ERROR',
      category: error.category || 'unknown',
      message: error.message || String(error),
      stack: error.stack || new Error().stack,
      skill: error.skill || 'unknown',
      context: JSON.stringify(context)
    };
    
    errors.unshift(errorEntry);
    await this.saveErrorLog(errors);
    
    console.error(`❌ Error logged: [${errorEntry.category}] ${errorEntry.message}`);
  }

  /**
   * アクティビティを記録
   */
  async logActivity(activity) {
    const activities = await this.loadActivityLog();
    const activityEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: activity.type || 'action',
      skill: activity.skill || 'unknown',
      action: activity.action || 'unknown',
      details: activity.details || '',
      duration: activity.duration || 0,
      success: activity.success !== false
    };
    
    activities.unshift(activityEntry);
    await this.saveActivityLog(activities);
    
    console.log(`📝 Activity logged: [${activityEntry.skill}] ${activityEntry.action}`);
  }

  /**
   * 直近のログを取得
   */
  async getRecentLogs(type = 'all', limit = 50) {
    const errors = await this.loadErrorLog();
    const activities = await this.loadActivityLog();
    
    let result = [];
    
    if (type === 'all' || type === 'errors') {
      result = result.concat(errors.map(e => ({
        ...e,
        source: 'error'
      })));
    }
    
    if (type === 'all' || type === 'activities') {
      result = result.concat(activities.map(a => ({
        ...a,
        source: 'activity'
      })));
    }
    
    return result.slice(0, limit);
  }

  /**
   * エラーログのロード
   */
  async loadErrorLog() {
    try {
      const data = await fs.readFile(this.errorLogPath, 'utf8');
      const errors = JSON.parse(data);
      
      // 古いログを削除
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - this.retentionDays);
      const errors = errors.filter(e => {
        const errorDate = new Date(e.timestamp);
        return errorDate > cutoff;
      });
      
      return errors;
    } catch (e) {
      return [];
    }
  }

  /**
   * アクティビティログのロード
   */
  async loadActivityLog() {
    try {
      const data = await fs.readFile(this.activityLogPath, 'utf8');
      const activities = JSON.parse(data);
      
      // 古いログを削除
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - this.retentionDays);
      const activities = activities.filter(a => {
        const activityDate = new Date(a.timestamp);
        return activityDate > cutoff;
      });
      
      return activities;
    } catch (e) {
      return [];
    }
  }

  /**
   * エラーログの保存
   */
  async saveErrorLog(errors) {
    await fs.mkdir(this.logDir, { recursive: true });
    
    // 最大数を超える古いログを削除
    if (errors.length > this.maxLogSize) {
      errors = errors.slice(0, this.maxLogSize);
    }
    
    await fs.writeFile(this.errorLogPath, JSON.stringify(errors, null, 2), 'utf8');
  }

  /**
   * アクティビティログの保存
   */
  async saveActivityLog(activities) {
    await fs.mkdir(this.logDir, { recursive: true });
    
    if (activities.length > this.maxLogSize) {
      activities = activities.slice(0, this.maxLogSize);
    }
    
    await fs.writeFile(this.activityLogPath, JSON.stringify(activities, null, 2), 'utf8');
  }

  /**
   * ユニークID生成
   */
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * ログレポートを生成
   */
  async generateReport() {
    const errors = await this.loadErrorLog();
    const activities = await this.loadActivityLog();
    
    const last24h = errors.filter(e => {
      const errorTime = new Date(e.timestamp);
      const now = new Date();
      const hoursDiff = (now - errorTime) / (1000 * 60 * 60);
      return hoursDiff < 24;
    }).length;
    
    const last24hActivities = activities.filter(a => {
      const activityTime = new Date(a.timestamp);
      const now = new Date();
      const hoursDiff = (now - activityTime) / (1000 * 60 * 60);
      return hoursDiff < 24;
    }).length;
    
    let report = `📋 作業ログレポート\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    report += `📊 サマリー\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `エラー数（過去24時間）: ${last24h}件\n`;
    report += `アクティビティ数（過去24時間）: ${last24hActivities}件\n\n`;
    
    // エラーのカテゴリ別集計
    const errorCategories = {};
    errors.filter(e => {
      const errorTime = new Date(e.timestamp);
      const now = new Date();
      const hoursDiff = (now - errorTime) / (1000 * 60 * 60);
      return hoursDiff < 24;
    }).forEach(e => {
      errorCategories[e.category] = (errorCategories[e.category] || 0) + 1;
    });
    
    if (Object.keys(errorCategories).length > 0) {
      report += `🔴 エラーの傾向\n`;
      report += `━━━━━━━━━━━━━━━━━━━━\n`;
      
      const sorted = Object.entries(errorCategories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      sorted.forEach(([cat, count]) => {
        report += `${this.getCategoryEmoji(cat)} ${cat}: ${count}件\n`;
      });
      report += '\n';
    }
    
    report += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    // 最近のエラー詳細（直近5件）
    const recentErrors = errors.slice(0, 5);
    if (recentErrors.length > 0) {
      report += `🚨 直近のエラー（直近5件）\n`;
      report += `━━━━━━━━━━━━━━━━━━━━━\n`;
      
      recentErrors.forEach((e, i) => {
        report += `#${i + 1} [${e.timestamp.substring(0, 16)}]\n`;
        report += `  カテゴリ: ${e.category}\n`;
        report += ` スキル: ${e.skill}\n`;
        report += ` メッセージ: ${e.message}\n`;
        report += ` スタック: ${e.stack ? 'あり' : 'なし'}\n\n`;
        report += `─────────────────────────────────────────\n`;
      });
    }
    
    return report;
  }

  /**
   * カテゴリに対応する絵文字
   */
  getCategoryEmoji(category) {
    const map = {
      'discord': '📡',
      'api': '🌐',
      'file': '📄',
      'git': '📂',
      'network': '🌐',
      'database': '💾',
      'security': '🔒'
    };
    return map[category] || '❓';
  }
}

module.exports = WorkLogger;
