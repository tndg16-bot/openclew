const { ethers } = require('ethers');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

// Base Mainnet RPC
const RPC_URL = "https://mainnet.base.org";
const WALLET_FILE = path.join(os.homedir(), '.clawdbot', 'base_wallet.json');

async function getProvider() {
    return new ethers.JsonRpcProvider(RPC_URL);
}

async function loadWallet() {
    if (!fs.existsSync(WALLET_FILE)) {
        return null;
    }
    const data = await fs.readJson(WALLET_FILE);
    const provider = await getProvider();
    return new ethers.Wallet(data.privateKey, provider);
}

async function createWallet() {
    if (fs.existsSync(WALLET_FILE)) {
        console.log("Wallet already exists!");
        const wallet = await loadWallet();
        console.log(`Address: ${wallet.address}`);
        return;
    }

    const wallet = ethers.Wallet.createRandom();
    const data = {
        address: wallet.address,
        privateKey: wallet.privateKey,
        mnemonic: wallet.mnemonic.phrase,
        createdAt: new Date().toISOString()
    };

    // Save with restricted permissions (best effort on node)
    await fs.writeJson(WALLET_FILE, data, { mode: 0o600 });
    console.log(`✅ Wallet created!`);
    console.log(`Address: ${wallet.address}`);
    console.log(`Saved to: ${WALLET_FILE}`);
    console.log(`WARNING: Keep this file safe. It contains your PRIVATE KEY.`);
}

async function checkBalance() {
    const wallet = await loadWallet();
    if (!wallet) {
        console.log("No wallet found. Run 'create' first.");
        return;
    }
    const balance = await wallet.provider.getBalance(wallet.address);
    console.log(`Address: ${wallet.address}`);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH (Base)`);
}

async function showAddress() {
    const wallet = await loadWallet();
    if (!wallet) {
        console.log("No wallet found.");
        return;
    }
    console.log(`Address: ${wallet.address}`);
}

async function main() {
    const command = process.argv[2];

    try {
        switch (command) {
            case 'create':
                await createWallet();
                break;
            case 'balance':
                await checkBalance();
                break;
            case 'address':
                await showAddress();
                break;
            default:
                console.log("Usage: node wallet.js [create|balance|address]");
        }
    } catch (error) {
        console.error("Error:", error.message);
    }
}

main();
