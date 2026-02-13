/**
 * Morning Secretary - Phase 2 Entry Point
 * Morning briefings with Calendar, Weather, and Discord notifications
 */

const fs = require('fs').promises;
const path = require('path');
const https = require('https');

const BASE_DIR = __dirname;
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');

async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {
      discord: { channelId: null },
      googleCalendar: { credentialsPath: './credentials.json' },
      weather: { apiKey: null },
      schedule: { time: '07:00' }
    };
  }
}

async function fetchWeather(config) {
  const apiKey = config.weather?.apiKey;
  const location = config.weather?.location || 'Tokyo';
  
  if (!apiKey) {
    return {
      condition: 'unknown',
      temp: null,
      humidity: null,
      description: 'Weather API key not configured'
    };
  }

  return new Promise((resolve) => {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({
            condition: json.weather?.[0]?.main || 'unknown',
            temp: json.main?.temp,
            humidity: json.main?.humidity,
            description: json.weather?.[0]?.description || ''
          });
        } catch (e) {
          resolve({ condition: 'error', description: 'Failed to parse weather data' });
        }
      });
    }).on('error', (e) => {
      resolve({ condition: 'error', description: e.message });
    });
  });
}

async function fetchTodayEvents(config) {
  const credentialsPath = config.googleCalendar?.credentialsPath || './credentials.json';
  
  try {
    await fs.access(path.join(BASE_DIR, credentialsPath));
    return {
      hasCredentials: true,
      events: [],
      note: 'Use secretary.js for full Google Calendar integration'
    };
  } catch (e) {
    return {
      hasCredentials: false,
      events: [],
      note: 'Google Calendar credentials not configured'
    };
  }
}

function getWeatherEmoji(condition) {
  const emojiMap = {
    'Clear': '☀️',
    'Clouds': '☁️',
    'Rain': '🌧️',
    'Drizzle': '🌦️',
    'Thunderstorm': '⛈️',
    'Snow': '❄️',
    'Mist': '🌫️',
    'Fog': '🌫️',
    'unknown': '🌡️'
  };
  return emojiMap[condition] || '🌡️';
}

function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function generateMorningBriefing(events, weather, config) {
  const today = new Date();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日（${weekdays[today.getDay()]}）`;
  
  let briefing = `🌅 おはようございます！ - ${dateStr}\n\n`;
  
  briefing += `${getWeatherEmoji(weather.condition)} 天気\n`;
  briefing += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (weather.temp !== null) {
    briefing += `• 気温: ${weather.temp}°C\n`;
    briefing += `• 湿度: ${weather.humidity}%\n`;
    briefing += `• ${weather.description}\n`;
  } else {
    briefing += `• ${weather.description}\n`;
  }
  briefing += '\n';
  
  briefing += `🗓️ 今日の予定\n`;
  briefing += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (events.events && events.events.length > 0) {
    events.events.forEach(event => {
      const time = event.isAllDay ? '終日' : formatTime(event.start);
      briefing += `• ${time} 〜 ${event.summary}\n`;
    });
  } else {
    briefing += `• 予定なし\n`;
    if (events.note) {
      briefing += `  (${events.note})\n`;
    }
  }
  briefing += '\n';
  
  briefing += `💡 今日のヒント\n`;
  briefing += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  const tips = [
    '重要なタスクから始めましょう',
    '定期的な休憩を忘れずに',
    '水分補給を心がけましょう'
  ];
  briefing += `• ${tips[today.getDate() % tips.length]}\n`;
  
  briefing += `\n良い一日を！ ☀️`;
  
  return briefing;
}

async function sendDiscordNotification(message, config) {
  const channelId = config.discord?.channelId;
  const webhookUrl = config.discord?.webhookUrl;
  
  if (!channelId && !webhookUrl) {
    console.log('⚠️ Discord channel not configured');
    return { success: false, error: 'Discord not configured' };
  }
  
  if (webhookUrl) {
    return new Promise((resolve) => {
      const url = new URL(webhookUrl);
      const data = JSON.stringify({ content: message });
      
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };
      
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('📤 Sent to Discord via webhook');
            resolve({ success: true });
          } else {
            resolve({ success: false, error: `HTTP ${res.statusCode}` });
          }
        });
      });
      
      req.on('error', (e) => {
        resolve({ success: false, error: e.message });
      });
      
      req.write(data);
      req.end();
    });
  }
  
  console.log(`📤 Would send to Discord channel: ${channelId}`);
  return { success: true, note: 'Use context.channels.send for bot integration' };
}

async function run(context) {
  console.log('🌅 Morning Secretary (Phase 2) starting...');
  
  const config = await loadConfig();
  
  const [weather, events] = await Promise.all([
    fetchWeather(config),
    fetchTodayEvents(config)
  ]);
  
  console.log(`🌤️ Weather: ${weather.condition}`);
  console.log(`📅 Events: ${events.events?.length || 0}`);
  
  const briefing = generateMorningBriefing(events, weather, config);
  
  if (context?.channels?.send) {
    await context.channels.send('discord', briefing);
    console.log('📤 Sent briefing via context');
  } else {
    console.log('\n--- Morning Briefing ---\n');
    console.log(briefing);
  }
  
  const scheduleTime = config.schedule?.time || '07:00';
  console.log(`\n⏰ Scheduled for: ${scheduleTime}`);
  
  return {
    success: true,
    briefing,
    weather,
    events,
    scheduleTime
  };
}

if (require.main === module) {
  run(null).then(result => {
    console.log('\n✅ Morning Secretary completed');
  }).catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
}

module.exports = {
  run,
  loadConfig,
  fetchWeather,
  fetchTodayEvents,
  generateMorningBriefing,
  sendDiscordNotification,
  getDailyNotePath: () => {
    const today = new Date().toISOString().split('T')[0];
    return path.join(process.env.OBSIDIAN_VAULT_PATH || '', 'Daily Notes', `${today}.md`);
  }
};
