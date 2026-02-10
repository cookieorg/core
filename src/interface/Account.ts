export interface Account {
    email: string
    password: string
    twostepcode?: string
    recoveryEmail?: string
    geoLocale?: 'auto' | string
    langCode?: 'en' | string
    proxy?: AccountProxy
    saveFingerprint?: ConfigSaveFingerprint
}

export interface AccountProxy {
    url: string
    port: number
    username?: string
    password?: string
}

export interface ConfigSaveFingerprint {
    mobile: boolean
    desktop: boolean
}
