const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CREDENTIALS_PATH = path.join(HOME, '.clawdbot', 'credentials', 'moonshot.json');
const CONFIG_DIR = path.join(HOME, '.clawdbot', 'skills', 'llm-provider');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const BASE_URLS = {
    moonshot: 'https://api.moonshot.ai/v1',
    openai: 'https://api.openai.com/v1',
    deepseek: 'https://api.deepseek.com/v1'
};

const PROVIDER_MODELS = {
    moonshot: ['kimi-k2.5', 'kimi-k2', 'kimi-k2-thinking', 'kimi-k2-0905'],
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    deepseek: ['deepseek-chat', 'deepseek-reasoner']
};

const CREDENTIAL_FILES = {
    moonshot: 'moonshot.json',
    openai: 'openai.json',
    deepseek: 'deepseek.json'
};

const PROVIDER_KEY_URLS = {
    moonshot: 'https://platform.moonshot.ai/',
    openai: 'https://platform.openai.com/api-keys',
    deepseek: 'https://platform.deepseek.com/'
};

const DEFAULT_CONFIG = {
    provider: 'moonshot',
    model: 'kimi-k2.5',
    temperature: 0.6,
    topP: 0.95,
    maxTokens: 4096
};

// --- Config helpers ---

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            return { ...DEFAULT_CONFIG, ...data };
        }
    } catch (err) {
        console.error('Warning: Could not load config, using defaults.');
    }
    return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

// --- Credential helpers ---

function loadCredentials(provider) {
    const credFile = CREDENTIAL_FILES[provider];
    if (!credFile) {
        console.error(`Error: Unknown provider "${provider}".`);
        console.log(`Supported providers: ${Object.keys(BASE_URLS).join(', ')}`);
        return null;
    }

    const credPath = path.join(HOME, '.clawdbot', 'credentials', credFile);
    if (!fs.existsSync(credPath)) {
        const keyUrl = PROVIDER_KEY_URLS[provider] || '(provider website)';
        console.error(`Error: Credentials not found for provider "${provider}".`);
        console.log('');
        console.log('Setup instructions:');
        console.log(`  1. Get your API key from: ${keyUrl}`);
        console.log(`  2. Create the credentials file:`);
        console.log(`     ${credPath}`);
        console.log('  3. Add the following JSON:');
        console.log('     {');
        console.log('       "apiKey": "YOUR_API_KEY_HERE"');
        console.log('     }');
        return null;
    }

    try {
        const data = JSON.parse(fs.readFileSync(credPath, 'utf8'));
        if (!data.apiKey) {
            console.error(`Error: "apiKey" field missing in ${credPath}`);
            return null;
        }
        return data;
    } catch (err) {
        console.error(`Error: Could not parse credentials file: ${credPath}`);
        console.error(err.message);
        return null;
    }
}

// --- Client factory ---

function createClient(provider, credentials) {
    const baseURL = BASE_URLS[provider];
    if (!baseURL) {
        console.error(`Error: No base URL configured for provider "${provider}".`);
        return null;
    }
    return new OpenAI({
        apiKey: credentials.apiKey,
        baseURL: baseURL
    });
}

// --- Commands ---

async function chatCommand(args, config) {
    // Parse --think flag
    let thinkMode = false;
    const messageArgs = [];

    for (const arg of args) {
        if (arg === '--think') {
            thinkMode = true;
        } else {
            messageArgs.push(arg);
        }
    }

    const message = messageArgs.join(' ');
    if (!message) {
        console.log('Error: Message required.');
        console.log('Usage: node llm.js chat [--think] <message>');
        return;
    }

    const credentials = loadCredentials(config.provider);
    if (!credentials) return;

    const client = createClient(config.provider, credentials);
    if (!client) return;

    // Adjust parameters for thinking mode
    const temperature = thinkMode ? 1.0 : config.temperature;
    const model = config.model;

    if (thinkMode) {
        console.log(`[Thinking mode: temperature=1.0, model=${model}]`);
        console.log('');
    }

    try {
        const stream = await client.chat.completions.create({
            model: model,
            messages: [
                { role: 'user', content: message }
            ],
            temperature: temperature,
            top_p: config.topP,
            max_tokens: config.maxTokens,
            stream: true
        });

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;

            // Handle reasoning/thinking content (displayed dimmed)
            if (delta.reasoning_content) {
                process.stdout.write(`\x1b[2m${delta.reasoning_content}\x1b[0m`);
            }

            // Handle regular content
            if (delta.content) {
                process.stdout.write(delta.content);
            }
        }

        // End with newline
        process.stdout.write('\n');
    } catch (err) {
        handleApiError(err);
    }
}

async function modelsCommand(config) {
    const provider = config.provider;
    const models = PROVIDER_MODELS[provider];

    if (!models) {
        console.log(`Error: Unknown provider "${provider}".`);
        return;
    }

    console.log(`Available models for ${provider}:`);
    console.log('');
    models.forEach(model => {
        const marker = model === config.model ? ' (active)' : '';
        console.log(`  - ${model}${marker}`);
    });
    console.log('');
    console.log(`Current model: ${config.model}`);
}

async function configCommand(args, config) {
    if (args.length === 0) {
        // Show current config
        console.log('Current configuration:');
        console.log('');
        console.log(`  provider:    ${config.provider}`);
        console.log(`  model:       ${config.model}`);
        console.log(`  temperature: ${config.temperature}`);
        console.log(`  topP:        ${config.topP}`);
        console.log(`  maxTokens:   ${config.maxTokens}`);
        console.log('');
        console.log(`Config file: ${CONFIG_PATH}`);
        return;
    }

    if (args[0] === 'set') {
        const key = args[1];
        const value = args.slice(2).join(' ');

        if (!key || !value) {
            console.log('Usage: node llm.js config set <key> <value>');
            console.log('');
            console.log('Available keys:');
            console.log('  provider    - LLM provider (moonshot, openai, deepseek)');
            console.log('  model       - Model name (e.g., kimi-k2.5, gpt-4o)');
            console.log('  temperature - Sampling temperature (0.0 - 2.0)');
            console.log('  topP        - Top-p sampling (0.0 - 1.0)');
            console.log('  maxTokens   - Maximum output tokens');
            return;
        }

        // Validate and set the value
        switch (key) {
            case 'provider':
                if (!BASE_URLS[value]) {
                    console.log(`Error: Unknown provider "${value}".`);
                    console.log(`Supported: ${Object.keys(BASE_URLS).join(', ')}`);
                    return;
                }
                config.provider = value;
                break;

            case 'model':
                config.model = value;
                break;

            case 'temperature': {
                const temp = parseFloat(value);
                if (isNaN(temp) || temp < 0 || temp > 2) {
                    console.log('Error: temperature must be a number between 0.0 and 2.0');
                    return;
                }
                config.temperature = temp;
                break;
            }

            case 'topP': {
                const tp = parseFloat(value);
                if (isNaN(tp) || tp < 0 || tp > 1) {
                    console.log('Error: topP must be a number between 0.0 and 1.0');
                    return;
                }
                config.topP = tp;
                break;
            }

            case 'maxTokens': {
                const mt = parseInt(value, 10);
                if (isNaN(mt) || mt < 1) {
                    console.log('Error: maxTokens must be a positive integer');
                    return;
                }
                config.maxTokens = mt;
                break;
            }

            default:
                console.log(`Error: Unknown config key "${key}".`);
                console.log('Available keys: provider, model, temperature, topP, maxTokens');
                return;
        }

        saveConfig(config);
        console.log(`Config updated: ${key} = ${config[key]}`);
    } else {
        console.log('Usage:');
        console.log('  node llm.js config            - Show current configuration');
        console.log('  node llm.js config set <k> <v> - Update a configuration value');
    }
}

// --- Error handling ---

function handleApiError(err) {
    if (err.status === 401 || err.code === 'invalid_api_key') {
        console.error('Error: Authentication failed. Please check your API key.');
        console.error('Verify credentials in ~/.clawdbot/credentials/');
    } else if (err.status === 429) {
        console.error('Error: Rate limit exceeded. Please wait and try again.');
        if (err.message) {
            console.error(`Details: ${err.message}`);
        }
    } else if (err.status === 400) {
        console.error(`Error: Bad request - ${err.message || 'Invalid parameters'}`);
    } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        console.error('Error: Could not connect to the API. Check your network connection.');
    } else {
        console.error(`Error: ${err.message || err}`);
    }
}

// --- Usage ---

function showUsage() {
    console.log('LLM Provider - Clawdbot Skill');
    console.log('');
    console.log('Usage:');
    console.log('  node llm.js chat <message>           - Chat with the LLM (streaming)');
    console.log('  node llm.js chat --think <message>    - Chat with thinking mode');
    console.log('  node llm.js models                    - List available models');
    console.log('  node llm.js config                    - Show current configuration');
    console.log('  node llm.js config set <key> <value>  - Update configuration');
    console.log('');
    console.log('Examples:');
    console.log('  node llm.js chat "Explain quantum computing"');
    console.log('  node llm.js chat --think "Solve this math problem: ..."');
    console.log('  node llm.js config set model kimi-k2');
    console.log('  node llm.js config set provider deepseek');
}

// --- Main ---

async function main() {
    const command = process.argv[2];
    const args = process.argv.slice(3);

    const config = loadConfig();

    try {
        switch (command) {
            case 'chat':
                await chatCommand(args, config);
                break;

            case 'models':
                await modelsCommand(config);
                break;

            case 'config':
                await configCommand(args, config);
                break;

            default:
                showUsage();
                break;
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
