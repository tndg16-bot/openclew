/**
 * Soul Updater - Autonomous SOUL.md Improvement System
 * Reads reflection results and updates SOUL.md based on learned insights
 */

const fs = require('fs').promises;
const path = require('path');

const BASE_DIR = __dirname;
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
const SOUL_PATH = path.join(BASE_DIR, '../self-learning-agent/SOUL.md');
const LONG_TERM_PATH = path.join(BASE_DIR, '../self-learning-agent/long-term.json');
const BACKUP_DIR = path.join(BASE_DIR, 'backups');

class SoulUpdater {
  constructor() {
    this.config = null;
    this.soulContent = null;
    this.longTermMemory = null;
  }

  async initialize() {
    console.log('Soul Updater initializing...');
    
    this.config = await this.loadConfig();
    await this.ensureBackupDir();
    
    console.log('Soul Updater initialized successfully');
  }

  async loadConfig() {
    try {
      const data = await fs.readFile(CONFIG_PATH, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.warn('Using default config');
      return {
        updateInterval: 'daily',
        updateTime: '03:00',
        maxChangesPerUpdate: 5,
        backupRetentionCount: 10,
        enabled: true,
        improvementThreshold: 0.6
      };
    }
  }

  async ensureBackupDir() {
    try {
      await fs.mkdir(BACKUP_DIR, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }

  async readSoul() {
    try {
      this.soulContent = await fs.readFile(SOUL_PATH, 'utf8');
      return this.soulContent;
    } catch (err) {
      if (err.code === 'ENOENT') {
        return this.createDefaultSoul();
      }
      throw err;
    }
  }

  async createDefaultSoul() {
    const defaultSoul = `# SOUL.md - Self-Learning Agent Core Instructions

## Purpose
This document defines the core behavior, guidelines, and learned lessons for the Self-Learning Agent.

## Core Instructions

### Primary Mission
- Learn from user interactions and behavior patterns
- Predict user needs based on historical data
- Continuously improve prediction accuracy

## Lessons Learned

### Success Patterns
(Updated automatically)

### Error Patterns to Avoid
(Updated automatically)

## Self-Improvement History

| Date | Improvement | Result |
|------|-------------|--------|
| ${new Date().toISOString().split('T')[0]} | Initial SOUL.md created | Baseline established |

---
*Last updated: ${new Date().toISOString().split('T')[0]}*
`;
    await fs.writeFile(SOUL_PATH, defaultSoul, 'utf8');
    this.soulContent = defaultSoul;
    return defaultSoul;
  }

  async readLongTermMemory() {
    try {
      const data = await fs.readFile(LONG_TERM_PATH, 'utf8');
      this.longTermMemory = JSON.parse(data);
      return this.longTermMemory;
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.longTermMemory = {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          insights: [],
          behaviorAdjustments: [],
          errorPatterns: [],
          successfulPatterns: [],
          selfImprovementHistory: []
        };
        return this.longTermMemory;
      }
      throw err;
    }
  }

  async analyzeReflectionResults() {
    const memory = await this.readLongTermMemory();
    const suggestions = [];
    
    if (memory.insights && memory.insights.length > 0) {
      const recentInsights = memory.insights
        .filter(i => {
          const insightDate = new Date(i.timestamp);
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          return insightDate > weekAgo;
        })
        .slice(0, this.config.maxChangesPerUpdate);
      
      for (const insight of recentInsights) {
        suggestions.push({
          type: 'insight',
          content: insight.description || insight.pattern,
          confidence: insight.confidence || 0.5,
          action: 'add_to_lessons'
        });
      }
    }
    
    if (memory.errorPatterns && memory.errorPatterns.length > 0) {
      const recentErrors = memory.errorPatterns
        .filter(e => e.occurrences >= 3)
        .slice(0, 3);
      
      for (const error of recentErrors) {
        suggestions.push({
          type: 'error_pattern',
          content: error.description || error.pattern,
          occurrences: error.occurrences,
          action: 'add_to_avoid'
        });
      }
    }
    
    if (memory.successfulPatterns && memory.successfulPatterns.length > 0) {
      const topPatterns = memory.successfulPatterns
        .filter(p => p.successRate >= this.config.improvementThreshold)
        .slice(0, 3);
      
      for (const pattern of topPatterns) {
        suggestions.push({
          type: 'success_pattern',
          content: pattern.description || pattern.pattern,
          successRate: pattern.successRate,
          action: 'add_to_success'
        });
      }
    }
    
    return suggestions;
  }

  generateImprovementSuggestions(suggestions) {
    const improvements = [];
    
    for (const suggestion of suggestions) {
      switch (suggestion.type) {
        case 'insight':
          improvements.push({
            section: 'Lessons Learned',
            addition: `- **${new Date().toLocaleDateString()}**: ${suggestion.content} (confidence: ${suggestion.confidence})`,
            reason: 'New behavioral insight discovered'
          });
          break;
          
        case 'error_pattern':
          improvements.push({
            section: 'Error Patterns to Avoid',
            addition: `- ${suggestion.content} (${suggestion.occurrences} occurrences)`,
            reason: 'Recurring error pattern detected'
          });
          break;
          
        case 'success_pattern':
          improvements.push({
            section: 'Success Patterns',
            addition: `- ${suggestion.content} (${Math.round(suggestion.successRate * 100)}% success rate)`,
            reason: 'High-success pattern identified'
          });
          break;
      }
    }
    
    return improvements.slice(0, this.config.maxChangesPerUpdate);
  }

  async backupSoul() {
    if (!this.config.autoBackup) return;
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `SOUL-${timestamp}.md`);
    
    try {
      await fs.copyFile(SOUL_PATH, backupPath);
      await this.cleanupOldBackups();
      console.log(`Backup created: ${backupPath}`);
    } catch (err) {
      console.error('Backup failed:', err.message);
    }
  }

  async cleanupOldBackups() {
    try {
      const files = await fs.readdir(BACKUP_DIR);
      const backups = files
        .filter(f => f.startsWith('SOUL-') && f.endsWith('.md'))
        .sort()
        .reverse();
      
      while (backups.length > this.config.backupRetentionCount) {
        const oldBackup = backups.pop();
        await fs.unlink(path.join(BACKUP_DIR, oldBackup));
        console.log(`Removed old backup: ${oldBackup}`);
      }
    } catch (err) {
      console.error('Cleanup failed:', err.message);
    }
  }

  async updateSoul(improvements) {
    if (improvements.length === 0) {
      console.log('No improvements to apply');
      return false;
    }
    
    await this.backupSoul();
    
    let content = await this.readSoul();
    
    for (const improvement of improvements) {
      content = this.insertImprovement(content, improvement);
    }
    
    content = this.updateTimestamp(content);
    
    await fs.writeFile(SOUL_PATH, content, 'utf8');
    this.soulContent = content;
    
    await this.recordImprovement(improvements);
    
    console.log(`Applied ${improvements.length} improvements to SOUL.md`);
    return true;
  }

  insertImprovement(content, improvement) {
    const sectionMarker = `### ${improvement.section}`;
    const sectionIndex = content.indexOf(sectionMarker);
    
    if (sectionIndex === -1) {
      const newSection = `\n### ${improvement.section}\n${improvement.addition}\n`;
      const historyIndex = content.indexOf('## Self-Improvement History');
      if (historyIndex !== -1) {
        content = content.slice(0, historyIndex) + newSection + content.slice(historyIndex);
      } else {
        content += newSection;
      }
    } else {
      const nextSectionIndex = content.indexOf('\n###', sectionIndex + sectionMarker.length);
      const insertPosition = nextSectionIndex !== -1 ? nextSectionIndex : content.indexOf('\n---');
      
      if (insertPosition !== -1) {
        content = content.slice(0, insertPosition) + '\n' + improvement.addition + content.slice(insertPosition);
      }
    }
    
    return content;
  }

  updateTimestamp(content) {
    const today = new Date().toISOString().split('T')[0];
    const lastUpdatedRegex = /\*Last updated:.*\*/;
    return content.replace(lastUpdatedRegex, `*Last updated: ${today}*`);
  }

  async recordImprovement(improvements) {
    const memory = await this.readLongTermMemory();
    
    memory.selfImprovementHistory.push({
      timestamp: new Date().toISOString(),
      changesCount: improvements.length,
      changes: improvements.map(i => ({
        section: i.section,
        reason: i.reason
      }))
    });
    
    memory.lastUpdated = new Date().toISOString();
    
    await fs.writeFile(LONG_TERM_PATH, JSON.stringify(memory, null, 2), 'utf8');
  }

  async run() {
    if (!this.config.enabled) {
      console.log('Soul Updater is disabled');
      return;
    }
    
    console.log('Running Soul Updater...');
    
    const suggestions = await this.analyzeReflectionResults();
    const improvements = this.generateImprovementSuggestions(suggestions);
    
    if (improvements.length > 0) {
      await this.updateSoul(improvements);
    }
    
    console.log('Soul Updater completed');
    return improvements;
  }

  getSoulPath() {
    return SOUL_PATH;
  }

  getLongTermMemoryPath() {
    return LONG_TERM_PATH;
  }
}

module.exports = {
  SoulUpdater,
  SOUL_PATH,
  LONG_TERM_PATH,
  CONFIG_PATH
};

if (require.main === module) {
  const updater = new SoulUpdater();
  updater.initialize().then(() => {
    return updater.run();
  }).then((improvements) => {
    if (improvements && improvements.length > 0) {
      console.log(`\nApplied ${improvements.length} improvements:`);
      improvements.forEach(i => console.log(`  - ${i.section}: ${i.reason}`));
    } else {
      console.log('\nNo improvements needed');
    }
  }).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
