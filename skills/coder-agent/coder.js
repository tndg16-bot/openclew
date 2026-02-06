const fs = require('fs-extra');
const path = require('path');
const os = require('os');

// Root directory for skills (Sandwiching not strictly enforced but good practice)
const SKILLS_ROOT = path.join(os.homedir(), '.clawdbot', 'skills');

async function readFile(targetPath) {
    if (!fs.existsSync(targetPath)) {
        console.log(`Error: File not found: ${targetPath}`);
        return;
    }
    const content = await fs.readFile(targetPath, 'utf8');
    console.log(`\n--- File: ${targetPath} ---\n`);
    console.log(content);
    console.log(`\n---------------------------\n`);
}

async function writeFile(targetPath, content) {
    // Safety check: Don't overwrite key system files (simple check)
    if (targetPath.includes('base_wallet.json')) {
        console.log("Error: Modification of wallet file is restricted.");
        return;
    }

    // Auto-Backup
    if (fs.existsSync(targetPath)) {
        const backupPath = `${targetPath}.bak.${Date.now()}`;
        await fs.copy(targetPath, backupPath);
        console.log(`Created backup: ${backupPath}`);
    } else {
        // Ensure directory exists
        await fs.ensureDir(path.dirname(targetPath));
    }

    await fs.writeFile(targetPath, content, 'utf8');
    console.log(`Successfully wrote to: ${targetPath}`);
}

async function listFiles(targetDir) {
    if (!fs.existsSync(targetDir)) {
        console.log(`Error: Directory not found: ${targetDir}`);
        return;
    }
    const files = await fs.readdir(targetDir);
    console.log(`\nFiles in ${targetDir}:`);
    files.forEach(file => console.log(`- ${file}`));
}

async function main() {
    const command = process.argv[2];
    const targetPath = process.argv[3];
    // For write command, content might be the rest of args, but handling spaces is tricky in CLI args passed this way.
    // In a real agent scenario, content is usually passed via file or standard input. 
    // Here we assume simpler usage or that the agent handles quoting.
    const content = process.argv.slice(4).join(' ');

    try {
        if (!targetPath && command !== 'help') {
            console.log("Usage: node coder.js [read|write|list] <path> [content]");
            return;
        }

        switch (command) {
            case 'read':
                await readFile(targetPath);
                break;
            case 'write':
                if (!content) {
                    console.log("Error: Content required for write command.");
                    return;
                }
                await writeFile(targetPath, content);
                break;
            case 'list':
                await listFiles(targetPath);
                break;
            default:
                console.log("Unknown command. Supported: read, write, list");
                console.log("NOTE: Delete command is disabled for safety.");
        }
    } catch (error) {
        console.error("Error:", error.message);
    }
}

main();
