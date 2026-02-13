/**
 * News Curator - RSS Feed Reader with Discord Notifications
 * Digital Work Automation for OpenClaw Phase 3
 */

const https = require('https');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');

const BASE_DIR = __dirname;
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
const SOURCES_PATH = path.join(BASE_DIR, 'sources.json');
const CACHE_PATH = path.join(BASE_DIR, 'cache.json');

let config = null;
let sources = null;
let cache = null;

async function loadConfig() {
    try {
        const data = await fs.readFile(CONFIG_PATH, 'utf8');
        config = JSON.parse(data);
    } catch (err) {
        config = {
            discord: { enabled: false },
            schedule: { times: ['08:00', '18:00'] },
            summary: { maxArticlesPerSummary: 10 }
        };
    }
    return config;
}

async function loadSources() {
    try {
        const data = await fs.readFile(SOURCES_PATH, 'utf8');
        sources = JSON.parse(data);
    } catch (err) {
        sources = { feeds: [], categories: {} };
    }
    return sources;
}

async function loadCache() {
    try {
        const data = await fs.readFile(CACHE_PATH, 'utf8');
        cache = JSON.parse(data);
    } catch (err) {
        cache = { articles: [], lastFetch: null };
    }
    return cache;
}

async function saveCache(data) {
    await fs.writeFile(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

async function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'OpenClaw-NewsCurator/1.0.0',
                'Accept': 'application/rss+xml, application/xml, text/xml'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

function parseRSSFeed(xmlText) {
    const articles = [];
    
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    
    while ((match = itemRegex.exec(xmlText)) !== null) {
        const item = match[1];
        
        const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i);
        const linkMatch = item.match(/<link>(.*?)<\/link>/i);
        const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/i);
        const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/i);
        
        if (titleMatch && linkMatch) {
            articles.push({
                title: (titleMatch[1] || titleMatch[2] || '').trim(),
                link: (linkMatch[1] || '').trim(),
                description: cleanDescription(descMatch ? (descMatch[1] || descMatch[2] || '') : ''),
                pubDate: pubDateMatch ? pubDateMatch[1] : new Date().toISOString(),
                fetchedAt: new Date().toISOString()
            });
        }
    }

    if (articles.length === 0) {
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
        while ((match = entryRegex.exec(xmlText)) !== null) {
            const entry = match[1];
            
            const titleMatch = entry.match(/<title>(.*?)<\/title>/i);
            const linkMatch = entry.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i) || entry.match(/<link>(.*?)<\/link>/i);
            const summaryMatch = entry.match(/<summary>(.*?)<\/summary>/i) || entry.match(/<content>(.*?)<\/content>/i);
            const updatedMatch = entry.match(/<updated>(.*?)<\/updated>/i);
            
            if (titleMatch && linkMatch) {
                articles.push({
                    title: (titleMatch[1] || '').trim(),
                    link: (linkMatch[1] || '').trim(),
                    description: cleanDescription(summaryMatch ? summaryMatch[1] : ''),
                    pubDate: updatedMatch ? updatedMatch[1] : new Date().toISOString(),
                    fetchedAt: new Date().toISOString()
                });
            }
        }
    }

    return articles;
}

function cleanDescription(desc) {
    return desc
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 200);
}

async function fetchFeed(feed) {
    console.log(`Fetching: ${feed.name} (${feed.url})`);
    
    try {
        const xmlText = await fetchUrl(feed.url);
        const articles = parseRSSFeed(xmlText);
        
        const maxArticles = feed.maxArticles || 10;
        const limitedArticles = articles.slice(0, maxArticles);
        
        console.log(`  Fetched ${limitedArticles.length} articles from ${feed.name}`);
        
        return limitedArticles.map(article => ({
            ...article,
            feedId: feed.id,
            feedName: feed.name,
            category: feed.category,
            priority: feed.priority || 3
        }));
    } catch (error) {
        console.error(`  Error fetching ${feed.name}: ${error.message}`);
        return [];
    }
}

async function fetchAllFeeds() {
    await loadSources();
    await loadCache();
    
    const enabledFeeds = sources.feeds.filter(f => f.enabled);
    const allArticles = [];
    
    for (const feed of enabledFeeds) {
        const articles = await fetchFeed(feed);
        allArticles.push(...articles);
    }

    if (config?.filters?.deduplicationEnabled) {
        const seen = new Set();
        const deduped = allArticles.filter(article => {
            const key = article.link || article.title;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        allArticles.length = 0;
        allArticles.push(...deduped);
    }

    allArticles.sort((a, b) => {
        const priorityDiff = (a.priority || 3) - (b.priority || 3);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(b.pubDate) - new Date(a.pubDate);
    });

    const maxArticles = config?.summary?.maxArticlesPerSummary || 10;
    const limitedArticles = allArticles.slice(0, maxArticles);
    
    cache.articles = limitedArticles;
    cache.lastFetch = new Date().toISOString();
    await saveCache(cache);
    
    console.log(`\nTotal articles collected: ${limitedArticles.length}`);
    return limitedArticles;
}

function groupByCategory(articles) {
    const groups = {};
    
    for (const article of articles) {
        const category = article.category || 'other';
        if (!groups[category]) {
            groups[category] = [];
        }
        groups[category].push(article);
    }
    
    return groups;
}

function generateSummary(articles) {
    const maxTitleLen = config?.summary?.maxTitleLength || 100;
    const maxDescLen = config?.summary?.maxDescriptionLength || 200;
    const groupByCat = config?.summary?.groupByCategory ?? true;

    let summary = `📰 **Tech News Summary**\n`;
    summary += `🕐 ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}\n`;
    summary += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (groupByCat) {
        const groups = groupByCategory(articles);
        const categories = sources?.categories || {};
        
        for (const [category, categoryArticles] of Object.entries(groups)) {
            const catInfo = categories[category] || { displayName: category, emoji: '📄' };
            summary += `${catInfo.emoji} **${catInfo.displayName}** (${categoryArticles.length})\n`;
            
            for (const article of categoryArticles.slice(0, 5)) {
                const title = article.title.substring(0, maxTitleLen);
                summary += `• [${title}](${article.link})\n`;
                
                if (config?.summary?.includeDescription && article.description) {
                    const desc = article.description.substring(0, maxDescLen);
                    summary += `  _${desc}..._\n`;
                }
            }
            summary += '\n';
        }
    } else {
        for (const article of articles) {
            const title = article.title.substring(0, maxTitleLen);
            summary += `• **${title}**\n`;
            summary += `  ${article.link}\n`;
            summary += `  _${article.feedName}_\n\n`;
        }
    }

    summary += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    summary += `📊 Total: ${articles.length} articles`;

    return summary;
}

async function sendToDiscord(message) {
    if (!config?.discord?.enabled) {
        console.log('Discord notifications disabled');
        return { success: false, reason: 'disabled' };
    }

    const webhookUrl = config.discord.webhookUrl;
    if (!webhookUrl) {
        console.log('No Discord webhook URL configured');
        return { success: false, reason: 'no_webhook' };
    }

    return new Promise((resolve, reject) => {
        const url = new URL(webhookUrl);
        const payload = JSON.stringify({ content: message });
        
        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log('Sent summary to Discord');
                    resolve({ success: true });
                } else {
                    console.error(`Discord error: ${res.statusCode}`);
                    resolve({ success: false, statusCode: res.statusCode });
                }
            });
        });

        req.on('error', (err) => {
            console.error(`Discord error: ${err.message}`);
            resolve({ success: false, error: err.message });
        });

        req.write(payload);
        req.end();
    });
}

function shouldRunNow() {
    const schedule = config?.schedule || {};
    if (!schedule.enabled) return false;

    const now = new Date();
    const tz = schedule.timezone || 'Asia/Tokyo';
    const currentTime = now.toLocaleTimeString('en-US', { 
        timeZone: tz, 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit' 
    });

    return schedule.times.includes(currentTime);
}

async function run(context, command = 'fetch') {
    await loadConfig();
    
    console.log('📰 News Curator starting...');
    
    switch (command) {
        case 'fetch':
            const articles = await fetchAllFeeds();
            return { success: true, articlesCount: articles.length, articles };
            
        case 'summary':
            await loadCache();
            const cachedArticles = cache?.articles || [];
            const summary = generateSummary(cachedArticles);
            console.log('\n' + summary);
            return { success: true, summary };
            
        case 'notify':
            const notifyArticles = await fetchAllFeeds();
            const notifySummary = generateSummary(notifyArticles);
            const result = await sendToDiscord(notifySummary);
            return { success: result.success, summary: notifySummary, discordResult: result };
            
        case 'scheduled':
            if (shouldRunNow()) {
                console.log('Scheduled time reached - fetching and notifying');
                const schedArticles = await fetchAllFeeds();
                const schedSummary = generateSummary(schedArticles);
                await sendToDiscord(schedSummary);
                return { success: true, triggered: true };
            } else {
                console.log('Not scheduled time - skipping');
                return { success: true, triggered: false };
            }
            
        case 'list-feeds':
            await loadSources();
            console.log('\nConfigured feeds:');
            for (const feed of sources.feeds) {
                const status = feed.enabled ? '✓' : '✗';
                console.log(`  ${status} ${feed.name} (${feed.category})`);
            }
            return { success: true, feeds: sources.feeds };
            
        default:
            console.log('Available commands: fetch, summary, notify, scheduled, list-feeds');
            return { success: false };
    }
}

if (require.main === module) {
    const command = process.argv[2] || 'fetch';
    run(null, command).then(result => {
        console.log('\n✅ News Curator completed');
        if (process.argv.includes('--json')) {
            console.log(JSON.stringify(result, null, 2));
        }
    }).catch(err => {
        console.error('❌ Error:', err);
        process.exit(1);
    });
}

module.exports = {
    run,
    fetchAllFeeds,
    generateSummary,
    sendToDiscord,
    parseRSSFeed,
    fetchUrl
};
