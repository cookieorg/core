import { BrowserContext } from 'patchright'
import { PlaywrightBlocker } from '@ghostery/adblocker-playwright'
import fetch from 'cross-fetch'

export class AdBlocker {
    private static blocker: any = null 

    static async setupAdBlocking(context: BrowserContext, enabled: boolean = true): Promise<void> {
        if (!enabled) return

        try {
            if (!this.blocker) {
                this.blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)
            }

            // Usamos esta sintaxe para ignorar a verificação de tipo do TS
            // mas manter a execução funcional. 
            // O Ghostery possui esse método internamente para Playwright/Patchright.
            if (this.blocker && typeof this.blocker.enableBlockingInBrowserContext === 'function') {
                await this.blocker.enableBlockingInBrowserContext(context)
            } else {
                // Fallback caso a versão instalada seja muito antiga ou simplificada
                await (this.blocker as any).enableBlockingInPage(context as any)
            }
            
            // Whitelist para Microsoft Rewards
            const whitelist = [
                '@@||bing.com^',
                '@@||microsoft.com^',
                '@@||live.com^'
            ]
            
            // Injeta as regras de whitelist se o motor estiver pronto
            if (this.blocker.engine) {
                this.blocker.engine.updateFilters(whitelist, [])
            }

        } catch (error) {
            // Silencioso para não interromper o fluxo do Browser.ts
            return
        }
    }

    static addCustomDomains(domains: string[]): void {
        if (this.blocker && this.blocker.engine) {
            const rules = domains.map(d => `||${d}^`)
            this.blocker.engine.updateFilters(rules, [])
        }
    }
}