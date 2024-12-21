#!/usr/bin/env node


const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { pipeline } = require("stream/promises");

function calculateMD5(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("md5");
      const stream = fs.createReadStream(filePath);
  
      stream.on("data", (data) => hash.update(data));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", (err) => reject(err));
    });
  }
  
  async function downloadFile(url, filePath) {
    try {
      const response = await fetch(url);
  
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
      }
  
      const readableStream = response.body;
  
      await pipeline(readableStream, fs.createWriteStream(filePath));
      console.log(`Downloaded ${filePath}`);
    } catch (error) {
      console.error(`Failed to download ${url}:`, error);
    }
  }
  
  // Main function
  async function syncFiles() {
    try {
      const apiUrl = "https://api.oneblock.vn/be/mdx";
      const downloadBaseUrl = "https://api.oneblock.vn/be/s3/";
  
      
  
      const listSync = [
        {
          path: process.cwd() + "/src/content/blog",
          params: "", 
        },
        {
          path: process.cwd() + "/src/content/about",
          params: "type_doc=2", 
        }
      ]
      listSync.forEach(  async (syncItem) => {
        const basePath = syncItem.path;
        const params = syncItem.params;
        if (!fs.existsSync(basePath)){
          fs.mkdirSync(basePath);
        }
        // Fetch the list from the API
        const response = await fetch(`${apiUrl}?${params}`);
    
        if (!response.ok) {
          throw new Error(`Failed to fetch ${apiUrl}: ${response.statusText}`);
        }
    
      const items = await response.json();
        for (const item of items) {
          const filePath = path.join(basePath, item.name);
    
          // Check if the file exists
          if (fs.existsSync(filePath)) {
            // Calculate the MD5 checksum of the local file
            const localMD5 = await calculateMD5(filePath);
    
            // Compare MD5 checksums
            if (localMD5 !== item.md5) {
              console.log(`MD5 mismatch for ${item.name}, downloading...`);
              await downloadFile(`${downloadBaseUrl}?name=${item.name}&bucket=mdx`, filePath);
            } else {
              console.log(`${item.name} is up-to-date.`);
            }
          } else {
            console.log(`${item.name} does not exist locally, downloading...`);
            await downloadFile(`${downloadBaseUrl}?name=${item.name}&bucket=mdx`, filePath);
          }
        }      
      });
  
      console.log("Sync complete.");
    } catch (error) {
      console.error("Error syncing files:", error);
    }
  }
  
  if (require.main === module) {
    syncFiles();
  }
  