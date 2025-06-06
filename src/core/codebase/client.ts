import * as grpc from "@grpc/grpc-js"
import * as vscode from "vscode"
import * as path from "path"
import getPort, { portNumbers } from "get-port"
import * as fs from "fs"
import fetch from "node-fetch"
import { exec } from "child_process"
import {
	SyncServiceClient,
	RegisterSyncRequest,
	RegisterSyncResponse,
	ShareAccessTokenRequest,
	ShareAccessTokenResponse,
	UnregisterSyncRequest,
	VersionRequest,
	VersionResponse,
} from "./types/codebase_syncer"
import { ClineProvider } from "../webview/ClineProvider"
import { getWorkspacePath } from "../../utils/path"

// API 响应类型定义
interface ReleaseListResponse {
	code: number
	message: string
	data: {
		list: string[]
	}
}

export class ZgsmCodeBaseService {
	private static providerRef: WeakRef<ClineProvider>
	private static _instance: ZgsmCodeBaseService

	private client?: SyncServiceClient
	private registerSyncInterval?: NodeJS.Timeout
	private serverEndpoint = ""
	private accessToken = ""

	get clientId() {
		return vscode.env.machineId
	}

	get workspacePath() {
		return getWorkspacePath()
	}

	get workspaceName() {
		return path.basename(this.workspacePath)
	}

	get platform() {
		switch (process.platform) {
			case "win32":
				return "windows"
			case "darwin":
				return "darwin"
			default:
				return "linux"
		}
	}

	get arch() {
		switch (process.arch) {
			case "ia32":
			case "x64":
				return "amd64"
			default:
				return "arm64"
		}
	}

	public static async setProvider(provider: ClineProvider) {
		ZgsmCodeBaseService.providerRef = new WeakRef(provider)
	}

	public static async getInstance() {
		if (!ZgsmCodeBaseService._instance) {
			return (ZgsmCodeBaseService._instance = new ZgsmCodeBaseService())
		}
		return ZgsmCodeBaseService._instance
	}
	public static async stopSync() {
		const _instance = await ZgsmCodeBaseService.getInstance()

		if (!_instance) return
		_instance.client?.close()
		_instance.unregisterSync()
	}

	setToken(token: string) {
		this.accessToken = token
	}

	/** ====== grpc 通信 ====== */
	async registerSync(request: RegisterSyncRequest): Promise<RegisterSyncResponse> {
		return new Promise((resolve, reject) => {
			if (!this.client) throw new Error("client not init!")
			this.client.registerSync(request, (err: grpc.ServiceError | null, response?: RegisterSyncResponse) => {
				if (err) return reject(err)
				resolve(response!)
			})
		})
	}

	async unregisterSync(
		request: UnregisterSyncRequest = {
			clientId: this.clientId,
			workspacePath: this.workspacePath,
			workspaceName: this.workspaceName,
		},
	): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!this.client) throw new Error("client not init!")
			this.client.unregisterSync(request, (err: grpc.ServiceError | null) => {
				if (err) return reject(err)
				resolve()
			})
		})
	}

	async shareAccessToken(request: ShareAccessTokenRequest): Promise<ShareAccessTokenResponse> {
		return new Promise((resolve, reject) => {
			if (!this.client) throw new Error("client not init!")
			this.client.shareAccessToken(
				request,
				(err: grpc.ServiceError | null, response?: ShareAccessTokenResponse) => {
					if (err) return reject(err)
					resolve(response!)
				},
			)
		})
	}

	async getLocalClientInfo(request: VersionRequest): Promise<VersionResponse> {
		return new Promise((resolve, reject) => {
			if (!this.client) throw new Error("client not init!")
			this.client.getVersion(request, (err: grpc.ServiceError | null, response?: VersionResponse) => {
				if (err) return reject(err)
				resolve(response!)
			})
		})
	}
	/** ====== grpc 通信 ====== */

	/** ====== grpc 客户端获取与更新检测 ====== */

	private async fileExists(path: string): Promise<boolean> {
		try {
			await fs.promises.access(path, fs.constants.F_OK)
			return true
		} catch {
			return false
		}
	}

	// 支持的平台主要是 linux/windows/mac
	private getTargetPath(version: string): { targetDir: string; targetPath: string } {
		const homeDir = this.platform === "windows" ? process.env.USERPROFILE : process.env.HOME
		if (!homeDir) {
			throw new Error("无法确定用户主目录路径")
		}

		const targetDir = path.join(homeDir, ".zgsm", version, `${this.platform}_${this.arch}`)
		const targetPath = path.join(targetDir, `zgsmCodebaseSync${this.platform === "windows" ? ".exe" : ""}`)
		return { targetDir, targetPath }
	}

	public async download(version = "v0.0.1"): Promise<void> {
		const url =
			`http://localhost:8080/codebase-syncer/${version}/${this.platform}_${this.arch}/zgsmCodebaseSync` +
			(this.platform === "windows" ? ".exe" : "")

		// 获取目标路径
		const { targetDir, targetPath } = this.getTargetPath(version)

		// 创建目录（如果不存在）
		await fs.promises.mkdir(targetDir, { recursive: true })

		// 下载文件
		const response = await fetch(url)
		if (!response.ok) {
			throw new Error(`下载失败: ${response.statusText}`)
		}

		const blob = await response.blob()
		const arrayBuffer = await blob.arrayBuffer()
		const buffer = Buffer.from(arrayBuffer)

		// 保存文件
		await fs.promises.writeFile(targetPath, buffer)
		// 只在非Windows平台设置可执行权限
		if (this.platform !== "windows") {
			await fs.promises.chmod(targetPath, 0o755)
		}

		// 1. 检查并关闭旧进程
		if (await this.isProcessRunning()) {
			await this.killProcess()
		}
	}

	// 检查是否需要下载更新grpc客户端
	public async updateCheck() {
		const provider = ZgsmCodeBaseService.providerRef.deref()

		if (!provider) throw new Error("provider not init!")

		const url = "http://localhost:8080/codebase-syncer/release.json"
		const response = await fetch(url)
		const json = (await response.json()) as ReleaseListResponse

		if (json.code !== 0 || !json.data?.list?.length) {
			throw new Error("无法获取可用版本列表")
		}

		const remoteVersions = json.data.list
		const latestVersion = remoteVersions[remoteVersions.length - 1]
		const { targetDir } = await this.getTargetPath(latestVersion)

		return { updated: await this.fileExists(targetDir), version: latestVersion }
	}

	/** ====== grpc 客户端获取与更新检测 ====== */

	/** ====== 进程管理 ====== */
	private async isProcessRunning(processName = "zgsmCodebaseSync"): Promise<boolean> {
		try {
			if (this.platform === "windows") {
				// const { exec } = await import("child_process");
				const isRunning = await new Promise<boolean>((resolve) => {
					exec(`tasklist /FI "IMAGENAME eq ${processName}.exe"`, (err, stdout, stderr) => {
						if (err) {
							console.warn(`Process check error: ${stderr}`)
							resolve(false)
						} else {
							resolve(stdout.toLowerCase().includes(processName.toLowerCase()))
						}
					})
				})
				return isRunning
			} else {
				// const { exec } = await import("child_process");
				const isRunning = await new Promise<boolean>((resolve) => {
					exec(`pgrep -f ${processName}`, (err, stdout, stderr) => {
						if (err) {
							// Exit code 1 means no matching processes found
							if (err.code === 1) {
								resolve(false)
							} else {
								console.warn(`Process check error: ${stderr}`)
								resolve(false)
							}
						} else {
							resolve(!!stdout.toString().trim())
						}
					})
				})
				return isRunning
			}
		} catch (err) {
			console.warn(`Process check failed: ${err}`)
			return false
		}
	}

	public async killProcess(processName = "zgsmCodebaseSync"): Promise<void> {
		try {
			if (this.platform === "windows") {
				// const { exec } = await import("child_process");
				await new Promise((resolve) => {
					exec(`taskkill /IM ${processName}.exe /F`, resolve)
				})
			} else {
				// const { exec } = await import("child_process");
				await new Promise((resolve) => {
					exec(`pkill -f ${processName} || true`, resolve) // 加上||true避免进程不存在时报错
				})
			}
		} catch (err) {
			console.error(`关闭进程失败: ${err}`)
		}
	}

	// 2. 启动新进程，带重试机制
	public async startProcess(version: string, maxRetries = 5): Promise<void> {
		let attempts = 0
		// const { exec } = await import("child_process");

		const { targetPath } = this.getTargetPath(version)

		while (attempts < maxRetries) {
			attempts++
			try {
				const processOptions = {
					detached: true,
					stdio: "ignore" as const,
					encoding: "utf8" as const,
				}
				const port = await getPort({ port: portNumbers(50051, 65535) })
				const serverEndpoint = `localhost:${port}`

				const command =
					this.platform === "windows"
						? `"${targetPath}" -grpc ${serverEndpoint}`
						: `${targetPath} -grpc ${serverEndpoint}`
				const process = exec(command, processOptions)
				process.unref()

				// 稍等一会检查进程是否还在运行
				await new Promise((resolve) => setTimeout(resolve, attempts * 1000))
				const isRunning = await this.isProcessRunning()
				this.serverEndpoint = serverEndpoint
				if (isRunning) return
			} catch (err) {
				console.error(`启动进程失败(尝试 ${attempts}/${maxRetries}): ${err}`)
				if (attempts >= maxRetries) {
					throw new Error(`超过最大重试次数(${maxRetries})，启动失败`)
				}
			}
		}
	}

	public async startSync(version: string): Promise<void> {
		this.stopRegisterSyncPoll()
		await this.killProcess()
		await this.startProcess(version)
		this.client?.close()
		this.client = new SyncServiceClient(this.serverEndpoint, grpc.credentials.createInsecure())
		this.client.waitForReady(1000, async () => {
			await this.shareAccessToken({
				accessToken: this.accessToken,
				clientId: this.clientId,
				serverEndpoint: this.serverEndpoint,
			})
			this.registerSync({
				clientId: this.clientId,
				workspacePath: this.workspacePath,
				workspaceName: this.workspaceName,
			})
			this.registerSyncPoll()
		})
	}

	registerSyncPoll() {
		this.registerSyncInterval = setInterval(
			() => {
				this.registerSync({
					clientId: this.clientId,
					workspacePath: this.workspacePath,
					workspaceName: this.workspaceName,
				})
			},
			1000 * 60 * 4,
		)
	}

	stopRegisterSyncPoll() {
		clearInterval(this.registerSyncInterval)
	}
	/** ====== grpc 客户端获取与更新检测 ====== */
}
