/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
// import axios from "axios"
import { envClient } from "./env"
// import { Logger } from "./log-util"

/**
 * Build REST API request headers with client identification and authentication API-KEY
 */
export function createAuthenticatedHeaders(dict: Record<string, any> = {}): Record<string, any> {
	const headers = {
		ide: envClient.ide,
		"ide-version": envClient.extVersion,
		"ide-real-version": envClient.ideVersion,
		"host-ip": envClient.hostIp,
		"api-key": envClient.apiKey,
		...dict,
	}
	return headers
}
