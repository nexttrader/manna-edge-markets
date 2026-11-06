import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { exec } from 'child_process';
import dotenv from 'dotenv';

// Load existing environment variables
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
}

const REDIRECT_URI = 'https://openapi.ctrader.com';
const OAUTH_TOKEN_URL = 'https://openapi.ctrader.com/apps/token';

const clientId = process.env.CTRADER_CLIENT_ID || '39573_6DFom6Ds6qTufd6UEAeuC95ei5cwKqhbUK8EhJ0AJbuB4oFn36';
const clientSecret = process.env.CTRADER_CLIENT_SECRET || 'QAJOLFHIEK9hYa4jHsDGq9AzwasNo2sUuP52EZYeVd63GqeX6y';
const accountId = process.env.CTRADER_ACCOUNT_ID || '48662843';

function buildAuthUrl(cId: string): string {
    const url = new URL('https://id.ctrader.com/my/settings/openapi/grantingaccess/');
    url.searchParams.set('client_id', cId);
    url.searchParams.set('redirect_uri', REDIRECT_URI);
    url.searchParams.set('scope', 'trading');
    url.searchParams.set('product', 'web');
    return url.toString();
}

function parseRedirectInput(raw: string): { code: string | null; redirectUri: string } {
    const trimmed = raw.trim();
    try {
        const url = new URL(trimmed);
        const code = url.searchParams.get('code') || null;
        // Strip trailing slash if present for standard openapi.ctrader.com, but keep path for playground
        let redirectUri = `${url.origin}${url.pathname}`;
        if (redirectUri.endsWith('/') && redirectUri !== 'https://openapi.ctrader.com/') {
            redirectUri = redirectUri.slice(0, -1);
        }
        return { code, redirectUri };
    } catch {
        let code: string | null = null;
        if (trimmed.startsWith('code=')) {
            code = trimmed.slice(5);
        } else if (trimmed && !trimmed.includes(' ') && !trimmed.includes('?')) {
            code = trimmed;
        }
        return { code, redirectUri: REDIRECT_URI };
    }
}

async function exchangeCodeForTokens(code: string, cId: string, cSecret: string, redirectUri = REDIRECT_URI) {
    const url = new URL(OAUTH_TOKEN_URL);
    url.searchParams.set('grant_type', 'authorization_code');
    url.searchParams.set('code', code);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('client_id', cId);
    url.searchParams.set('client_secret', cSecret);

    const res = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
        throw new Error(`HTTP ${res.status} from cTrader token endpoint: ${await res.text()}`);
    }

    const body = await res.json() as any;
    if (body.errorCode) {
        throw new Error(`${body.errorCode}: ${body.description}`);
    }
    if (!body.accessToken) {
        throw new Error('No accessToken in response: ' + JSON.stringify(body));
    }

    return {
        accessToken: body.accessToken as string,
        refreshToken: body.refreshToken as string,
        expiresIn: body.expiresIn as number,
    };
}

function updateEnvFile(key: string, value: string) {
    if (!fs.existsSync(envPath)) return;
    let content = fs.readFileSync(envPath, 'utf-8');
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
        content = content.replace(regex, `${key}=${value}`);
    } else {
        content += `\n${key}=${value}`;
    }
    fs.writeFileSync(envPath, content, 'utf-8');
}

async function main() {
    console.log('====================================================');
    console.log('   cTrader Open API OAuth Token Generator & Setup   ');
    console.log('====================================================\n');
    console.log(`Using Client ID:     ${clientId}`);
    console.log(`Configured Account:  ${accountId}\n`);

    const authUrl = buildAuthUrl(clientId);

    // Check if code was passed as a command-line argument
    const arg = process.argv[2];
    let code: string | null = null;
    let redirectUri = REDIRECT_URI;

    if (arg) {
        const parsed = parseRedirectInput(arg);
        code = parsed.code;
        redirectUri = parsed.redirectUri;
        if (!code) {
            console.error('❌ Could not extract authorization code from argument:', arg);
            process.exit(1);
        }
    } else {
        console.log('👉 Step 1: Open this authorization link in your browser:');
        console.log(`\n   \x1b[36m${authUrl}\x1b[0m\n`);

        // Try opening the browser automatically on Mac
        if (process.platform === 'darwin') {
            try {
                exec(`open "${authUrl}"`);
                console.log('   (Attempted to automatically open your browser)\n');
            } catch {
                // Ignore open error
            }
        }

        console.log('👉 Step 2: Log in with your cTrader ID and approve access.');
        console.log('👉 Step 3: Your browser will redirect to openapi.ctrader.com/?code=...');
        console.log('          Copy the entire URL from your browser address bar and paste it below:\n');

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        const rawInput = await new Promise<string>((resolve) => {
            rl.question('Paste redirect URL (or code): ', (ans) => {
                rl.close();
                resolve(ans);
            });
        });

        const parsed = parseRedirectInput(rawInput);
        code = parsed.code;
        redirectUri = parsed.redirectUri;
        if (!code) {
            console.error('\n❌ Could not find a valid code in the input.');
            process.exit(1);
        }
    }

    console.log(`\n🔄 Exchanging code for fresh access and refresh tokens (using redirect: ${redirectUri})...`);
    try {
        const tokens = await exchangeCodeForTokens(code, clientId, clientSecret, redirectUri);
        console.log('\n✅ Successfully obtained fresh tokens from cTrader Open API!');

        // Update local .env
        updateEnvFile('CTRADER_ACCESS_TOKEN', tokens.accessToken);
        if (tokens.refreshToken) {
            updateEnvFile('CTRADER_REFRESH_TOKEN', tokens.refreshToken);
        }
        console.log(`💾 Updated local backend/.env file successfully.\n`);

        console.log('----------------------------------------------------');
        console.log('👉 UPDATE RENDER ENVIRONMENT VARIABLES:');
        console.log('   In Render Dashboard -> Your Service -> Environment:');
        console.log('----------------------------------------------------');
        console.log(`CTRADER_ACCESS_TOKEN=${tokens.accessToken}`);
        if (tokens.refreshToken) {
            console.log(`CTRADER_REFRESH_TOKEN=${tokens.refreshToken}`);
        }
        console.log('----------------------------------------------------\n');
        console.log(`Access token valid for ~${Math.round((tokens.expiresIn || 2592000) / 86400)} days.`);
        console.log('Done! Restart the backend or Render deployment to activate.');
    } catch (err: any) {
        console.error('\n❌ Token exchange failed:', err.message);
        process.exit(1);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
