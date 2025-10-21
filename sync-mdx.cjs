#!/usr/bin/env node

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");

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
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    // Make sure parent dir exists (in case callers pass nested filePath)
    await ensureDir(path.dirname(filePath));

    // Res.body is a Web stream; convert to Node stream for pipeline
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(filePath));
    console.log(`Downloaded ${filePath}`);
  } catch (err) {
    console.error(`Failed to download ${url}:`, err);
    throw err;
  }
}

// Simple concurrency runner
async function runWithConcurrency(limit, items, worker) {
  const q = [...items];
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (q.length) {
      const item = q.shift();
      await worker(item);
    }
  });
  await Promise.all(workers);
}

// --- main ---
async function syncOneFolder({ basePath, params, apiUrl, downloadBaseUrl }) {
  await ensureDir(basePath);

  const res = await fetch(`${apiUrl}?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch ${apiUrl}?${params}: ${res.status} ${res.statusText}`);
  const items = await res.json(); // expecting [{ name, md5 }, ...]

  // Limit concurrent file work to avoid overwhelming disk/network
  const CONCURRENCY = 100;

  await runWithConcurrency(CONCURRENCY, items, async (item) => {
    const filePath = path.join(basePath, item.name);
    const exists = await fileExists(filePath);

    if (exists) {
      const localMD5 = await calculateMD5(filePath).catch(() => null);
      if (!localMD5 || localMD5 !== item.md5) {
        console.log(`MD5 mismatch for ${item.name}, downloading...`);
        const u = `${downloadBaseUrl}?name=${encodeURIComponent(item.name)}&bucket=mdx&noCache=true`;
        await downloadFile(u, filePath);
      } else {
        console.log(`${item.name} is up-to-date.`);
      }
    } else {
      console.log(`${item.name} does not exist locally, downloading...`);
      const u = `${downloadBaseUrl}?name=${encodeURIComponent(item.name)}&bucket=mdx&noCache=true`;
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

    // Run folders in parallel (bounded per-folder concurrency inside)
    await Promise.all(
      listSync.map((syncItem) =>
        syncOneFolder({ ...syncItem, apiUrl, downloadBaseUrl })
      )
    );

    console.log("Sync complete.");
  } catch (error) {
    console.error("Error syncing files:", error);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  syncFiles();
}
