# Approval Gatekeeper

## Overview
Discord-based approval system for high-risk transactions and operations.

## Phase
Phase 4: Asset Management

## Functions

### `requestApproval(txDetails)`
Send approval request to Discord.
- `txDetails.type`: Transaction type
- `txDetails.amount`: Amount in ETH
- `txDetails.to`: Destination address
- `txDetails.description`: Human-readable description

Returns `{ requestId, expiresAt }`

### `checkApproval(requestId)`
Check approval status.
- Returns `{ status: 'pending'|'approved'|'denied'|'expired'|'not_found' }`

### `approveRequest(requestId)`
Manually approve a pending request.

### `denyRequest(requestId)`
Deny a pending request.

### `executeWithApproval(txDetails, executeFn)`
Wait for approval, then execute function.

### `requiresApproval(amountEth)`
Check if amount exceeds approval threshold.

## Configuration (`config.json`)

```json
{
  "discord": {
    "channelId": "YOUR_CHANNEL_ID",
    "webhookUrl": "YOUR_WEBHOOK_URL"
  },
  "timeoutMinutes": 5,
  "highRiskThresholdEth": "0.05"
}
```

## Usage

```javascript
const { requestApproval, executeWithApproval } = require('./index');

// Request approval
const { requestId } = await requestApproval({
    type: 'transaction',
    amount: '0.1',
    to: '0x1234...5678',
    description: 'Send ETH to exchange'
});

// Execute with approval wait
await executeWithApproval(txDetails, async (details) => {
    // This runs after approval
    return await wallet.sendTransaction(details.to, details.amount);
});
```

## Discord Flow
1. Bot sends embed with approval request
2. User reacts with ✅ or ❌
3. Bot detects reaction and updates status
4. Transaction proceeds or is cancelled
