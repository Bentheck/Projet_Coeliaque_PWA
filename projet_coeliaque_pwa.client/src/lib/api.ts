/**
 * Wrapper around fetch() that always includes credentials,
 * throws on non-OK responses, and attempts JSON parsing.
 *
 * - Returns `null` for HTTP 204 responses.
 * - Parses JSON if content-type indicates it, otherwise tries parsing text as JSON.
 * - Throws with status + body text on HTTP errors for easier debugging.
 */
export async function fetchJSON<T = any>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const res = await fetch(input, { credentials: "include", ...init });

    if (!res.ok) {
        // Capture error body (if available) to make debugging easier
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.url}\n${text}`);
    }

    const ct = res.headers.get("content-type") || "";

    // No content → explicitly return null
    if (res.status === 204) return null as unknown as T;

    // Standard JSON response
    if (ct.includes("application/json")) return res.json();

    // Fallback: parse text as JSON if non-empty
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : (null as unknown as T);
}
