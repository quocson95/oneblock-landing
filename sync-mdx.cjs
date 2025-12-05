#!/usr/bin/env node
const { performance } = require('perf_hooks');
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");

// 1. USE UNDICI AGENT (Native Fetch Engine)
const { Agent, setGlobalDispatcher, getGlobalDispatcher } = require('undici');

// Configure the high-performance connection pool
const undiciAgent = new Agent({
  connect: {
    family: 4, // Force IPv4 to avoid IPv6 timeouts (Huge TTFB saver)
  },
  keepAliveTimeout: 10000, // 10s
  keepAliveMaxTimeout: 60000,
  connections: 50, // Max open connections in the pool
  pipelining: 0,   // Keep 0 for file downloads to avoid ordering issues
});

// Set as global dispatcher for all fetch() calls
setGlobalDispatcher(undiciAgent);

// --- utils ---
async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function fileExists(p) {
  try {
    await fsp.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function calculateMD5(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    hash.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function downloadFile(url, filePath) {
  const startTime = performance.now();

  try {
    // Note: No need to pass { agent } here. 
    // fetch() uses the GlobalDispatcher we set at the top.
    const res = await fetch(url);
    
    const ttfbTime = performance.now(); 

    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const contentLength = res.headers.get('content-length');
    const sizeInMB = contentLength ? (parseInt(contentLength) / (1024 * 1024)).toFixed(2) : 'unknown';

    await ensureDir(path.dirname(filePath));
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(filePath));

    const endTime = performance.now();
    
    const ttfb = (ttfbTime - startTime).toFixed(2);
    const downloadTime = (endTime - ttfbTime).toFixed(2);
    const totalDuration = (endTime - startTime).toFixed(2);

    console.log(`[✓] Downloaded ${filePath} (${sizeInMB} MB) ── TTFB: ${ttfb}ms ── Download: ${downloadTime}ms ── Total: ${totalDuration}ms`);
    return { ttfb, downloadTime, totalDuration, sizeInMB };

  } catch (err) {
    const failTime = (performance.now() - startTime).toFixed(2);
    console.error(`[x] Failed to download ${url} after ${failTime}ms:`, err);
    throw err;
  }
}

// 2. FIXED CONCURRENCY RUNNER
async function runWithConcurrency(limit, items, worker) {
  const q = [...items];
  const activeWorkers = [];

  // Create X workers
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    activeWorkers.push((async () => {
      while (q.length > 0) {
        const item = q.shift();
        try {
          // CRITICAL FIX: Added 'await' here. 
          // Without this, the loop spins instantly and floods the network.
          await worker(item);
        } catch (e) {
          console.error(`Error processing ${item.name || 'item'}:`, e);
        }
      }
    })());
  }
  
  await Promise.all(activeWorkers);
}

// --- main ---
async function syncOneFolder({ basePath, params, apiUrl, downloadBaseUrl }) {
  await ensureDir(basePath);

  const res = await fetch(`${apiUrl}?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch ${apiUrl}?${params}: ${res.status} ${res.statusText}`);
  const items = await res.json(); 

  // 3. TUNED CONCURRENCY
  // Reduced to 20. 100 often causes TCP congestion/packet loss, increasing TTFB.
  const CONCURRENCY = 20;

  await runWithConcurrency(CONCURRENCY, items, async (item) => {
    const filePath = path.join(basePath, item.name);
    const exists = await fileExists(filePath);

    // Logic: If file exists, check MD5. If mismatch or missing, download.
    let shouldDownload = false;
    
    if (exists) {
      const localMD5 = await calculateMD5(filePath).catch(() => null);
      if (!localMD5 || localMD5 !== item.md5) {
        console.log(`[M] MD5 mismatch: ${item.name}`);
        shouldDownload = true;
        // Optimization: Don't delete yet. Open with 'w' flag in createWriteStream overwrites anyway.
        // Less IO operations = faster.
      } else {
        // console.log(`[✓] ${item.name} is up-to-date.`);
      }
    } else {
      console.log(`[N] New file: ${item.name}`);
      shouldDownload = true;
    }

    if (shouldDownload) {
      const u = `${downloadBaseUrl}?name=${encodeURIComponent(item.name)}&bucket=mdx&noCache=false`;
      await downloadFile(u, filePath);
    }
  });
}

async function syncFiles() {
  try {
    const apiUrl = "https://api.oneblock.vn/be/mdx";
    const downloadBaseUrl = "https://api.oneblock.vn/be/s3/";
    const rootPath = path.join(process.cwd(), "src", "content");
    await ensureDir(rootPath);

    const listSync = [
      { basePath: path.join(rootPath, "blog"),  params: "" },
      { basePath: path.join(rootPath, "about"), params: "type_doc=2" },
    ];

    // Process folders sequentially to keep logs readable, or parallel if preferred
    for (const syncItem of listSync) {
        await syncOneFolder({ ...syncItem, apiUrl, downloadBaseUrl });
    }

    console.log("[✓] Sync complete.");
  } catch (error) {
    console.error("[x] Error syncing files:", error);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  syncFiles();
}