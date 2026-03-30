import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const SITE_ORIGIN = "https://servicescoeliaque.ca";
const PUBLIC_ROUTES = [
    {
        path: "/fr",
        htmlLang: "fr-CA",
        selectorMarker: 'data-public-page="home"',
        structuredDataType: "Organization",
    },
    {
        path: "/en",
        htmlLang: "en-CA",
        selectorMarker: 'data-public-page="home"',
        structuredDataType: "Organization",
    },
    {
        path: "/fr/faq",
        htmlLang: "fr-CA",
        selectorMarker: 'data-public-page="faq"',
        structuredDataType: "FAQPage",
    },
    {
        path: "/en/faq",
        htmlLang: "en-CA",
        selectorMarker: 'data-public-page="faq"',
        structuredDataType: "FAQPage",
    },
    {
        path: "/fr/contact",
        htmlLang: "fr-CA",
        selectorMarker: 'data-public-page="contact"',
        structuredDataType: "BreadcrumbList",
    },
    {
        path: "/en/contact",
        htmlLang: "en-CA",
        selectorMarker: 'data-public-page="contact"',
        structuredDataType: "BreadcrumbList",
    },
    {
        path: "/fr/terms",
        htmlLang: "fr-CA",
        selectorMarker: 'data-public-page="terms"',
        structuredDataType: "BreadcrumbList",
    },
    {
        path: "/en/terms",
        htmlLang: "en-CA",
        selectorMarker: 'data-public-page="terms"',
        structuredDataType: "BreadcrumbList",
    },
    {
        path: "/fr/privacy",
        htmlLang: "fr-CA",
        selectorMarker: 'data-public-page="privacy"',
        structuredDataType: "BreadcrumbList",
    },
    {
        path: "/en/privacy",
        htmlLang: "en-CA",
        selectorMarker: 'data-public-page="privacy"',
        structuredDataType: "BreadcrumbList",
    },
    {
        path: "/fr/disclaimer",
        htmlLang: "fr-CA",
        selectorMarker: 'data-public-page="disclaimer"',
        structuredDataType: "BreadcrumbList",
    },
    {
        path: "/en/disclaimer",
        htmlLang: "en-CA",
        selectorMarker: 'data-public-page="disclaimer"',
        structuredDataType: "BreadcrumbList",
    },
];
const LEGACY_PUBLIC_REDIRECTS = new Map([
    ["/", "/fr"],
    ["/faq", "/fr/faq"],
    ["/faq/calculateur", "/fr/faq"],
    ["/contact", "/fr/contact"],
    ["/terms", "/fr/terms"],
    ["/privacy", "/fr/privacy"],
    ["/disclaimer", "/fr/disclaimer"],
    ["/legal/disclaimer", "/fr/disclaimer"],
    ["/legal/privacy", "/fr/privacy"],
    ["/legal/tos", "/fr/terms"],
]);
const FLAG_SCRIPT_ID = "__prerender_flags__";
const FLAG_SCRIPT = `<script id="${FLAG_SCRIPT_ID}">window.__PRERENDER__=true;window.__DISABLE_SW__=true;</script>`;
const MIME_TYPES = new Map([
    [".css", "text/css; charset=utf-8"],
    [".html", "text/html; charset=utf-8"],
    [".ico", "image/x-icon"],
    [".jpeg", "image/jpeg"],
    [".jpg", "image/jpeg"],
    [".js", "text/javascript; charset=utf-8"],
    [".json", "application/json; charset=utf-8"],
    [".map", "application/json; charset=utf-8"],
    [".png", "image/png"],
    [".svg", "image/svg+xml"],
    [".txt", "text/plain; charset=utf-8"],
    [".webmanifest", "application/manifest+json; charset=utf-8"],
    [".woff", "font/woff"],
    [".woff2", "font/woff2"],
    [".xml", "application/xml; charset=utf-8"],
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(__dirname, "..");
const distDir = path.join(clientRoot, "dist");
const shellPath = path.join(distDir, "index.html");
const prerenderApiOrigin = process.env.PRERENDER_API_ORIGIN;

if (!prerenderApiOrigin) {
    throw new Error(
        "PRERENDER_API_ORIGIN is required. Example: PRERENDER_API_ORIGIN=https://servicescoeliaque.ca"
    );
}

if (/^https:\/\/(?:localhost|127\.0\.0\.1)/i.test(prerenderApiOrigin)) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

function normalizePathname(pathname) {
    if (!pathname || pathname === "/") return "/";
    return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function stripLocalePrefix(pathname) {
    const match = pathname.match(/^\/(?:fr|en)(\/.*)?$/);
    return match?.[1] ?? "/";
}

function localizePublicPath(locale, pathname) {
    return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
}

function getAlternatesForRoute(routePath) {
    const barePath = stripLocalePrefix(routePath);
    return [
        {
            href: `${SITE_ORIGIN}${localizePublicPath("fr", barePath)}`,
            hrefLang: "fr-CA",
        },
        {
            href: `${SITE_ORIGIN}${localizePublicPath("en", barePath)}`,
            hrefLang: "en-CA",
        },
        {
            href: `${SITE_ORIGIN}${localizePublicPath("fr", barePath)}`,
            hrefLang: "x-default",
        },
    ];
}

function getRouteOutputPath(routePath) {
    const safePath = routePath.replace(/^\/+/, "");
    return path.join(distDir, safePath, "index.html");
}

function getRedirectOutputPath(routePath) {
    const safePath = routePath.replace(/^\/+/, "");
    return path.join(distDir, safePath, "index.html");
}

function isRouteLikeRequest(pathname) {
    return !path.extname(pathname) || pathname.endsWith("/index.html");
}

function injectFlagsIntoShell(html) {
    return html.includes(FLAG_SCRIPT_ID)
        ? html
        : html.replace("</head>", `${FLAG_SCRIPT}</head>`);
}

function createRedirectHtml(sourcePath, targetPath) {
    const canonicalTarget = `${SITE_ORIGIN}${targetPath}`;
    const escapedTarget = targetPath.replace(/"/g, "&quot;");

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>Redirecting...</title>
    <meta name="robots" content="noindex, follow" />
    <meta http-equiv="refresh" content="0; url=${escapedTarget}" />
    <link rel="canonical" href="${canonicalTarget}" />
    <script>
        const target = ${JSON.stringify(targetPath)};
        const next = target + window.location.search + window.location.hash;
        window.location.replace(next);
    </script>
</head>
<body>
    <p>Redirecting from ${sourcePath} to <a href="${escapedTarget}">${escapedTarget}</a>.</p>
</body>
</html>`;
}

function getContentType(filePath) {
    return MIME_TYPES.get(path.extname(filePath).toLowerCase()) ??
        "application/octet-stream";
}

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function serveFile(filePath, res) {
    const body = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": getContentType(filePath) });
    res.end(body);
}

async function proxyRequest(req, res) {
    try {
        const upstreamUrl = new URL(req.url ?? "/", prerenderApiOrigin);
        const upstreamHeaders = new Headers();

        for (const [key, value] of Object.entries(req.headers)) {
            if (!value || key.toLowerCase() === "host") {
                continue;
            }

            if (Array.isArray(value)) {
                upstreamHeaders.set(key, value.join(", "));
                continue;
            }

            upstreamHeaders.set(key, value);
        }

        const upstreamResponse = await fetch(upstreamUrl, {
            method: req.method,
            headers: upstreamHeaders,
            redirect: "manual",
        });
        const responseHeaders = {};

        for (const [key, value] of upstreamResponse.headers) {
            const lowerKey = key.toLowerCase();
            if (
                lowerKey === "connection" ||
                lowerKey === "content-encoding" ||
                lowerKey === "content-length" ||
                lowerKey === "keep-alive" ||
                lowerKey === "transfer-encoding"
            ) {
                continue;
            }

            responseHeaders[key] = value;
        }

        res.writeHead(upstreamResponse.status, responseHeaders);
        res.end(Buffer.from(await upstreamResponse.arrayBuffer()));
    } catch (error) {
        res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`Proxy error: ${error instanceof Error ? error.message : "unknown"}`);
    }
}

async function startPreviewServer() {
    const shellHtml = injectFlagsIntoShell(await fs.readFile(shellPath, "utf8"));

    const server = createServer(async (req, res) => {
        if (!req.url) {
            res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Missing request URL.");
            return;
        }

        const requestUrl = new URL(req.url, "http://127.0.0.1");
        const pathname = normalizePathname(decodeURIComponent(requestUrl.pathname));

        if (pathname.startsWith("/api/") || pathname.startsWith("/recipe-images/")) {
            await proxyRequest(req, res);
            return;
        }

        const redirectTarget = LEGACY_PUBLIC_REDIRECTS.get(pathname);
        if (redirectTarget) {
            res.writeHead(308, { Location: redirectTarget });
            res.end();
            return;
        }

        const localPath = path.join(distDir, pathname.replace(/^\/+/, ""));
        const resolvedLocalPath = path.resolve(localPath);

        if (!resolvedLocalPath.startsWith(path.resolve(distDir))) {
            res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Forbidden.");
            return;
        }

        if (!isRouteLikeRequest(pathname) && await fileExists(resolvedLocalPath)) {
            await serveFile(resolvedLocalPath, res);
            return;
        }

        if (pathname === "/index.html" || isRouteLikeRequest(pathname)) {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(shellHtml);
            return;
        }

        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found.");
    });

    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
        server.close();
        throw new Error("Could not determine preview server address.");
    }

    return {
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
    };
}

function assertCapturedHtml(route, html) {
    const canonicalHref = `${SITE_ORIGIN}${route.path}`;

    if (!html.includes(`<html lang="${route.htmlLang}"`)) {
        throw new Error(`${route.path}: expected html lang ${route.htmlLang}.`);
    }

    if (!html.includes('rel="canonical"') || !html.includes(`href="${canonicalHref}"`)) {
        throw new Error(`${route.path}: missing canonical ${canonicalHref}.`);
    }

    for (const alternate of getAlternatesForRoute(route.path)) {
        if (!html.includes(`href="${alternate.href}"`)) {
            throw new Error(`${route.path}: missing alternate href ${alternate.href}.`);
        }

        if (!html.includes(`hreflang="${alternate.hrefLang}"`)) {
            throw new Error(
                `${route.path}: missing hreflang ${alternate.hrefLang}.`
            );
        }
    }

    if (!html.includes(route.selectorMarker)) {
        throw new Error(`${route.path}: missing page marker ${route.selectorMarker}.`);
    }

    if (!html.includes(`"@type":"${route.structuredDataType}"`)) {
        throw new Error(
            `${route.path}: missing structured data type ${route.structuredDataType}.`
        );
    }
}

async function writeHtmlFile(filePath, html) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, html, "utf8");
}

async function captureRoute(browser, baseUrl, route) {
    const context = await browser.newContext({
        serviceWorkers: "block",
    });

    await context.addInitScript(() => {
        try {
            window.localStorage.clear();
        } catch {
            // ignore
        }

        try {
            window.sessionStorage.clear();
        } catch {
            // ignore
        }
    });

    const page = await context.newPage();
    const pageErrors = [];

    page.on("pageerror", (error) => {
        pageErrors.push(error);
    });

    const response = await page.goto(`${baseUrl}${route.path}`, {
        waitUntil: "domcontentloaded",
    });

    if (!response || response.status() >= 400) {
        await context.close();
        throw new Error(
            `${route.path}: page load failed with status ${response?.status() ?? "unknown"}.`
        );
    }

    await page.waitForFunction(() => {
        const root = document.documentElement;
        return (
            root.getAttribute("data-prerender-ready") === "true" ||
            root.hasAttribute("data-prerender-error")
        );
    }, undefined, { timeout: 60000 });

    const prerenderError = await page.evaluate(() =>
        document.documentElement.getAttribute("data-prerender-error")
    );

    if (prerenderError) {
        await context.close();
        throw new Error(`${route.path}: ${prerenderError}`);
    }

    if (pageErrors.length > 0) {
        const [firstError] = pageErrors;
        await context.close();
        throw new Error(`${route.path}: page error: ${firstError.message}`);
    }

    await page.evaluate((flagScriptId) => {
        document.getElementById(flagScriptId)?.remove();
        document.documentElement.removeAttribute("data-prerender-route");
        document.documentElement.removeAttribute("data-prerender-ready");
        document.documentElement.removeAttribute("data-prerender-error");
    }, FLAG_SCRIPT_ID);

    const rawHtml = await page.content();
    const html = rawHtml.toLowerCase().startsWith("<!doctype html>")
        ? rawHtml
        : `<!DOCTYPE html>\n${rawHtml}`;
    assertCapturedHtml(route, html);
    await writeHtmlFile(getRouteOutputPath(route.path), html);
    await context.close();
}

async function writeLegacyRedirectFallbacks() {
    for (const [sourcePath, targetPath] of LEGACY_PUBLIC_REDIRECTS.entries()) {
        if (sourcePath === "/") {
            continue;
        }

        await writeHtmlFile(
            getRedirectOutputPath(sourcePath),
            createRedirectHtml(sourcePath, targetPath)
        );
    }
}

async function main() {
    if (!await fileExists(shellPath)) {
        throw new Error(
            `Missing build output at ${shellPath}. Run "npm run build" first.`
        );
    }

    const { server, baseUrl } = await startPreviewServer();
    const browser = await chromium.launch({ headless: true });

    try {
        for (const route of PUBLIC_ROUTES) {
            console.log(`Prerendering ${route.path}`);
            await captureRoute(browser, baseUrl, route);
        }

        await writeLegacyRedirectFallbacks();
        console.log(`Prerendered ${PUBLIC_ROUTES.length} public routes.`);
    } finally {
        await browser.close();
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    }
}

await main();
