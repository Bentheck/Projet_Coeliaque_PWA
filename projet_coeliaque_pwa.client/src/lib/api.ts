export async function fetchJSON<T = any>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const res = await fetch(input, { credentials: "include", ...init });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.url}\n${text}`);
    }
    const ct = res.headers.get("content-type") || "";
    if (res.status === 204) return null as unknown as T;
    if (ct.includes("application/json")) return res.json();
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : (null as unknown as T);
}
