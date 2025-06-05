import * as grpc from "@grpc/grpc-js"
import {
	SyncServiceClient,
	RegisterSyncRequest,
	RegisterSyncResponse,
	ShareAccessTokenRequest,
	ShareAccessTokenResponse,
	UnregisterSyncRequest,
} from "./types/codebase_syncer"

export class GrpcClient {
	private client: SyncServiceClient

	constructor(address = "localhost:50051") {
		this.client = new SyncServiceClient(address, grpc.credentials.createInsecure())
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
}

export const grpcClient = new GrpcClient()
