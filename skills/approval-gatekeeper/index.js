/**
 * Approval Gatekeeper
 * Phase 4: Discord approval flow for high-risk transactions
 */

const fs = require('fs').promises;
const path = require('path');
const https = require('https');

const BASE_DIR = __dirname;
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
const PENDING_PATH = path.join(BASE_DIR, 'pending-approvals.json');

let config = null;

async function loadConfig() {
    try {
        const data = await fs.readFile(CONFIG_PATH, 'utf8');
        config = JSON.parse(data);
    } catch (e) {
        config = {
            discord: { channelId: '', webhookUrl: '' },
            timeoutMinutes: 5,
            highRiskThresholdEth: '0.05'
        };
    }
    return config;
}

async function loadPendingApprovals() {
    try {
        const data = await fs.readFile(PENDING_PATH, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

async function savePendingApprovals(approvals) {
    await fs.writeFile(PENDING_PATH, JSON.stringify(approvals, null, 2), 'utf8');
}

function generateRequestId() {
    return `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Send approval request to Discord
 */
async function requestApproval(txDetails) {
    if (!config) await loadConfig();
    
    const requestId = generateRequestId();
    const approval = {
        id: requestId,
        type: txDetails.type || 'transaction',
        amount: txDetails.amount,
        to: txDetails.to,
        description: txDetails.description,
        requestedAt: new Date().toISOString(),
        status: 'pending',
        expiresAt: new Date(Date.now() + config.timeoutMinutes * 60000).toISOString()
    };
    
    // Save to pending approvals
    const pending = await loadPendingApprovals();
    pending.push(approval);
    await savePendingApprovals(pending);
    
    // Send Discord notification
    if (config.discord.webhookUrl) {
        await sendDiscordNotification(approval);
    }
    
    console.log(`📤 Approval request sent: ${requestId}`);
    return { requestId, expiresAt: approval.expiresAt };
}

/**
 * Send Discord webhook notification
 */
async function sendDiscordNotification(approval) {
    const embed = {
        title: '🔐 Approval Required',
        description: `**${approval.description || 'Transaction requires approval'}**`,
        color: 0xFFA500,
        fields: [
            { name: 'Amount', value: `${approval.amount} ETH`, inline: true },
            { name: 'To', value: `${approval.to?.slice(0, 10)}...`, inline: true },
            { name: 'Request ID', value: approval.id, inline: false },
            { name: 'Expires', value: new Date(approval.expiresAt).toLocaleString('ja-JP'), inline: false }
        ],
        footer: { text: 'Reply with ✅ to approve or ❌ to deny' }
    };
    
    const payload = JSON.stringify({ embeds: [embed] });
    const url = new URL(config.discord.webhookUrl);
    
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ success: true });
                } else {
                    reject(new Error(`Discord API error: ${res.statusCode}`));
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

/**
 * Check if approval has been granted
 */
async function checkApproval(requestId) {
    const pending = await loadPendingApprovals();
    const approval = pending.find(a => a.id === requestId);
    
    if (!approval) {
        return { status: 'not_found' };
    }
    
    // Check expiration
    if (new Date(approval.expiresAt) < new Date()) {
        approval.status = 'expired';
        await savePendingApprovals(pending);
        return { status: 'expired' };
    }
    
    return { status: approval.status, details: approval };
}

/**
 * Approve a pending request
 */
async function approveRequest(requestId) {
    const pending = await loadPendingApprovals();
    const approval = pending.find(a => a.id === requestId);
    
    if (!approval) {
        return { success: false, error: 'Request not found' };
    }
    
    if (approval.status !== 'pending') {
        return { success: false, error: `Request already ${approval.status}` };
    }
    
    approval.status = 'approved';
    approval.approvedAt = new Date().toISOString();
    await savePendingApprovals(pending);
    
    console.log(`✅ Approval granted: ${requestId}`);
    return { success: true, approval };
}

/**
 * Deny a pending request
 */
async function denyRequest(requestId) {
    const pending = await loadPendingApprovals();
    const approval = pending.find(a => a.id === requestId);
    
    if (!approval) {
        return { success: false, error: 'Request not found' };
    }
    
    approval.status = 'denied';
    approval.deniedAt = new Date().toISOString();
    await savePendingApprovals(pending);
    
    console.log(`❌ Approval denied: ${requestId}`);
    return { success: true, approval };
}

/**
 * Execute transaction with approval
 * Waits for approval, then executes the provided function
 */
async function executeWithApproval(txDetails, executeFn) {
    const { requestId } = await requestApproval(txDetails);
    
    console.log(`⏳ Waiting for approval: ${requestId}`);
    
    // Poll for approval
    const maxWait = config.timeoutMinutes * 60 * 1000;
    const pollInterval = 5000;
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
        const result = await checkApproval(requestId);
        
        if (result.status === 'approved') {
            console.log(`✅ Executing approved transaction: ${requestId}`);
            return await executeFn(txDetails);
        } else if (result.status === 'denied' || result.status === 'expired') {
            throw new Error(`Transaction ${result.status}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    throw new Error('Approval timeout');
}

/**
 * Check if amount requires approval
 */
function requiresApproval(amountEth) {
    if (!config) return true;
    const threshold = parseFloat(config.highRiskThresholdEth);
    return parseFloat(amountEth) >= threshold;
}

// CLI interface
async function main() {
    const command = process.argv[2];
    await loadConfig();
    
    switch (command) {
        case 'request':
            const amount = process.argv[3] || '0.1';
            const to = process.argv[4] || '0x0000000000000000000000000000000000000000';
            const result = await requestApproval({
                type: 'transaction',
                amount,
                to,
                description: 'CLI test transaction'
            });
            console.log('Request ID:', result.requestId);
            break;
            
        case 'check':
            const checkId = process.argv[3];
            if (!checkId) {
                console.log('Usage: node index.js check <requestId>');
                break;
            }
            const status = await checkApproval(checkId);
            console.log('Status:', JSON.stringify(status, null, 2));
            break;
            
        case 'approve':
            const approveId = process.argv[3];
            if (!approveId) {
                console.log('Usage: node index.js approve <requestId>');
                break;
            }
            await approveRequest(approveId);
            break;
            
        case 'deny':
            const denyId = process.argv[3];
            if (!denyId) {
                console.log('Usage: node index.js deny <requestId>');
                break;
            }
            await denyRequest(denyId);
            break;
            
        case 'list':
            const pending = await loadPendingApprovals();
            console.log('Pending approvals:', JSON.stringify(pending.filter(a => a.status === 'pending'), null, 2));
            break;
            
        default:
            console.log('Usage: node index.js [request|check|approve|deny|list]');
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
    });
}

module.exports = {
    requestApproval,
    checkApproval,
    approveRequest,
    denyRequest,
    executeWithApproval,
    requiresApproval
};
