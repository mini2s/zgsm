import * as grpc from "@grpc/grpc-js"
import * as vscode from "vscode"
import * as path from "path"
import getPort, { portNumbers } from "get-port"

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

export class ZgsmCodeBaseGrpcClient {
	private static providerRef: WeakRef<ClineProvider>
	private static _instance: ZgsmCodeBaseGrpcClient

	private client: SyncServiceClient
	private address: string
	private token = ""

	constructor(address = "localhost:50051") {
		this.address = address
		this.client = new SyncServiceClient(address, grpc.credentials.createInsecure())
	}

	get client_id() {
		return vscode.env.machineId
	}

	get project_path() {
		return getWorkspacePath()
	}

	get project_name() {
		return path.basename(this.project_path)
	}

	public static async setProvider(provider: ClineProvider) {
		ZgsmCodeBaseGrpcClient.providerRef = new WeakRef(provider)
	}

	public static async getInstance() {
		if (ZgsmCodeBaseGrpcClient._instance) {
			const port = await getPort({ port: portNumbers(50051, 65535) })
			return (ZgsmCodeBaseGrpcClient._instance = new ZgsmCodeBaseGrpcClient(`localhost:${port}`))
		}
		return ZgsmCodeBaseGrpcClient._instance
	}

	// // eslint-disable-next-line @typescript-eslint/no-unused-vars
	// initiateCodebase(token: string) {
	// 	this.token = token

	// }

	setToken(token: string) {
		this.token = token
	}

	async registerSync(request: RegisterSyncRequest): Promise<RegisterSyncResponse> {
		return new Promise((resolve, reject) => {
			this.client.registerSync(request, (err: grpc.ServiceError | null, response?: RegisterSyncResponse) => {
				if (err) return reject(err)
				resolve(response!)
			})
		})
	}

	async unregisterSync(request: UnregisterSyncRequest): Promise<void> {
		return new Promise((resolve, reject) => {
			this.client.unregisterSync(request, (err: grpc.ServiceError | null) => {
				if (err) return reject(err)
				resolve()
			})
		})
	}

	async shareAccessToken(request: ShareAccessTokenRequest): Promise<ShareAccessTokenResponse> {
		return new Promise((resolve, reject) => {
			this.client.shareAccessToken(
				request,
				(err: grpc.ServiceError | null, response?: ShareAccessTokenResponse) => {
					if (err) return reject(err)
					resolve(response!)
				},
			)
		})
	}

	async getVersion(request: VersionRequest): Promise<VersionResponse> {
		return new Promise((resolve, reject) => {
			this.client.getVersion(request, (err: grpc.ServiceError | null, response?: VersionResponse) => {
				if (err) return reject(err)
				resolve(response!)
			})
		})
	}

	// todo: 获取更新
	async getUpdates(): Promise<void> {}
}

// export const ZgsmCodeBaseGrpcClient = new ZgsmCodeBaseGrpcClient()
