/**
 * Foundation Setup Script
 * Phase 1: Checks permissions, Tailscale, Docker
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const CLAWDBOT_DIR = path.join(os.homedir(), '.clawdbot');
const CONFIG_PATH = path.join(CLAWDBOT_DIR, 'clawdbot.json');

async function checkPermissions() {
    console.log('\n📁 Checking permissions...');
    
    const approvalNotifierPath = path.join(CLAWDBOT_DIR, 'approval-notifier');
    
    try {
        await fs.access(approvalNotifierPath, fs.constants.R_OK | fs.constants.W_OK);
        console.log('  ✅ approval-notifier folder: accessible');
        return true;
    } catch (e) {
        console.log('  ⚠️ approval-notifier folder: access denied or missing');
        console.log('     Creating folder...');
        try {
            await fs.mkdir(approvalNotifierPath, { recursive: true, mode: 0o755 });
            console.log('  ✅ Created approval-notifier folder');
            return true;
        } catch (createErr) {
            console.log('  ❌ Failed to create:', createErr.message);
            return false;
        }
    }
}

async function checkTailscale() {
    console.log('\n🔗 Checking Tailscale...');
    
    try {
        const result = execSync('tailscale status', { encoding: 'utf8', timeout: 5000 });
        if (result.includes('Running')) {
            console.log('  ✅ Tailscale is running');
            return true;
        } else {
            console.log('  ⚠️ Tailscale installed but not running');
            return false;
        }
    } catch (e) {
        console.log('  ⚠️ Tailscale not installed or not configured');
        return false;
    }
}

async function checkDocker() {
    console.log('\n🐳 Checking Docker...');
    
    try {
        const result = execSync('docker info', { encoding: 'utf8', timeout: 10000 });
        if (result.includes('Server Version')) {
            console.log('  ✅ Docker is running');
            return true;
        }
    } catch (e) {
        console.log('  ⚠️ Docker not running or not installed');
        return false;
    }
    return false;
}

async function checkConfig() {
    console.log('\n⚙️ Checking configuration...');
    
    try {
        await fs.access(CONFIG_PATH, fs.constants.R_OK);
        const config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
        console.log('  ✅ Config file exists at:', CONFIG_PATH);
        console.log('     Gateway mode:', config.gateway?.mode || 'not set');
        return true;
    } catch (e) {
        console.log('  ⚠️ Config file not found. Creating from template...');
        
        const templatePath = path.join(__dirname, '..', 'clawdbot-config', 'clawdbot.json.example');
        try {
            const template = await fs.readFile(templatePath, 'utf8');
            await fs.mkdir(CLAWDBOT_DIR, { recursive: true });
            await fs.writeFile(CONFIG_PATH, template);
            console.log('  ✅ Created config file from template');
            return true;
        } catch (createErr) {
            console.log('  ❌ Failed to create config:', createErr.message);
            return false;
        }
    }
}

async function main() {
    console.log('╔══════════════════════════════════════╗');
    console.log('║   OpenClaw Foundation Setup (Phase1)  ║');
    console.log('╚══════════════════════════════════════╝');
    
    const results = {
        permissions: await checkPermissions(),
        tailscale: await checkTailscale(),
        docker: await checkDocker(),
        config: await checkConfig()
    };
    
    console.log('\n📊 Summary:');
    console.log('─────────────────────────────────────');
    
    const allPassed = Object.values(results).every(v => v);
    
    for (const [key, passed] of Object.entries(results)) {
        console.log(`  ${passed ? '✅' : '❌'} ${key}`);
    }
    
    console.log('─────────────────────────────────────');
    
    if (allPassed) {
        console.log('\n✅ All foundation checks passed!');
    } else {
        console.log('\n⚠️ Some checks failed. Review above for details.');
    }
    
    return allPassed;
}

main().catch(err => {
    console.error('❌ Setup failed:', err.message);
    process.exit(1);
});
