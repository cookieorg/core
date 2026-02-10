import { existsSync, mkdirSync, rmSync, createWriteStream } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import axios from 'axios'
import type { AxiosInstance } from 'axios'
import semver from 'semver'
import extractZip from 'extract-zip'
import type { Logger } from '../logging/Logger'

interface UpdateConfig {
    enabled: boolean
    updateSource: string
    assetName?: string
    checkOnStartup: boolean
    includePrerelease: boolean
}

interface ReleaseData {
    tag_name: string
    prerelease: boolean
    assets: Array<{
        name: string
        browser_download_url: string
    }>
}

export class AutoUpdater {
    private logger: Logger
    private axiosInstance: AxiosInstance
    private config: UpdateConfig
    private currentVersion: string
    private projectRoot: string
    private tempDir: string

    constructor(logger: Logger, config: UpdateConfig) {
        this.logger = logger
        this.config = config
        this.projectRoot = path.resolve(__dirname, '../../')
        this.tempDir = path.resolve(this.projectRoot, '.update-temp')

        // Dynamically import package.json
        const pkgPath = path.resolve(this.projectRoot, 'package.json')
        const pkg = require(pkgPath)
        this.currentVersion = pkg.version

        this.axiosInstance = axios.create({
            timeout: 5000, // 5 second timeout to prevent hanging
            headers: { 'User-Agent': 'cookie-core-autoupdater' }
        })
    }

    async checkForUpdates(): Promise<boolean> {
        if (!this.config.enabled) {
            this.logger.info('main', 'AUTO-UPDATE', 'Updates disabled')
            return false
        }

        try {
            this.logger.info('main', 'AUTO-UPDATE', 'Checking for updates...')
            const latestVersion = await this.fetchLatestVersion()

            if (!latestVersion) {
                this.logger.info('main', 'AUTO-UPDATE', 'Could not fetch latest version')
                return false
            }

            const isPrerelease = latestVersion.startsWith('v') && latestVersion.includes('-')
            if (isPrerelease && !this.config.includePrerelease) {
                this.logger.info('main', 'AUTO-UPDATE', `Latest version ${latestVersion} is prerelease, skipping`)
                return false
            }

            const cleanLatest = latestVersion.replace(/^v/, '')
            const cleanCurrent = this.currentVersion.replace(/^v/, '')

            if (semver.gt(cleanLatest, cleanCurrent)) {
                this.logger.warn(
                    'main',
                    'AUTO-UPDATE',
                    `Update available: ${cleanCurrent} → ${cleanLatest}`
                )
                return true
            } else {
                this.logger.info(
                    'main',
                    'AUTO-UPDATE',
                    `Already on latest version (${this.currentVersion})`
                )
                return false
            }
        } catch (error) {
            this.logger.error('main', 'AUTO-UPDATE', new Error(error instanceof Error ? error.message : String(error)))
            return false
        }
    }

    async downloadAndUpdate(): Promise<boolean> {
        try {
            this.logger.info('main', 'AUTO-UPDATE', 'Starting update process...')

            const releaseData = await this.fetchReleaseData()
            if (!releaseData) {
                this.logger.error('main', 'AUTO-UPDATE', 'Failed to fetch release data')
                return false
            }

            const downloadUrl = this.getDownloadUrl(releaseData)
            if (!downloadUrl) {
                this.logger.error('main', 'AUTO-UPDATE', 'No suitable download URL found')
                return false
            }

            // Create temp directory
            if (existsSync(this.tempDir)) {
                rmSync(this.tempDir, { recursive: true, force: true })
            }
            mkdirSync(this.tempDir, { recursive: true })

            this.logger.info('main', 'AUTO-UPDATE', `Downloading update from ${downloadUrl}`)
            await this.downloadFile(downloadUrl, this.tempDir)

            this.logger.info('main', 'AUTO-UPDATE', 'Extracting files...')
            await this.extractUpdate()

            this.logger.info('main', 'AUTO-UPDATE', 'Cleaning up temporary files...')
            this.cleanup()

            this.logger.warn('main', 'AUTO-UPDATE', 'Update completed successfully! Please restart the application.')
            return true
        } catch (error) {
            this.logger.error('main', 'AUTO-UPDATE', new Error(error instanceof Error ? error.message : String(error)))
            this.cleanup()
            return false
        }
    }

    async restartApplication(): Promise<void> {
        this.logger.info('main', 'AUTO-UPDATE', 'Restarting application...')
        await new Promise(resolve => setTimeout(resolve, 1000))

        const isWindows = process.platform === 'win32'

        try {
            if (isWindows) {
                spawn('npm', ['run', 'start'], {
                    cwd: this.projectRoot,
                    stdio: 'inherit',
                    detached: true
                }).unref()
            } else {
                spawn('npm', ['run', 'start'], {
                    cwd: this.projectRoot,
                    stdio: 'inherit',
                    detached: true
                }).unref()
            }

            process.exit(0)
        } catch (error) {
            this.logger.error('main', 'AUTO-UPDATE', new Error(error instanceof Error ? error.message : String(error)))
            process.exit(1)
        }
    }

    private async fetchLatestVersion(): Promise<string | null> {
        try {
            const response = await this.axiosInstance.get<ReleaseData>(this.config.updateSource)
            const tagName = response.data.tag_name

            if (this.config.includePrerelease || !response.data.prerelease) {
                return tagName
            }

            return null
        } catch (error) {
            this.logger.error('main', 'AUTO-UPDATE', new Error(error instanceof Error ? error.message : String(error)))
            return null
        }
    }

    private async fetchReleaseData(): Promise<ReleaseData | null> {
        try {
            const response = await this.axiosInstance.get<ReleaseData>(this.config.updateSource)
            return response.data
        } catch (error) {
            this.logger.error('main', 'AUTO-UPDATE', new Error(error instanceof Error ? error.message : String(error)))
            return null
        }
    }

    private getDownloadUrl(releaseData: ReleaseData): string | null {
        const assetName = this.config.assetName || 'release.zip'

        const asset = releaseData.assets.find(a => a.name === assetName)
        if (asset) {
            return asset.browser_download_url
        }

        // Fallback: get first zip file
        const zipAsset = releaseData.assets.find(a => a.name.endsWith('.zip'))
        return zipAsset?.browser_download_url || null
    }

    private async downloadFile(url: string, destDir: string): Promise<void> {
        const response = await this.axiosInstance.get(url, {
            responseType: 'stream'
        })

        const zipPath = path.join(destDir, 'update.zip')
        const writer = createWriteStream(zipPath)

        return new Promise((resolve, reject) => {
            response.data.pipe(writer)
            writer.on('finish', resolve)
            writer.on('error', reject)
            response.data.on('error', reject)
        })
    }

    private async extractUpdate(): Promise<void> {
        const zipPath = path.join(this.tempDir, 'update.zip')
        
        try {
            await extractZip(zipPath, { dir: this.tempDir })
            this.replaceSourceFiles()
        } catch (error) {
            throw new Error(`Failed to extract ZIP: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    private replaceSourceFiles(): void {
        const sourceDir = path.join(this.tempDir, 'src')
        const distDir = path.join(this.tempDir, 'dist')
        const targetSourceDir = path.join(this.projectRoot, 'src')
        const targetDistDir = path.join(this.projectRoot, 'dist')

        // Replace src directory
        if (existsSync(sourceDir)) {
            if (existsSync(targetSourceDir)) {
                rmSync(targetSourceDir, { recursive: true, force: true })
            }
            this.copyDir(sourceDir, targetSourceDir)
            this.logger.info('main', 'AUTO-UPDATE', 'Updated source files')
        }

        // Replace dist directory if it exists
        if (existsSync(distDir)) {
            if (existsSync(targetDistDir)) {
                rmSync(targetDistDir, { recursive: true, force: true })
            }
            this.copyDir(distDir, targetDistDir)
            this.logger.info('main', 'AUTO-UPDATE', 'Updated compiled files')
        }

        // Replace package.json specifically
        const packageJsonPath = path.join(this.tempDir, 'package.json')
        if (existsSync(packageJsonPath)) {
            rmSync(path.join(this.projectRoot, 'package.json'), { force: true })
            this.copyFile(packageJsonPath, path.join(this.projectRoot, 'package.json'))
            this.logger.info('main', 'AUTO-UPDATE', 'Updated package.json')
        }
    }

    private copyDir(src: string, dest: string): void {
        mkdirSync(dest, { recursive: true })
        const fs = require('fs')
        const entries = fs.readdirSync(src, { withFileTypes: true })

        for (const entry of entries) {
            const srcPath = path.join(src, entry.name)
            const destPath = path.join(dest, entry.name)

            if (entry.isDirectory()) {
                this.copyDir(srcPath, destPath)
            } else {
                this.copyFile(srcPath, destPath)
            }
        }
    }

    private copyFile(src: string, dest: string): void {
        mkdirSync(path.dirname(dest), { recursive: true })
        const fs = require('fs')
        fs.copyFileSync(src, dest)
    }

    private cleanup(): void {
        if (existsSync(this.tempDir)) {
            try {
                rmSync(this.tempDir, { recursive: true, force: true })
                this.logger.info('main', 'AUTO-UPDATE', 'Temporary files cleaned up')
            } catch (error) {
                this.logger.error('main', 'AUTO-UPDATE', new Error(error instanceof Error ? error.message : String(error)))
            }
        }
    }
}
