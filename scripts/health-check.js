/**
 * Health Check Script
 * Phase 1: Verifies all OpenClaw components are healthy
 */

const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
const os = require('os');

const CLAWDBOT_DIR = path.join(os.homedir(), '.clawdbot');
const CONFIG_PATH = path.join(CLAWDBOT_DIR, 'clawdbot.json');

const checks = [];

function addCheck(name, fn) {
    checks.push({ name, fn });
}

addCheck('Config File', async () => {
    try {
        await fs.access(CONFIG_PATH);
        const config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
        return { status: 'ok', details: `Gateway: ${config.gateway?.mode || 'unknown'}` };
    } catch (e) {
        return { status: 'error', details: 'Config not found' };
    }
});

addCheck('Gateway Connection', async () => {
    try {
        const config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
        const token = config.gateway?.auth?.token;
        const mode = config.gateway?.mode;
        
        if (mode === 'local') {
            return { status: 'ok', details: 'Local mode - no connection needed' };
        }
        
        // For remote mode, verify token exists
        if (token && token.length > 10) {
            return { status: 'ok', details: 'Token configured' };
        }
        return { status: 'warning', details: 'Token may be invalid' };
    } catch (e) {
        return { status: 'error', details: e.message };
    }
});

addCheck('Tailscale Status', async () => {
    try {
        const result = execSync('tailscale status --json', { encoding: 'utf8', timeout: 5000 });
        const status = JSON.parse(result);
        if (status.BackendState === 'Running') {
            return { status: 'ok', details: `Connected as ${status.Self?.HostName || 'unknown'}` };
        }
        return { status: 'warning', details: `State: ${status.BackendState}` };
    } catch (e) {
        return { status: 'warning', details: 'Tailscale not available' };
    }
});

addCheck('Docker Status', async () => {
    try {
        const result = execSync('docker info --format "{{.ServerVersion}}"', { encoding: 'utf8', timeout: 10000 });
        return { status: 'ok', details: `Docker ${result.trim()}` };
    } catch (e) {
        return { status: 'warning', details: 'Docker not running' };
    }
});

addCheck('Skills Directory', async () => {
    const skillsPath = path.join(__dirname, '..', 'skills');
    try {
        const dirs = await fs.readdir(skillsPath);
        const skillCount = dirs.filter(d => !d.startsWith('.')).length;
        return { status: 'ok', details: `${skillCount} skills installed` };
    } catch (e) {
        return { status: 'error', details: 'Skills directory not found' };
    }
});

addCheck('Base Wallet', async () => {
    const walletPath = path.join(CLAWDBOT_DIR, 'base_wallet.json');
    try {
        await fs.access(walletPath);
        const wallet = JSON.parse(await fs.readFile(walletPath, 'utf8'));
        return { status: 'ok', details: `Address: ${wallet.address?.slice(0, 10)}...` };
    } catch (e) {
        return { status: 'warning', details: 'Wallet not initialized' };
    }
});

async function runHealthCheck() {
    console.log('╔══════════════════════════════════════╗');
    console.log('║       OpenClaw Health Check           ║');
    console.log('╚══════════════════════════════════════╝');
    console.log(`📅 ${new Date().toLocaleString('ja-JP')}\n`);
    
    const results = [];
    
    for (const check of checks) {
        const startTime = Date.now();
        try {
            const result = await check.fn();
            const duration = Date.now() - startTime;
            results.push({
                name: check.name,
                ...result,
                duration
            });
        } catch (e) {
            results.push({
                name: check.name,
                status: 'error',
                details: e.message,
                duration: Date.now() - startTime
            });
        }
    }
    
    console.log('Check Results:');
    console.log('─────────────────────────────────────────────────');
    
    const statusEmoji = {
        ok: '✅',
        warning: '⚠️',
        error: '❌'
    };
    
    let okCount = 0;
    let warningCount = 0;
    let errorCount = 0;
    
    for (const result of results) {
        const emoji = statusEmoji[result.status] || '❓';
        console.log(`${emoji} ${result.name.padEnd(20)} ${result.details} (${result.duration}ms)`);
        
        if (result.status === 'ok') okCount++;
        else if (result.status === 'warning') warningCount++;
        else errorCount++;
    }
    
    console.log('─────────────────────────────────────────────────');
    console.log(`\n📊 Summary: ${okCount} OK, ${warningCount} Warnings, ${errorCount} Errors`);
    
    if (errorCount === 0 && warningCount === 0) {
        console.log('\n✅ System is healthy!');
        return 0;
    } else if (errorCount === 0) {
        console.log('\n⚠️ System is operational with warnings');
        return 0;
    } else {
        console.log('\n❌ System has errors that need attention');
        return 1;
    }
}

runHealthCheck().then(code => process.exit(code)).catch(err => {
    console.error('Health check failed:', err);
    process.exit(1);
});
