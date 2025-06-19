import { CookieJar } from "tough-cookie"
import https from "https"
import fetchCookie from "fetch-cookie"

const fetchWithCookies = fetchCookie(fetch, new CookieJar())

export async function silentRefreshToken(url: string) {
	if (!url) return ""

	try {
		const resp = await proxyRequest(url, {
			method: "GET",
			redirect: "manual",
			agent: new https.Agent({
				rejectUnauthorized: false,
			}),
		})

		return resp.url
	} catch (error) {
		console.log(error)
		return ""
	}
}

async function proxyRequest(url: string, opt = {}, maxRedirects = 10) {
	let response
	let redirectCount = 0

	while (redirectCount < maxRedirects) {
		response = await fetchWithCookies(url, {
			...opt,
			redirect: "manual",
		})

		if (response.ok) {
			return response
		} else if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get("Location")
			if (!location) {
				throw new Error("Redirect location not found")
			}
			redirectCount++
			console.log("info", `Redirecting to: ${url} (Count: ${redirectCount})`)
		} else {
			throw new Error(`Request failed with status: ${response.status}`)
		}
	}

	throw new Error("Too many redirects")
}
