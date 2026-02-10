import { cpus, totalmem, freemem } from 'os'

export class ClusterOptimizer {
    // Adjusted to use a maximum of 80% of systems resources, made to avoid crashing the host
    private static readonly MAX_CPU_UTILIZATION = 0.8
    private static readonly MAX_MEMORY_UTILIZATION = 0.8

    // Each cluster is estimated to require at least 500MB of memory plus an additional 512MB reserved for the main process
    // Some machines doesn't require that ammount of memory, that depends on the kernel optimizations and how the OS manages memory, but this is a safe baseline to avoid OOM crashes
    private static readonly MIN_MEMORY_PER_CLUSTER_MB = 500
    private static readonly MAIN_PROCESS_MEMORY_MB = 512

    private static readonly MAX_CLUSTERS_PER_ACCOUNT = 2

    public static calculateOptimalClusters(
        accountCount: number,
        providedClusters?: number
    ): number {
        if (providedClusters && providedClusters > 0) {
            return providedClusters
        }

        const cpuLimit = this.getCpuLimit()
        const memoryLimit = this.getMemoryLimit()
        const accountLimit = accountCount * this.MAX_CLUSTERS_PER_ACCOUNT

        return Math.max(
            1,
            Math.min(cpuLimit, memoryLimit, accountLimit)
        )
    }

    private static getCpuLimit(): number {
        const cpuCount = cpus().length
        return Math.max(1, Math.floor(cpuCount * this.MAX_CPU_UTILIZATION))
    }

    private static getMemoryLimit(): number {
        const totalMB = totalmem() / 1024 / 1024
        const freeMB = freemem() / 1024 / 1024

        const usableMB = Math.min(
            totalMB * this.MAX_MEMORY_UTILIZATION,
            freeMB
        )

        const perClusterMB =
            this.MIN_MEMORY_PER_CLUSTER_MB + this.MAIN_PROCESS_MEMORY_MB

        return Math.max(1, Math.floor(usableMB / perClusterMB))
    }

    public static getSystemInfo() {
        return {
            cpuCount: cpus().length,
            totalMemoryMB: Math.floor(totalmem() / 1024 / 1024),
            freeMemoryMB: Math.floor(freemem() / 1024 / 1024)
        }
    }
}
