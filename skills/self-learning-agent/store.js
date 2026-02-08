/**
 * Self-Learning Agent Store
 * 学習データの永続化と管理
 */

const fs = require('fs').promises;
const path = require('path');

class LearningStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.patternsFile = path.join(baseDir, 'patterns.json');
    this.profileFile = path.join(baseDir, 'profile.json');
    this.contextFile = path.join(baseDir, 'context.json');
  }

  // パターン読み込み
  async loadPatterns() {
    try {
      const data = await fs.readFile(this.patternsFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return { patterns: [] };
    }
  }

  // パターン保存
  async savePattern(pattern) {
    const data = await this.loadPatterns();
    pattern.id = pattern.id || `pattern-${Date.now()}`;
    pattern.createdAt = new Date().toISOString();
    
    const existing = data.patterns.findIndex(p => p.name === pattern.name);
    if (existing >= 0) {
      data.patterns[existing] = { ...data.patterns[existing], ...pattern };
    } else {
      data.patterns.push(pattern);
    }
    
    await fs.writeFile(this.patternsFile, JSON.stringify(data, null, 2));
    return pattern;
  }

  // ユーザープロフィール読み込み
  async loadProfile() {
    try {
      const data = await fs.readFile(this.profileFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return {
        preferences: {
          communicationStyle: 'balanced',
          notificationFrequency: 'medium'
        },
        learnedFacts: []
      };
    }
  }

  // プロフィール更新
  async updateProfile(updates) {
    const profile = await this.loadProfile();
    Object.assign(profile, updates);
    profile.updatedAt = new Date().toISOString();
    await fs.writeFile(this.profileFile, JSON.stringify(profile, null, 2));
    return profile;
  }

  // 新しい事実を学習
  async learnFact(fact, category, confidence = 0.8) {
    const profile = await this.loadProfile();
    profile.learnedFacts.push({
      fact,
      category,
      confidence,
      learnedAt: new Date().toISOString()
    });
    await this.updateProfile(profile);
  }

  // コンテキスト読み込み
  async loadContext() {
    try {
      const data = await fs.readFile(this.contextFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return {
        activeTopics: [],
        pendingTasks: [],
        lastConversation: null
      };
    }
  }

  // コンテキスト更新
  async updateContext(updates) {
    const context = await this.loadContext();
    Object.assign(context, updates);
    await fs.writeFile(this.contextFile, JSON.stringify(context, null, 2));
    return context;
  }
}

module.exports = LearningStore;
