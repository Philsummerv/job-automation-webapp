import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import zlib from "node:zlib";
import type { LookupFunction } from "node:net";
import { capText, decodeEntities, htmlToText } from "@/lib/jobs/html";

// Fetches a job page from a URL the user pasted. This is the one place the
// server fetches an arbitrary URL, so it is locked down against SSRF:
//
//  - http/https only, default ports only (80/443), no user:pass@ in the URL.
//  - The IP is checked AT CONNECT TIME through a custom DNS lookup, so a
//    hostname can't resolve to a public IP during a pre-check and a private
//    one for the real request (DNS rebinding). Every resolved address must be
//    public; loopback, private, link-local (incl. 169.254.169.254 metadata),
//    CGNAT, multicast, reserved, and their IPv6 / IPv4-mapped forms are refused.
//  - Redirects are followed by hand (max 3), and each hop goes through the
//    same checks.
//  - 10 second overall timeout, 2MB cap on the (decompressed) body.
//  - Only text/html, text/plain or JSON-LD-ish responses are read.
//
// Requires the Node.js runtime (not Edge). Route handlers using this must not
// set `export const runtime = "edge"`.

export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
/** Text handed back to the caller (and later the model) is capped at this. */
export const MAX_TEXT_CHARS = 30_000;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export class FetchPageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchPageError";
  }
}

export interface FetchedJobPage {
  /** Final URL after redirects. */
  url: string;
  title?: string;
  company?: string;
  /** Plain text, HTML stripped, capped at MAX_TEXT_CHARS. */
  text: string;
}

// ─── Address blocklist ──────────────────────────────────────────────────────

const blocked = new net.BlockList();
// IPv4
for (const [addr, prefix] of [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
] as const) {
  blocked.addSubnet(addr, prefix, "ipv4");
}
// IPv6
for (const [addr, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  // NOTE: no ::ffff:0:0/96 rule. Node's BlockList applies it to plain IPv4
  // addresses too, which would block every public v4 address. IPv4-mapped
  // forms are handled in isBlockedAddress by checking the embedded v4.
  ["64:ff9b::", 96], // NAT64 (embeds v4)
  ["100::", 64], // discard
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 (embeds v4)
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // old site-local
  ["ff00::", 8], // multicast
] as const) {
  blocked.addSubnet(addr, prefix, "ipv6");
}

/** True when `ip` must never be contacted. Unknown formats count as blocked. */
export function isBlockedAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return blocked.check(ip, "ipv4");
  if (family === 6) {
    // IPv4-mapped / embedded forms: check the embedded v4 address as well.
    const m = ip.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (m && blocked.check(m[1], "ipv4")) return true;
    return blocked.check(ip, "ipv6");
  }
  return true;
}

/** DNS lookup that refuses any blocked address. Used at connect time. */
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as dns.LookupAddress[];
    if (!list.length) {
      return callback(new UnsafeUrlError("That address didn't resolve."), "", 0);
    }
    if (list.some((a) => isBlockedAddress(a.address))) {
      return callback(
        new UnsafeUrlError("That address points to a private network and can't be fetched."),
        "",
        0,
      );
    }
    if ((options as { all?: boolean }).all) {
      return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    }
    callback(null, list[0].address, list[0].family);
  });
};

/** Validates a URL string before any network use. Returns the parsed URL. */
export function assertSafeUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError("That doesn't look like a web address.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https links can be fetched.");
  }
  if (u.username || u.password) {
    throw new UnsafeUrlError("Links with a username or password can't be fetched.");
  }
  if (u.port && u.port !== "80" && u.port !== "443") {
    throw new UnsafeUrlError("Only links on the standard web ports can be fetched.");
  }
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new UnsafeUrlError("That address points to a private network and can't be fetched.");
  }
  // IP literals are checked right away (the lookup would catch them too).
  if (net.isIP(host) && isBlockedAddress(host)) {
    throw new UnsafeUrlError("That address points to a private network and can't be fetched.");
  }
  return u;
}

// ─── One request ────────────────────────────────────────────────────────────

interface RawResponse {
  status: number;
  location?: string;
  contentType: string;
  body: Buffer;
}

function requestOnce(u: URL, deadline: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new FetchPageError("The page took too long to load."));

    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request(
      u,
      {
        method: "GET",
        lookup: safeLookup,
        // A fresh socket per request, so the lookup always runs.
        agent: false,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; JobAssistUI/1.0; +https://www.jobassistui.com)",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en-US,en;q=0.8",
        },
        timeout: remaining,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({
            status,
            location: res.headers.location,
            contentType,
            body: Buffer.alloc(0),
          });
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > MAX_BYTES * 4) {
          res.destroy();
          return reject(new FetchPageError("That page is too large to read."));
        }

        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        if (enc === "gzip" || enc === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
        else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());

        const chunks: Buffer[] = [];
        let size = 0;
        let done = false;
        const finish = (err?: Error) => {
          if (done) return;
          done = true;
          if (err) return reject(err);
          resolve({ status, contentType, body: Buffer.concat(chunks) });
        };
        stream.on("data", (c: Buffer) => {
          if (done) return;
          size += c.length;
          if (size > MAX_BYTES) {
            // Keep what we have; a job description is near the top anyway.
            const over = size - MAX_BYTES;
            chunks.push(c.subarray(0, c.length - over));
            res.destroy();
            finish();
            return;
          }
          chunks.push(c);
        });
        stream.on("end", () => finish());
        stream.on("error", (e: Error) =>
          finish(done ? undefined : new FetchPageError(`Couldn't read the page (${e.message}).`)),
        );
      },
    );
    // `timeout` above is an idle timeout; this one caps the whole request.
    const timer = setTimeout(() => {
      req.destroy(new FetchPageError("The page took too long to load."));
    }, remaining);
    req.on("close", () => clearTimeout(timer));
    req.on("timeout", () => {
      req.destroy(new FetchPageError("The page took too long to load."));
    });
    req.on("error", (e) => {
      if (e instanceof UnsafeUrlError || e instanceof FetchPageError) return reject(e);
      reject(new FetchPageError(`Couldn't load that page (${(e as NodeJS.ErrnoException).code ?? e.message}).`));
    });
    req.end();
  });
}

// ─── Page parsing ───────────────────────────────────────────────────────────

function metaContent(html: string, key: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
    "i",
  );
  const m = html.match(re);
  const v = m?.[1] ?? m?.[2];
  return v ? decodeEntities(v).trim() || undefined : undefined;
}

interface LdJobPosting {
  title?: string;
  description?: string;
  hiringOrganization?: { name?: string } | string;
}

/** Finds a schema.org JobPosting in JSON-LD, if the page has one. */
function findJsonLdJob(html: string): LdJobPosting | null {
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const s of scripts) {
    try {
      const parsed: unknown = JSON.parse(s[1].trim());
      const stack: unknown[] = [parsed];
      while (stack.length) {
        const node = stack.pop();
        if (Array.isArray(node)) {
          stack.push(...node);
        } else if (node && typeof node === "object") {
          const o = node as Record<string, unknown>;
          const t = o["@type"];
          if (t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"))) {
            return o as LdJobPosting;
          }
          if (o["@graph"]) stack.push(o["@graph"]);
        }
      }
    } catch {
      // Bad JSON-LD is common; ignore it.
    }
  }
  return null;
}

function parsePage(finalUrl: string, contentType: string, body: Buffer): FetchedJobPage {
  const raw = body.toString("utf8");
  if (/text\/plain/i.test(contentType)) {
    return { url: finalUrl, text: capText(raw.trim(), MAX_TEXT_CHARS) };
  }

  const ld = findJsonLdJob(raw);
  const titleTag = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title =
    ld?.title?.trim() ||
    metaContent(raw, "og:title") ||
    (titleTag ? decodeEntities(titleTag).replace(/\s+/g, " ").trim() : undefined);
  const company =
    (typeof ld?.hiringOrganization === "object"
      ? ld.hiringOrganization?.name
      : ld?.hiringOrganization) ||
    metaContent(raw, "og:site_name") ||
    undefined;

  const ldText = ld?.description ? htmlToText(ld.description) : "";
  const bodyHtml = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? raw;
  const pageText = htmlToText(bodyHtml);
  // Prefer the structured description when it's substantial; it skips nav,
  // cookie banners and footers.
  const text = ldText.length >= 300 ? ldText : pageText.length > ldText.length ? pageText : ldText;

  return {
    url: finalUrl,
    title: title ? capText(title, 300) : undefined,
    company: company ? capText(String(company), 200) : undefined,
    text: capText(text, MAX_TEXT_CHARS),
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetches a user-pasted job URL safely and returns its readable text.
 * Throws UnsafeUrlError (blocked address / bad URL) or FetchPageError
 * (network, timeout, wrong content type, empty page). Both have messages
 * that are safe to show the user.
 */
export async function safeFetchJobPage(rawUrl: string): Promise<FetchedJobPage> {
  const deadline = Date.now() + FETCH_TIMEOUT_MS;
  let current = assertSafeUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await requestOnce(current, deadline);

    if (res.status >= 300 && res.status < 400) {
      if (!res.location) throw new FetchPageError("The page redirected nowhere.");
      if (hop === MAX_REDIRECTS) throw new FetchPageError("The page redirected too many times.");
      current = assertSafeUrl(new URL(res.location, current).toString());
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new FetchPageError(
        "That site blocked us from reading the page. Copy the job text and paste it instead.",
      );
    }
    if (res.status === 404 || res.status === 410) {
      throw new FetchPageError("That job page wasn't found. It may have been taken down.");
    }
    if (res.status < 200 || res.status >= 300) {
      throw new FetchPageError(`That site answered with an error (${res.status}).`);
    }
    if (res.contentType && !/text\/html|application\/xhtml|text\/plain/i.test(res.contentType)) {
      throw new FetchPageError(
        "That link isn't a web page we can read. Copy the job text and paste it instead.",
      );
    }

    const page = parsePage(current.toString(), res.contentType, res.body);
    if (page.text.length < 200) {
      throw new FetchPageError(
        "We couldn't find the job text on that page. Many job sites load it with scripts. Copy the job text and paste it instead.",
      );
    }
    return page;
  }
  throw new FetchPageError("The page redirected too many times.");
}
