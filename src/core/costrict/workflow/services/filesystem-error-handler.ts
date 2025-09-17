/**
 * Coworkflow 文件系统错误处理服务
 * 提供文件系统错误的专门处理和恢复机制
 */

import * as vscode from "vscode"
import {
	CoworkflowError,
	FileSystemError,
	ErrorLevel,
	ErrorCategory,
	RecoveryStrategy,
	ErrorHandler,
	ErrorRecoverer,
	ErrorContext,
} from "../types/errors"
import { CoworkflowErrorHandlerService } from "./error-handler"

/**
 * 文件系统错误处理配置接口
 */
export interface FileSystemErrorHandlerConfig {
	/** 是否启用自动创建目录 */
	enableAutoCreateDirectory?: boolean
	/** 是否启用自动创建文件 */
	enableAutoCreateFile?: boolean
	/** 是否启用权限检查 */
	enablePermissionCheck?: boolean
	/** 是否启用磁盘空间检查 */
	enableDiskSpaceCheck?: boolean
	/** 最大重试次数 */
	maxRetries?: number
	/** 重试间隔（毫秒） */
	retryInterval?: number
}

/**
 * 默认文件系统错误处理配置
 */
const DEFAULT_FS_CONFIG: Required<FileSystemErrorHandlerConfig> = {
	enableAutoCreateDirectory: true,
	enableAutoCreateFile: true,
	enablePermissionCheck: true,
	enableDiskSpaceCheck: false,
	maxRetries: 3,
	retryInterval: 1000,
}

/**
 * 文件系统操作结果接口
 */
export interface FileSystemOperationResult<T = any> {
	/** 操作是否成功 */
	success: boolean
	/** 结果数据 */
	data?: T
	/** 错误信息 */
	error?: CoworkflowError
	/** 是否使用了回退机制 */
	usedFallback?: boolean
}

/**
 * 文件系统错误处理器类
 */
export class CoworkflowFileSystemErrorHandler implements ErrorHandler, ErrorRecoverer {
	private config: Required<FileSystemErrorHandlerConfig>
	private errorHandler: CoworkflowErrorHandlerService
	private retryCounters: Map<string, number> = new Map()

	constructor(errorHandler: CoworkflowErrorHandlerService, config: FileSystemErrorHandlerConfig = {}) {
		this.config = { ...DEFAULT_FS_CONFIG, ...config }
		this.errorHandler = errorHandler

		// 注册自身到错误处理服务
		this.errorHandler.registerErrorHandler(ErrorCategory.FILE_SYSTEM, this)
		this.errorHandler.registerErrorRecoverer(ErrorCategory.FILE_SYSTEM, this)
	}

	/**
	 * 处理文件系统错误
	 */
	async handleError(error: CoworkflowError): Promise<void> {
		if (!(error instanceof FileSystemError)) {
			return
		}

		const context = error.context
		const { uri, operation } = context

		if (!uri || !operation) {
			return
		}

		// 根据错误类型提供特定的处理建议
		let suggestion = ""
		switch (operation) {
			case "read":
				suggestion = "文件可能不存在或没有读取权限。"
				break
			case "write":
				suggestion = "可能没有写入权限或磁盘空间不足。"
				break
			case "create":
				suggestion = "目录可能不存在或没有创建权限。"
				break
			case "delete":
				suggestion = "文件可能正在使用中或没有删除权限。"
				break
			case "watch":
				suggestion = "文件监视器创建失败，可能影响实时更新功能。"
				break
		}

		// 记录详细的错误信息
		console.error(`文件系统错误 [${operation}]: ${error.message}`, {
			uri: uri.fsPath,
			suggestion,
			recoverable: error.recoverable,
			recoveryStrategy: error.recoveryStrategy,
		})
	}

	/**
	 * 检查是否可以处理指定错误
	 */
	canHandle(error: CoworkflowError): boolean {
		return error instanceof FileSystemError
	}

	/**
	 * 尝试恢复文件系统错误
	 */
	async recover(error: CoworkflowError): Promise<boolean> {
		if (!(error instanceof FileSystemError)) {
			return false
		}

		const context = error.context
		const { uri, operation } = context

		if (!uri || !operation) {
			return false
		}

		const operationKey = `${operation}:${uri.fsPath}`
		const retryCount = this.retryCounters.get(operationKey) || 0

		if (retryCount >= this.config.maxRetries) {
			this.retryCounters.delete(operationKey)
			return false
		}

		this.retryCounters.set(operationKey, retryCount + 1)

		// 等待重试间隔
		await new Promise((resolve) => setTimeout(resolve, this.config.retryInterval))

		try {
			switch (operation) {
				case "read":
					return await this.recoverReadError(uri, error)
				case "write":
					return await this.recoverWriteError(uri, error)
				case "create":
					return await this.recoverCreateError(uri, error)
				case "delete":
					return await this.recoverDeleteError(uri, error)
				case "watch":
					return await this.recoverWatchError(uri, error)
				default:
					return false
			}
		} catch (recoveryError) {
			console.error("恢复操作失败:", recoveryError)
			return false
		}
	}

	/**
	 * 检查是否可以恢复指定错误
	 */
	canRecover(error: CoworkflowError): boolean {
		if (!(error instanceof FileSystemError)) {
			return false
		}

		const context = error.context
		const { operation } = context

		if (!operation) {
			return false
		}

		const operationKey = `${operation}:${error.context.uri?.fsPath || ""}`
		const retryCount = this.retryCounters.get(operationKey) || 0

		return retryCount < this.config.maxRetries && error.recoverable
	}

	/**
	 * 恢复读取错误
	 */
	private async recoverReadError(uri: vscode.Uri, error: FileSystemError): Promise<boolean> {
		try {
			// 检查文件是否存在
			const exists = await this.fileExists(uri)
			if (!exists) {
				if (this.config.enableAutoCreateFile) {
					// 创建空文件
					await vscode.workspace.fs.writeFile(uri, new Uint8Array())
					console.log(`自动创建文件: ${uri.fsPath}`)
					return true
				}
				return false
			}

			// 检查读取权限
			if (this.config.enablePermissionCheck) {
				const hasPermission = await this.checkReadPermission(uri)
				if (!hasPermission) {
					return false
				}
			}

			// 尝试读取文件
			await vscode.workspace.fs.readFile(uri)
			return true
		} catch (recoveryError) {
			console.error("恢复读取错误失败:", recoveryError)
			return false
		}
	}

	/**
	 * 恢复写入错误
	 */
	private async recoverWriteError(uri: vscode.Uri, error: FileSystemError): Promise<boolean> {
		try {
			// 检查目录是否存在
			const dirUri = vscode.Uri.file(uri.fsPath.substring(0, uri.fsPath.lastIndexOf("/")))
			const dirExists = await this.fileExists(dirUri)

			if (!dirExists && this.config.enableAutoCreateDirectory) {
				// 创建目录
				await vscode.workspace.fs.createDirectory(dirUri)
				console.log(`自动创建目录: ${dirUri.fsPath}`)
			}

			// 检查写入权限
			if (this.config.enablePermissionCheck) {
				const hasPermission = await this.checkWritePermission(uri)
				if (!hasPermission) {
					return false
				}
			}

			// 检查磁盘空间
			if (this.config.enableDiskSpaceCheck) {
				const hasSpace = await this.checkDiskSpace(uri)
				if (!hasSpace) {
					return false
				}
			}

			return true
		} catch (recoveryError) {
			console.error("恢复写入错误失败:", recoveryError)
			return false
		}
	}

	/**
	 * 恢复创建错误
	 */
	private async recoverCreateError(uri: vscode.Uri, error: FileSystemError): Promise<boolean> {
		try {
			// 检查父目录是否存在
			const dirUri = vscode.Uri.file(uri.fsPath.substring(0, uri.fsPath.lastIndexOf("/")))
			const dirExists = await this.fileExists(dirUri)

			if (!dirExists && this.config.enableAutoCreateDirectory) {
				// 创建父目录
				await vscode.workspace.fs.createDirectory(dirUri)
				console.log(`自动创建父目录: ${dirUri.fsPath}`)
			}

			// 检查创建权限
			if (this.config.enablePermissionCheck) {
				const hasPermission = await this.checkWritePermission(uri)
				if (!hasPermission) {
					return false
				}
			}

			// 尝试创建文件
			await vscode.workspace.fs.writeFile(uri, new Uint8Array())
			return true
		} catch (recoveryError) {
			console.error("恢复创建错误失败:", recoveryError)
			return false
		}
	}

	/**
	 * 恢复删除错误
	 */
	private async recoverDeleteError(uri: vscode.Uri, error: FileSystemError): Promise<boolean> {
		try {
			// 检查文件是否存在
			const exists = await this.fileExists(uri)
			if (!exists) {
				// 文件不存在，删除操作视为成功
				return true
			}

			// 检查删除权限
			if (this.config.enablePermissionCheck) {
				const hasPermission = await this.checkDeletePermission(uri)
				if (!hasPermission) {
					return false
				}
			}

			// 尝试删除文件
			await vscode.workspace.fs.delete(uri)
			return true
		} catch (recoveryError) {
			console.error("恢复删除错误失败:", recoveryError)
			return false
		}
	}

	/**
	 * 恢复监视错误
	 */
	private async recoverWatchError(uri: vscode.Uri, error: FileSystemError): Promise<boolean> {
		try {
			// 检查文件是否存在
			const exists = await this.fileExists(uri)
			if (!exists) {
				if (this.config.enableAutoCreateFile) {
					// 创建空文件
					await vscode.workspace.fs.writeFile(uri, new Uint8Array())
					console.log(`自动创建文件以恢复监视: ${uri.fsPath}`)
				}
			}

			// 检查目录权限
			const dirUri = vscode.Uri.file(uri.fsPath.substring(0, uri.fsPath.lastIndexOf("/")))
			if (this.config.enablePermissionCheck) {
				const hasPermission = await this.checkReadPermission(dirUri)
				if (!hasPermission) {
					return false
				}
			}

			return true
		} catch (recoveryError) {
			console.error("恢复监视错误失败:", recoveryError)
			return false
		}
	}

	/**
	 * 安全地执行文件系统操作
	 */
	async safeExecute<T>(
		operation: string,
		uri: vscode.Uri,
		fn: () => Promise<T>,
		fallback?: () => Promise<T>,
	): Promise<FileSystemOperationResult<T>> {
		try {
			const result = await fn()
			return {
				success: true,
				data: result,
				usedFallback: false,
			}
		} catch (error) {
			const fsError = new FileSystemError(
				error instanceof Error ? error.message : String(error),
				{ uri, operation },
				RecoveryStrategy.RETRY,
				error instanceof Error ? error : undefined,
			)

			// 尝试恢复
			try {
				await this.errorHandler.handleError(fsError, {
					showToUser: false,
					showDetails: false,
				})

				// 如果有回退函数，尝试使用回退
				if (fallback) {
					try {
						const fallbackResult = await fallback()
						return {
							success: true,
							data: fallbackResult,
							usedFallback: true,
						}
					} catch (fallbackError) {
						return {
							success: false,
							error: new FileSystemError(
								fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
								{ uri, operation },
								RecoveryStrategy.NONE,
								fallbackError instanceof Error ? fallbackError : undefined,
							),
						}
					}
				}
			} catch (handlingError) {
				console.error("错误处理失败:", handlingError)
			}

			return {
				success: false,
				error: fsError,
			}
		}
	}

	/**
	 * 检查文件是否存在
	 */
	private async fileExists(uri: vscode.Uri): Promise<boolean> {
		try {
			await vscode.workspace.fs.stat(uri)
			return true
		} catch {
			return false
		}
	}

	/**
	 * 检查读取权限
	 */
	private async checkReadPermission(uri: vscode.Uri): Promise<boolean> {
		try {
			await vscode.workspace.fs.readFile(uri)
			return true
		} catch {
			return false
		}
	}

	/**
	 * 检查写入权限
	 */
	private async checkWritePermission(uri: vscode.Uri): Promise<boolean> {
		try {
			// 尝试写入一个临时文件来测试权限
			const testUri = vscode.Uri.file(`${uri.fsPath}.tmp`)
			await vscode.workspace.fs.writeFile(testUri, new Uint8Array([0]))
			await vscode.workspace.fs.delete(testUri)
			return true
		} catch {
			return false
		}
	}

	/**
	 * 检查删除权限
	 */
	private async checkDeletePermission(uri: vscode.Uri): Promise<boolean> {
		try {
			// 如果文件不存在，认为有删除权限
			const exists = await this.fileExists(uri)
			if (!exists) {
				return true
			}

			// 尝试删除并恢复文件来测试权限
			const backupUri = vscode.Uri.file(`${uri.fsPath}.backup`)
			await vscode.workspace.fs.rename(uri, backupUri)
			await vscode.workspace.fs.rename(backupUri, uri)
			return true
		} catch {
			return false
		}
	}

	/**
	 * 检查磁盘空间
	 */
	private async checkDiskSpace(uri: vscode.Uri): Promise<boolean> {
		try {
			// 这是一个简化的实现，实际应用中可能需要使用系统特定的 API
			const dirUri = vscode.Uri.file(uri.fsPath.substring(0, uri.fsPath.lastIndexOf("/")))
			const testUri = vscode.Uri.file(`${dirUri.fsPath}/.space_check_${Date.now()}`)

			// 尝试创建一个 1KB 的测试文件
			const testData = new Uint8Array(1024)
			await vscode.workspace.fs.writeFile(testUri, testData)
			await vscode.workspace.fs.delete(testUri)

			return true
		} catch {
			return false
		}
	}

	/**
	 * 重置重试计数器
	 */
	resetRetryCounters(): void {
		this.retryCounters.clear()
	}

	/**
	 * 获取重试统计信息
	 */
	getRetryStats(): { [key: string]: number } {
		const stats: { [key: string]: number } = {}
		this.retryCounters.forEach((count, key) => {
			stats[key] = count
		})
		return stats
	}

	/**
	 * 清理资源
	 */
	dispose(): void {
		this.retryCounters.clear()
	}
}

/**
 * 创建文件系统错误处理器实例
 */
export const createFileSystemErrorHandler = (
	errorHandler: CoworkflowErrorHandlerService,
	config?: FileSystemErrorHandlerConfig,
): CoworkflowFileSystemErrorHandler => {
	return new CoworkflowFileSystemErrorHandler(errorHandler, config)
}
