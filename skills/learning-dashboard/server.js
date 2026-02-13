/**
 * 学習データ可視化ダッシュボード (Learning Data Visualization Dashboard)
 * 学習データを可視化するWebサーバー
 */

const http = require('http');
const { ContextSharingManager, ContextTypes } = require('../../lib/context-sharing');
const fs = require('fs').promises;
const path = require('path');

const DASHBOARD_PORT = process.env.DASHBOARD_PORT || 3000;
const DATA_REFRESH_INTERVAL = 30000; // 30秒ごと更新

/**
 * HTMLテンプレート
 */
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Learning Data Dashboard | OpenClaw</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #0f0 0);
      color: #ffffff;
      min-height: 100vh;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      margin-bottom: 20px;
      padding: 20px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 8px;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 24px;
      color: #ffffff;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }
    .stat-card {
      background: rgba(255, 255, 255, 0.1);
      padding: 20px;
      border-radius: 8px;
    }
    .stat-card h3 {
      margin: 0 0 10px 0;
      font-size: 16px;
      color: #666;
    }
    .stat-value {
      font-size: 32px;
      font-weight: bold;
      color: #1a1a2e;
      margin-bottom: 5px;
    }
    .stat-label {
      color: #666;
      margin-bottom: 5px;
    }
    .chart-container {
      background: white;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .chart-container h2 {
      margin: 0 0 15px 0;
      color: #333;
    }
    .patterns-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .pattern-item {
      background: rgba(255, 255, 255, 0.05);
      padding: 10px;
      margin-bottom: 5px;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .pattern-item:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .pattern-meta {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
      font-size: 14px;
    }
    .pattern-confidence {
      padding: 4px 8px;
      border-radius: 4px;
      font-weight: bold;
      display: inline-block;
    }
    .confidence-high { background: #4CAF50; color: white; }
    .confidence-medium { background: #FFA726; color: white; }
    .confidence-low { background: #FFC107; color: white; }
    .learning-log {
      background: rgba(255, 255, 255, 0.95);
      padding: 20px;
      border-radius: 8px;
      max-height: 400px;
      overflow-y: auto;
    }
    .log-entry {
      padding: 10px;
      border-bottom: 1px solid #eee;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 12px;
    }
    .log-timestamp {
      color: #999;
      margin-bottom: 5px;
      font-size: 12px;
    }
    .log-type {
      display: inline-block;
      padding: 2px 6px;
      background: #e3f2fd;
      color: white;
      border-radius: 3px;
      font-size: 12px;
      margin-right: 10px;
    }
    .loading {
      text-align: center;
      padding: 40px;
      font-size: 18px;
      color: #666;
    }
    .loading-spinner {
      display: inline-block;
      width: 40px;
      height: 40px;
      border: 4px solid #f3f2fd;
      border-top-color: #f3f2fd;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧠 Learning Data Dashboard</h1>
      <p>OpenClaw AIエージェントの学習データを可視化します</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <h3>Total Patterns</h3>
        <div class="stat-value" id="totalPatterns">-</div>
        <div class="stat-label">検出されたパターン</div>
      </div>
      <div class="stat-card">
        <h3>Active Patterns</h3>
        <div class="stat-value" id="activePatterns">-</div>
        <div class="stat-label">アクティブなパターン</div>
      </div>
      <div class="stat-card">
        <h3>Avg Confidence</h3>
        <div class="stat-value" id="avgConfidence">-</div>
        <div class="stat-label">平均信頼度</div>
      </div>
      <div class="stat-card">
        <h3>Learning Entries</h3>
        <div class="stat-value" id="learningEntries">-</div>
        <div class="stat-label">学習ログエントリ</div>
      </div>
      <div class="stat-card">
        <h3>Uptime</h3>
        <div class="stat-value" id="uptime">-</div>
        <div class="stat-label">稼働時間</div>
      </div>
    </div>

    <div class="chart-container">
      <h2>📊 Behavior Patterns</h2>
      <div style="height: 300px;">
        <canvas id="behaviorChart"></canvas>
      </div>
    </div>

    <div class="chart-container">
      <h2>📈 Activity by Day of Week</h2>
      <div style="height: 300px;">
        <canvas id="dayOfWeekChart"></canvas>
      </div>
    </div>

    <div class="chart-container">
      <h2>📊 Confidence Distribution</h2>
      <div style="height: 300px;">
        <canvas id="confidenceChart"></canvas>
      </div>
    </div>

    <div class="chart-container">
      <h2>📝 Top 10 Patterns</h2>
      <div class="patterns-list" id="topPatterns">
      <div class="loading">
        <div class="loading-spinner"></div>
        <p>Loading patterns...</p>
      </div>
    </div>

    <div class="learning-log">
      <h2>📚 Learning Log</h2>
      <div class="learning-log" id="learningLog">
        <div class="loading">
          <div class="loading-spinner"></div>
          <p>Loading learning log...</p>
        </div>
      </div>

    <script>
      // WebSocket接続
      let ws;
      let charts = {};

      // ページ読み込み
      window.addEventListener('DOMContentLoaded', () => {
        loadData();
        connectWebSocket();
      });

      // データ読み込み
      async function loadData() {
        updateStats();
        loadPatterns();
        loadLearningLog();
        loadCharts();
      }

      // WebSocket接続
      function connectWebSocket() {
        const wsUrl = 'ws://' + window.location.host.replace(/:.*/, '') + ':' + DASHBOARD_PORT;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('✓ Connected to WebSocket');
        loadData();
        setInterval(refreshData, DATA_REFRESH_INTERVAL);
        };

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected. Reconnecting...');
          setTimeout(connectWebSocket, 5000);
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setTimeout(connectWebSocket, 5000);
        };
      }

      function handleWebSocketMessage(data) {
        if (data.type === 'refresh') {
          loadData();
        }
      }

      // データ更新
      function refreshData() {
        loadPatterns();
        loadLearningLog();
        updateStats();
      }

      // APIリクエスト
      async function apiCall(endpoint) {
        try {
          const response = await fetch('http://localhost:' + DASHBOARD_PORT + endpoint);
          return await response.json();
        } catch (error) {
          console.error('API call failed:', error);
          return null;
        }
      }

      // 統計更新
      async function updateStats() {
        const stats = await apiCall('/api/stats');
        if (stats) {
          updateStat('totalPatterns', stats.totalPatterns || 0);
          updateStat('activePatterns', stats.activePatterns || 0);
          updateStat('avgConfidence', stats.avgConfidence ? (stats.avgConfidence * 100).toFixed(1) + '%' : '-');
          updateStat('learningEntries', stats.learningEntries || 0);
          updateStat('uptime', formatUptime(stats.uptime || 0));
        }
      }

      function updateStat(id, value) {
        const el = document.getElementById(id);
        if (el) {
          el.textContent = value;
        el.style.opacity = '0';
          setTimeout(() => {
            el.style.opacity = '1';
          el.style.transition = 'opacity 0.5s';
          setTimeout(() => {
            el.style.opacity = '1';
          }, 500);
          }, 50);
        }
      }

      function formatUptime(seconds) {
        if (seconds < 60) return seconds + '秒';
        if (seconds < 3600) return Math.floor(seconds / 60) + '分' + (seconds % 60) + '秒';
        return Math.floor(seconds / 3600) + '時間' + Math.floor((seconds % 3600) / 60) + '分';
      }

      // パターン読み込み
      async function loadPatterns() {
        const patterns = await apiCall('/api/patterns');
        if (!patterns || !patterns.patterns) {
          return;
        }

        const list = document.getElementById('topPatterns');
        list.innerHTML = '';

        for (const pattern of patterns.patterns) {
          const confidenceClass = pattern.confidence >= 0.7 ? 'confidence-high' :
                                pattern.confidence >= 0.5 ? 'confidence-medium' : 'confidence-low';
          const confidenceLabel = pattern.confidence >= 0.7 ? '高' :
                                 pattern.confidence >= 0.5 ? '中' : '低';

          const item = document.createElement('div');
          item.className = 'pattern-item';
          item.innerHTML =
            '<div class="pattern-meta">' +
              '<span class="pattern-confidence ' + confidenceClass + '">' + confidenceLabel + '</span>' +
              '<div>' +
                '<strong>' + (pattern.data.taskType || pattern.type) + '</strong>' +
                '<span style="color: #666; margin-left: 10px;">' + pattern.frequency + '回</span>' +
              '</div>' +
            '</div>';
          item.onclick = () => showPatternDetail(pattern.id);

          list.appendChild(item);
        }
      }

      // 学習ログ読み込み
      async function loadLearningLog() {
        const log = await apiCall('/api/learning-log');
        if (!log) return;

        const container = document.getElementById('learningLog');
        container.innerHTML = '';

        for (const entry of log) {
          const typeLabels = {
            'periodic_analysis': '定期分析',
            'pattern_learning': 'パターン学習',
            'prediction_feedback': '予測フィードバック',
            'system': 'システム'
          };

          const item = document.createElement('div');
          item.className = 'log-entry';
          item.innerHTML =
            '<div class="log-timestamp">' + new Date(entry.timestamp).toLocaleString('ja-JP') + '</div>' +
            '<span class="log-type">' + (typeLabels[entry.type] || entry.type) + '</span>' +
            '<div>' + (entry.summary || '') + '</div>';

          container.appendChild(item);
        }
      }

      // チャート作成
      async function loadCharts() {
        const analysis = await apiCall('/api/behavior-analysis');
        if (!analysis) return;

        createBehaviorChart(analysis.timeOfDayPatterns || []);
        createDayOfWeekChart(analysis.dayOfWeekPatterns || []);
        createConfidenceChart(analysis.confidenceDistribution || {});
      }

      function createBehaviorChart(timePatterns) {
        const labels = timePatterns.map(p => p.data.dayPart);
        const values = timePatterns.map(p => p.frequency || 0);

        new Chart(document.getElementById('behaviorChart'), {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'アクティビティ頻度',
              data: values,
              backgroundColor: 'rgba(26, 115, 232, 0.6)',
              borderColor: 'rgba(26, 115, 232, 1)'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false
              }
            },
            scales: {
              y: {
                beginAtZero: true
              }
            }
          }
        });
      }

      function createDayOfWeekChart(dayPatterns) {
        const labels = ['日', '月', '火', '水', '木', '金', '土'];
        const values = labels.map(() => 0);

        for (const pattern of dayPatterns) {
          const index = labels.indexOf(pattern.data.dayName.toLowerCase());
          if (index !== -1) {
            values[index] = pattern.frequency || 0;
          }
        });

        new Chart(document.getElementById('dayOfWeekChart'), {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: '曜日別アクティビティ',
              data: values,
              backgroundColor: 'rgba(54, 162, 235, 0.6)',
              borderColor: 'rgba(54, 162, 235, 1)'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false
              }
            },
            scales: {
              y: {
                beginAtZero: true
              }
            }
          }
        });
      }

      function createConfidenceChart(distribution) {
        const labels = ['低 (0.3)', '中 (0.5)', '高 (0.7)', '非常に高 (0.9)'];
        const values = [
          distribution.low || 0,
          distribution.medium || 0,
          distribution.high || 0,
          distribution.veryHigh || 0
        ];

        new Chart(document.getElementById('confidenceChart'), {
          type: 'doughnut',
          data: {
            labels: labels,
            datasets: [{
              data: values,
              backgroundColor: [
                'rgba(255, 107, 107, 0.6)',
                'rgba(255, 167, 38, 0.6)',
                'rgba(255, 193, 7, 0.6)',
                'rgba(255, 82, 82, 0.6)'
              ],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  generateLabels: (chart) => {
                    return labels[chart.dataIndex];
                  }
                }
              }
            }
          }
        });
      }

      function showPatternDetail(patternId) {
        // 詳細なパターン情報の取得と表示
        apiCall('/api/patterns/detail?id=' + patternId).then(detail => {
          if (detail) {
            alert('パターン情報:\n' +
                    'タイプ: ' + detail.type + '\n' +
                    'カテゴリ: ' + detail.category + '\n' +
                    '頻度: ' + detail.frequency + '回\n' +
                    '信頼度: ' + detail.confidence + '\n' +
                    '詳細: ' + JSON.stringify(detail.data, null, 2));
          }
        });
      }
    </script>
  </div>
</body>
</html>`;

/**
 * Webサーバー
 */
class DashboardServer {
  constructor(port, contextManager) {
    this.port = port || 3000;
    this.server = null;
    this.contextManager = contextManager;
    this.clients = new Set();
  }

  /**
   * サーバーを起動
   */
  start() {
    console.log(`🚀 Learning Data Dashboard starting on port ${this.port}...`);

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    this.server.on('error', (err) => {
      console.error('Server error:', err);
    });

    this.server.listen(this.port, () => {
      console.log('✓ Dashboard server listening on http://localhost:' + this.port);
    });
  }

  /**
   * リクエストハンドラ
   */
  async handleRequest(req, res) {
    const parsedUrl = new URL(req.url, 'http://localhost:' + this.port);
    const pathname = parsedUrl.pathname;

    // CORS対応
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // ルーティング
    switch (pathname) {
      case '/':
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(DASHBOARD_HTML);
        break;

      case '/api/patterns':
        await this.handleGetPatterns(req, res);
        break;

      case '/api/learning-log':
        await this.handleGetLearningLog(req, res);
        break;

      case '/api/stats':
        await this.handleGetStats(req, res);
        break;

      case '/api/behavior-analysis':
        await this.handleGetBehaviorAnalysis(req, res);
        break;

      case '/api/realtime-data':
        await this.handleGetRealtimeData(req, res);
        break;

      case '/api/export-data':
        await this.handleExportData(req, res);
        break;

      default:
        res.writeHead(404);
        res.end('Not Found');
    }
  }

  /**
   * パターン一覧を返す
   */
  async handleGetPatterns(req, res) {
    try {
      const urlParams = new URL(req.url, 'http://localhost:' + this.port + req.url).searchParams;
      const type = urlParams.get('type') || 'all';
      const limit = parseInt(urlParams.get('limit')) || 100;

      // TODO: ContextManagerからパターンデータを取得
      const patterns = [];

      res.setHeader('Content-Type', 'application/json');
      res.json({ success: true, patterns, meta: { total: patterns.length, limit, type } });
    } catch (error) {
      console.error('Error handling patterns request:', error);
      res.writeHead(500);
      res.json({ success: false, error: error.message });
    }
  }

  /**
   * 学習ログを返す
   */
  async handleGetLearningLog(req, res) {
    try {
      const urlParams = new URL(req.url, 'http://localhost:' + this.port + req.url).searchParams;
      const limit = parseInt(urlParams.get('limit')) || 50;
      const offset = parseInt(urlParams.get('offset')) || 0;

      // TODO: ContextManagerから学習ログを取得
      const logs = [];

      res.setHeader('Content-Type', 'application/json');
      res.json({ success: true, logs, meta: { total: logs.length, limit, offset } });
    } catch (error) {
      console.error('Error handling learning log request:', error);
      res.writeHead(500);
      res.json({ success: false, error: error.message });
    }
  }

  /**
   * 統計情報を返す
   */
  async handleGetStats(req, res) {
    try {
      // TODO: ContextManagerから統計情報を取得
      const stats = {
        totalPatterns: 0,
        activePatterns: 0,
        avgConfidence: 0.5,
        learningEntries: 0,
        uptime: 0
      };

      res.setHeader('Content-Type', 'application/json');
      res.json({ success: true, stats });
    } catch (error) {
      console.error('Error handling stats request:', error);
      res.writeHead(500);
      res.json({ success: false, error: error.message });
    }
  }

  /**
   * 行動分析データを返す
   */
  async handleGetBehaviorAnalysis(req, res) {
    try {
      const urlParams = new URL(req.url, 'http://localhost:' + this.port + req.url).searchParams;

      // TODO: SelfLearningAgentから分析データを取得
      const analysis = {
        timeOfDayPatterns: [],
        dayOfWeekPatterns: [],
        confidenceDistribution: {},
        topPatterns: []
      };

      res.setHeader('Content-Type', 'application/json');
      res.json({ success: true, analysis });
    } catch (error) {
      console.error('Error handling behavior analysis request:', error);
      res.writeHead(500);
      res.json({ success: false, error: error.message });
    }
  }

  /**
   * リアルタイムデータを返す（WebSocket接続のクライアントに通知）
   */
  async handleGetRealtimeData(req, res) {
    try {
      res.setHeader('Content-Type', 'application/json');

      // WebSocketクライアントにデータを通知するように
      res.json({
        success: true,
        message: 'Realtime data updates will be pushed via WebSocket'
      });
    } catch (error) {
      console.error('Error handling realtime data request:', error);
      res.writeHead(500);
      res.json({ success: false, error: error.message });
    }
  }

  /**
   * データをエクスポート
   */
  async handleExportData(req, res) {
    try {
      const urlParams = new URL(req.url, 'http://localhost:' + this.port + req.url).searchParams;
      const format = urlParams.get('format') || 'json';

      // TODO: ContextManager/SelfLearningAgentからデータを収集
      const data = {
        timestamp: new Date().toISOString(),
        patterns: [],
        learningLog: [],
        stats: {}
      };

      const exportData = format === 'csv' ? this.toCSV(data) : JSON.stringify(data, null, 2);

      res.setHeader('Content-Type', 'application/' + format);
      res.send(exportData);
    } catch (error) {
      console.error('Error handling export request:', error);
      res.writeHead(500);
      res.json({ success: false, error: error.message });
    }
  }

  /**
   * データをCSVフォーマットに変換
   */
  toCSV(data) {
    const headers = Object.keys(data.patterns[0] || []);
    const rows = data.patterns.map(p => {
      const row = {};
      headers.forEach(key => {
        row[key] = typeof p.data[key] === 'object' ?
          JSON.stringify(p.data[key]) : p.data[key];
      });
      return row;
    });

    const headerRow = headers.join(',');
    const csv = headers.join(',') + '\n' +
                    rows.map(row => Object.values(row).join(',')).join('\n');

    return csv;
  }

  /**
   * WebSocket接続済クライアントにデータをプッシュ
   */
  broadcastUpdate(update) {
    this.clients.forEach(client => {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify({
          type: 'update',
          data: update
        }));
      }
    });
  }

  /**
   * シャットダウン
   */
  shutdown() {
    console.log('🚀 Shutting down Dashboard server...');
    this.server.close(() => {
      console.log('✓ Dashboard server shut down');
    });
  }
}

module.exports = { DashboardServer, DASHBOARD_HTML };

// メイン実行：サーバー起動
if (require.main === module) {
  console.log('Starting Learning Data Dashboard...');
  const server = new DashboardServer(DASHBOARD_PORT);
  server.start();
}
