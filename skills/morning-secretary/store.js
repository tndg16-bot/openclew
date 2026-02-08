/**
 * Morning Secretary Data Store
 * 朝のサマリーデータの永続化と管理
 */

const fs = require('fs').promises;
const path = require('path');

class MorningStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.dataFile = path.join(baseDir, 'morning-reports.json');
    this.configFile = path.join(baseDir, 'config.json');
  }

  /**
   * 設定を読み込む
   */
  async loadConfig() {
    try {
      const data = await fs.readFile(this.configFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // デフォルト設定を返す
      return {
        schedule: {
          enabled: true,
          cron: "0 7 * * *",
          timezone: "Asia/Tokyo"
        },
        gmail: {
          maxResults: 10,
          summarizeLength: 3,
          excludeLabels: ["Spam", "Promotions"]
        },
        calendar: {
          includeAllDay: true
        },
        notifications: {
          channels: ["discord"],
          voice: false
        }
      };
    }
  }

  /**
   * 設定を保存
   */
  async saveConfig(config) {
    await fs.writeFile(this.configFile, JSON.stringify(config, null, 2), 'utf8');
  }

  /**
   * レポート履歴を読み込む
   */
  async loadReports() {
    try {
      const data = await fs.readFile(this.dataFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return { reports: {} };
    }
  }

  /**
   * レポートを保存
   */
  async saveReport(date, report) {
    const data = await this.loadReports();
    data.reports[date] = {
      ...report,
      timestamp: new Date().toISOString()
    };
    await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2), 'utf8');
  }

  /**
   * 特定日のレポートを取得
   */
  async getReport(date) {
    const data = await this.loadReports();
    return data.reports[date] || null;
  }

  /**
   * 直近のレポートを取得
   */
  async getRecentReports(days = 7) {
    const data = await this.loadReports();
    const dates = Object.keys(data.reports).sort().reverse().slice(0, days);
    return dates.map(date => ({ date, ...data.reports[date] }));
  }

  /**
   * メール処理履歴を記録
   */
  async recordEmailProcessing(emailId, action) {
    const data = await this.loadReports();
    const today = new Date().toISOString().split('T')[0];
    
    if (!data.emailHistory) data.emailHistory = {};
    if (!data.emailHistory[today]) data.emailHistory[today] = [];
    
    data.emailHistory[today].push({
      emailId,
      action,
      timestamp: new Date().toISOString()
    });
    
    await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2), 'utf8');
  }
}

module.exports = MorningStore;
