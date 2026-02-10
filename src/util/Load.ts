import type { Cookie } from 'patchright'
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator'
import fs from 'fs'
import path from 'path'

import type { Account, ConfigSaveFingerprint } from '../interface/Account'
import type { Config } from '../interface/Config'
import { validateAccounts, validateConfig } from './Validator'

let configCache: Config

function mergeAllowedConfig(defaultCfg: Config, userCfg: any): Config {
    const merged: any = JSON.parse(JSON.stringify(defaultCfg))

    // Allow overriding of headless
    if (typeof userCfg?.headless !== 'undefined') {
        merged.headless = !!userCfg.headless
    }

    // Allow overriding of clusters
    if (userCfg?.clusters) {
        merged.clusters = userCfg.clusters
    }

    // Allow overriding of globalTimeout
    if (userCfg?.globalTimeout) {
        merged.globalTimeout = userCfg.globalTimeout
    }

    // Allow overriding of workers
    if (userCfg?.workers && typeof userCfg.workers === 'object') {
        merged.workers = { ...merged.workers, ...userCfg.workers }
    }

    // Allow overriding of searchSettings
    if (userCfg?.searchSettings && typeof userCfg.searchSettings === 'object') {
        merged.searchSettings = merged.searchSettings || {}
        
        if (typeof userCfg.searchSettings.scrollRandomResults !== 'undefined') {
            merged.searchSettings.scrollRandomResults = !!userCfg.searchSettings.scrollRandomResults
        }
        if (typeof userCfg.searchSettings.clickRandomResults !== 'undefined') {
            merged.searchSettings.clickRandomResults = !!userCfg.searchSettings.clickRandomResults
        }
        if (typeof userCfg.searchSettings.parallelSearching !== 'undefined') {
            merged.searchSettings.parallelSearching = !!userCfg.searchSettings.parallelSearching
        }
        if (Array.isArray(userCfg.searchSettings.queryEngines)) {
            merged.searchSettings.queryEngines = userCfg.searchSettings.queryEngines
        }
        if (userCfg.searchSettings.searchResultVisitTime) {
            merged.searchSettings.searchResultVisitTime = userCfg.searchSettings.searchResultVisitTime
        }
        
        if (userCfg.searchSettings.searchDelay) {
            merged.searchSettings.searchDelay = merged.searchSettings.searchDelay || {}
            if (userCfg.searchSettings.searchDelay.min) merged.searchSettings.searchDelay.min = userCfg.searchSettings.searchDelay.min
            if (userCfg.searchSettings.searchDelay.max) merged.searchSettings.searchDelay.max = userCfg.searchSettings.searchDelay.max
        }
        
        if (userCfg.searchSettings.readDelay) {
            merged.searchSettings.readDelay = merged.searchSettings.readDelay || {}
            if (userCfg.searchSettings.readDelay.min) merged.searchSettings.readDelay.min = userCfg.searchSettings.readDelay.min
            if (userCfg.searchSettings.readDelay.max) merged.searchSettings.readDelay.max = userCfg.searchSettings.readDelay.max
        }
    }

    // Allow overriding of autoUpdate
    if (userCfg?.autoUpdate && typeof userCfg.autoUpdate === 'object') {
        merged.autoUpdate = { ...merged.autoUpdate, ...userCfg.autoUpdate }
    }

    // Allow overriding of adBlock
    if (userCfg?.adBlock && typeof userCfg.adBlock === 'object') {
        merged.adBlock = { ...merged.adBlock, ...userCfg.adBlock }
    }

    // Allow overriding of proxy.queryEngine
    if (userCfg?.proxy && typeof userCfg.proxy.queryEngine !== 'undefined') {
        merged.proxy = merged.proxy || {}
        merged.proxy.queryEngine = !!userCfg.proxy.queryEngine
    }

    // Allow overriding webhook settings (discord & ntfy)
    if (userCfg?.webhook) {
        merged.webhook = merged.webhook || {}
        if (userCfg.webhook.discord) {
            merged.webhook.discord = merged.webhook.discord || {}
            if (typeof userCfg.webhook.discord.enabled !== 'undefined') merged.webhook.discord.enabled = !!userCfg.webhook.discord.enabled
            if (typeof userCfg.webhook.discord.url === 'string') merged.webhook.discord.url = userCfg.webhook.discord.url
        }
        if (userCfg.webhook.ntfy) {
            merged.webhook.ntfy = merged.webhook.ntfy || {}
            if (typeof userCfg.webhook.ntfy.enabled !== 'undefined') merged.webhook.ntfy.enabled = !!userCfg.webhook.ntfy.enabled
            if (typeof userCfg.webhook.ntfy.url === 'string') merged.webhook.ntfy.url = userCfg.webhook.ntfy.url
            if (typeof userCfg.webhook.ntfy.topic === 'string') merged.webhook.ntfy.topic = userCfg.webhook.ntfy.topic
            if (typeof userCfg.webhook.ntfy.token === 'string') merged.webhook.ntfy.token = userCfg.webhook.ntfy.token
            if (typeof userCfg.webhook.ntfy.title === 'string') merged.webhook.ntfy.title = userCfg.webhook.ntfy.title
            if (Array.isArray(userCfg.webhook.ntfy.tags)) merged.webhook.ntfy.tags = userCfg.webhook.ntfy.tags
            if (typeof userCfg.webhook.ntfy.priority !== 'undefined') merged.webhook.ntfy.priority = userCfg.webhook.ntfy.priority
        }
    }

    return merged as Config
}

/**
 * Carrega a configuração da aplicação (workers, timeouts, webhooks, logs, etc)
 * Logic: embedded `app.config.json` (inside bundle) is default. If an external
 * `config.jsonc` or `config.json` exists in the current working directory, only
 * merge allowed fields from it (headless, clusters, globalTimeout, workers, etc).
 */
export function loadAppConfig(): Config {
    try {
        if (configCache) {
            return configCache
        }

        // Embedded default (packaged with the app/bundle)
        const embeddedPath = path.join(__dirname, '../', 'app.config.json')
        let embeddedCfg: Config
        if (fs.existsSync(embeddedPath)) {
            embeddedCfg = JSON.parse(fs.readFileSync(embeddedPath, 'utf-8'))
        } else {
            // Fallback to embedded config.json if app.config.json missing
            const fallback = path.join(__dirname, '../', 'config.json')
            embeddedCfg = JSON.parse(fs.readFileSync(fallback, 'utf-8'))
        }

        // External user config (outside dist/bundle) - try .jsonc first, then .json
        const externalJsoncPath = path.join(process.cwd(), 'config.jsonc')
        const externalJsonPath = path.join(process.cwd(), 'config.json')
        let finalCfg: Config = embeddedCfg
        
        let userCfgPath: string | null = null
        if (fs.existsSync(externalJsoncPath)) {
            userCfgPath = externalJsoncPath
        } else if (fs.existsSync(externalJsonPath)) {
            userCfgPath = externalJsonPath
        }
        
        if (userCfgPath) {
            const userCfgContent = fs.readFileSync(userCfgPath, 'utf-8')
            // Remove comments if it's a JSONC file
            const cleanedUserCfg = userCfgContent
                .replace(/\/\/.*$/gm, '')            // Remove // comments
                .replace(/\/\*[\s\S]*?\*\//g, '')    // Remove /* */ comments
            const userCfg = JSON.parse(cleanedUserCfg)
            finalCfg = mergeAllowedConfig(embeddedCfg, userCfg)
        }

        validateConfig(finalCfg)
        configCache = finalCfg
        return finalCfg
    } catch (error) {
        throw new Error(error as string)
    }
}

/**
 * Compat wrapper (preserve old API)
 */
export function loadConfig(): Config {
    return loadAppConfig()
}

/**
 * Carrega as contas do usuário (emails, senhas, proxies, geolocale, etc)
 * Prefer external file in process.cwd() (.jsonc first, then .json), fallback to embedded.
 * Automatically sets `saveFingerprint` to { mobile: true, desktop: true }
 * Sanitizes empty/blank fields (twostepcode, proxy) to undefined for production
 */
export function loadAccounts(): Account[] {
    try {
        let file = 'accounts.json'

        if (process.argv.includes('-dev')) {
            file = 'accounts.dev.json'
        }

        // Try .jsonc first (with comments), then .json
        const externalJsoncPath = path.join(process.cwd(), file.replace('.json', '.jsonc'))
        const externalJsonPath = path.join(process.cwd(), file)
        const embeddedPath = path.join(__dirname, '../', file)

        let accountDir: string
        if (fs.existsSync(externalJsoncPath)) {
            accountDir = externalJsoncPath
        } else if (fs.existsSync(externalJsonPath)) {
            accountDir = externalJsonPath
        } else {
            accountDir = embeddedPath
        }

        const accounts = fs.readFileSync(accountDir, 'utf-8')
        // Remove comments if it's a JSONC file
        const cleanedAccounts = accounts.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
        const accountsData: Account[] = JSON.parse(cleanedAccounts)

        // Sanitize and set defaults
        for (const acc of accountsData) {
            // Always set saveFingerprint to true
            acc.saveFingerprint = { mobile: true, desktop: true }

            // Clear empty twostepcode
            if (!acc.twostepcode || acc.twostepcode.trim() === '') {
                acc.twostepcode = undefined
            }

            // Clear empty proxy
            if (!acc.proxy?.url || acc.proxy.url.trim() === '') {
                acc.proxy = undefined
            }

            // Clear empty geoLocale
            if (!acc.geoLocale || acc.geoLocale.trim() === '') {
                acc.geoLocale = undefined
            }

            // Clear empty langCode
            if (!acc.langCode || acc.langCode.trim() === '') {
                acc.langCode = undefined
            }

            // Clear empty recoveryEmail
            if (!acc.recoveryEmail || acc.recoveryEmail.trim() === '') {
                acc.recoveryEmail = undefined
            }
        }

        validateAccounts(accountsData)
        return accountsData
    } catch (error) {
        throw new Error(error as string)
    }
}

export async function loadSessionData(
    sessionPath: string,
    email: string,
    saveFingerprint: ConfigSaveFingerprint,
    isMobile: boolean
) {
    try {
        const cookiesFileName = isMobile ? 'session_mobile.json' : 'session_desktop.json'
        const cookieFile = path.join(__dirname, '../browser/', sessionPath, email, cookiesFileName)

        let cookies: Cookie[] = []
        if (fs.existsSync(cookieFile)) {
            const cookiesData = await fs.promises.readFile(cookieFile, 'utf-8')
            cookies = JSON.parse(cookiesData)
        }

        const fingerprintFileName = isMobile ? 'session_fingerprint_mobile.json' : 'session_fingerprint_desktop.json'
        const fingerprintFile = path.join(__dirname, '../browser/', sessionPath, email, fingerprintFileName)

        let fingerprint!: BrowserFingerprintWithHeaders
        const shouldLoadFingerprint = isMobile ? saveFingerprint.mobile : saveFingerprint.desktop
        if (shouldLoadFingerprint && fs.existsSync(fingerprintFile)) {
            const fingerprintData = await fs.promises.readFile(fingerprintFile, 'utf-8')
            fingerprint = JSON.parse(fingerprintData)
        }

        return {
            cookies: cookies,
            fingerprint: fingerprint
        }
    } catch (error) {
        throw new Error(error as string)
    }
}

export async function saveSessionData(
    sessionPath: string,
    cookies: Cookie[],
    email: string,
    isMobile: boolean
): Promise<string> {
    try {
        const sessionDir = path.join(__dirname, '../browser/', sessionPath, email)
        const cookiesFileName = isMobile ? 'session_mobile.json' : 'session_desktop.json'

        if (!fs.existsSync(sessionDir)) {
            await fs.promises.mkdir(sessionDir, { recursive: true })
        }

        await fs.promises.writeFile(path.join(sessionDir, cookiesFileName), JSON.stringify(cookies))

        return sessionDir
    } catch (error) {
        throw new Error(error as string)
    }
}

export async function saveFingerprintData(
    sessionPath: string,
    email: string,
    isMobile: boolean,
    fingerpint: BrowserFingerprintWithHeaders
): Promise<string> {
    try {
        const sessionDir = path.join(__dirname, '../browser/', sessionPath, email)
        const fingerprintFileName = isMobile ? 'session_fingerprint_mobile.json' : 'session_fingerprint_desktop.json'

        if (!fs.existsSync(sessionDir)) {
            await fs.promises.mkdir(sessionDir, { recursive: true })
        }

        await fs.promises.writeFile(path.join(sessionDir, fingerprintFileName), JSON.stringify(fingerpint))

        return sessionDir
    } catch (error) {
        throw new Error(error as string)
    }
}
