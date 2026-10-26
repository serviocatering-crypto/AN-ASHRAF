const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

let MongoClient = null;
try {
  MongoClient = require("mongodb").MongoClient;
} catch (e) {
  console.warn("[CLOUD-STORAGE] mongodb package not yet loaded:", e.message);
}

class CloudStorageManager {
  constructor() {
    this.mongoClient = null;
    this.mongoDb = null;
    this.isMongoConnected = false;
    this.mongoUri = null;
    this.config = {};
    this.lastHeartbeat = null;
    this.heartbeatCounter = 0;
    this.heartbeatTimer = null;
    this.keepAliveActive = false;
  }

  init(options = {}) {
    this.config = {
      booksFile: options.booksFile,
      categoriesFile: options.categoriesFile,
      settingsFile: options.settingsFile,
      uploadsDir: options.uploadsDir,
      defaultCategories: options.defaultCategories || {},
      defaultSettings: options.defaultSettings || {},
      onDataUpdated: options.onDataUpdated || (() => {}),
      publicUrl: options.publicUrl || "https://an-ashraf.onrender.com"
    };

    // 1. Check for configured MongoDB URI
    const envUri = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.DATABASE_URL;
    let settingsUri = null;
    try {
      if (this.config.settingsFile && typeof this.config.settingsFile === "string" && fs.existsSync(this.config.settingsFile)) {
        const s = JSON.parse(fs.readFileSync(this.config.settingsFile, "utf-8"));
        settingsUri = s.mongodbUri;
      }
    } catch (_) {}

    const targetUri = (envUri && envUri.trim()) || (settingsUri && settingsUri.trim()) || null;

    if (targetUri) {
      this.connectMongo(targetUri).catch(err => {
        console.warn("[CLOUD-STORAGE] Initial MongoDB connection failed, falling back to local shield:", err.message);
      });
    } else {
      console.log("[CLOUD-STORAGE] No MONGODB_URI configured. Running in Local Shield mode with Anti-Sleep Heartbeat.");
    }

    // 2. Ensure existing book covers have embedded data backup so they survive disk resets
    this.embedExistingBookCovers();

    // 3. Start Anti-Sleep Keep-Alive Heartbeat
    this.startKeepAlive();
  }

  async connectMongo(uri) {
    if (!MongoClient) {
      throw new Error("MongoDB driver is not installed");
    }

    const cleanUri = uri.trim();
    console.log("[CLOUD-STORAGE] Attempting connection to MongoDB Atlas...");

    // Close any previous client
    if (this.mongoClient) {
      try { await this.mongoClient.close(); } catch (_) {}
    }

    const client = new MongoClient(cleanUri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      maxPoolSize: 10
    });

    await client.connect();

    // Extract or default database name
    this.mongoClient = client;
    this.mongoDb = client.db("paylib");
    this.isMongoConnected = true;
    this.mongoUri = cleanUri;

    console.log("=================================================");
    console.log("🟢 [CLOUD-STORAGE] Successfully connected to MongoDB Atlas!");
    console.log("   Database: 'paylib' • Cloud Persistence 100% Active");
    console.log("   Data will NEVER be lost when site goes to sleep!");
    console.log("=================================================");

    // Perform two-way startup sync
    await this.syncOnStartup();

    return true;
  }

  async syncOnStartup() {
    if (!this.isMongoConnected || !this.mongoDb) return;

    try {
      const booksCol = this.mongoDb.collection("books");
      const categoriesCol = this.mongoDb.collection("categories");
      const settingsCol = this.mongoDb.collection("settings");

      // 1. Sync Books
      const cloudBooks = await booksCol.find({}).toArray();
      let localBooks = [];
      try {
        if (fs.existsSync(this.config.booksFile)) {
          localBooks = JSON.parse(fs.readFileSync(this.config.booksFile, "utf-8")) || [];
        }
      } catch (_) {}

      if (cloudBooks.length > 0) {
        // Cloud has books: write them to local disk cache
        const cleanBooks = cloudBooks.map(({ _id, ...rest }) => rest);
        fs.writeFileSync(this.config.booksFile, JSON.stringify(cleanBooks, null, 2), "utf-8");
        console.log(`[CLOUD-STORAGE] Synced ${cleanBooks.length} books from MongoDB Atlas to local disk cache.`);
        this.config.onDataUpdated("books", cleanBooks);
      } else if (localBooks.length > 0) {
        // Cloud is empty, seed with local books
        const docs = localBooks.map(b => ({ ...b, _id: b.id }));
        await booksCol.insertMany(docs);
        console.log(`[CLOUD-STORAGE] Seeded MongoDB Atlas with ${docs.length} books from local storage.`);
      }

      // 2. Sync Categories
      const cloudCats = await categoriesCol.findOne({ _id: "current_categories" });
      if (cloudCats && cloudCats.categories) {
        fs.writeFileSync(this.config.categoriesFile, JSON.stringify(cloudCats.categories, null, 2), "utf-8");
        console.log("[CLOUD-STORAGE] Synced categories from MongoDB Atlas.");
        this.config.onDataUpdated("categories", cloudCats.categories);
      } else if (fs.existsSync(this.config.categoriesFile)) {
        try {
          const localCats = JSON.parse(fs.readFileSync(this.config.categoriesFile, "utf-8"));
          await categoriesCol.replaceOne(
            { _id: "current_categories" },
            { _id: "current_categories", categories: localCats },
            { upsert: true }
          );
        } catch (_) {}
      }

      // 3. Sync Settings
      const cloudSettings = await settingsCol.findOne({ _id: "current_settings" });
      if (cloudSettings) {
        const { _id, ...restSettings } = cloudSettings;
        fs.writeFileSync(this.config.settingsFile, JSON.stringify(restSettings, null, 2), "utf-8");
        console.log("[CLOUD-STORAGE] Synced settings from MongoDB Atlas.");
      } else if (fs.existsSync(this.config.settingsFile)) {
        try {
          const localSettings = JSON.parse(fs.readFileSync(this.config.settingsFile, "utf-8"));
          await settingsCol.replaceOne(
            { _id: "current_settings" },
            { _id: "current_settings", ...localSettings },
            { upsert: true }
          );
        } catch (_) {}
      }
    } catch (err) {
      console.error("[CLOUD-STORAGE] Error during startup synchronization:", err.message);
    }
  }

  async persistBooks(books) {
    if (!this.isMongoConnected || !this.mongoDb) return;

    try {
      const booksCol = this.mongoDb.collection("books");
      const currentIds = books.map(b => b.id);

      // Remove deleted books from MongoDB
      if (currentIds.length > 0) {
        await booksCol.deleteMany({ _id: { $nin: currentIds } });
      } else {
        await booksCol.deleteMany({});
      }

      // Upsert each book
      const ops = books.map(book => ({
        replaceOne: {
          filter: { _id: book.id },
          replacement: { ...book, _id: book.id },
          upsert: true
        }
      }));

      if (ops.length > 0) {
        await booksCol.bulkWrite(ops);
      }
    } catch (err) {
      console.error("[CLOUD-STORAGE] Failed persisting books to MongoDB:", err.message);
    }
  }

  async persistCategories(categories) {
    if (!this.isMongoConnected || !this.mongoDb) return;

    try {
      const col = this.mongoDb.collection("categories");
      await col.replaceOne(
        { _id: "current_categories" },
        { _id: "current_categories", categories, updatedAt: new Date().toISOString() },
        { upsert: true }
      );
    } catch (err) {
      console.error("[CLOUD-STORAGE] Failed persisting categories to MongoDB:", err.message);
    }
  }

  async persistSettings(settings) {
    if (!this.isMongoConnected || !this.mongoDb) return;

    try {
      const col = this.mongoDb.collection("settings");
      await col.replaceOne(
        { _id: "current_settings" },
        { _id: "current_settings", ...settings, updatedAt: new Date().toISOString() },
        { upsert: true }
      );
    } catch (err) {
      console.error("[CLOUD-STORAGE] Failed persisting settings to MongoDB:", err.message);
    }
  }

  // Backup existing book cover files into Base64 so they can be re-created even if /uploads is erased
  embedExistingBookCovers() {
    try {
      if (!this.config.booksFile || typeof this.config.booksFile !== "string" || !fs.existsSync(this.config.booksFile)) return;
      if (!this.config.uploadsDir || typeof this.config.uploadsDir !== "string") return;
      const raw = fs.readFileSync(this.config.booksFile, "utf-8");
      if (!raw.trim()) return;
      const books = JSON.parse(raw);
      let updated = false;

      books.forEach(b => {
        if (b.coverPhoto && typeof b.coverPhoto === "string" && b.coverPhoto.startsWith("/uploads/")) {
          const filename = path.basename(b.coverPhoto);
          const fullPath = path.join(this.config.uploadsDir, filename);

          if (!b.coverPhotoData && fs.existsSync(fullPath)) {
            try {
              const buffer = fs.readFileSync(fullPath);
              const ext = path.extname(filename).toLowerCase().replace(".", "") || "png";
              const mime = ext === "jpg" ? "jpeg" : ext;
              b.coverPhotoData = `data:image/${mime};base64,${buffer.toString("base64")}`;
              updated = true;
            } catch (_) {}
          }
        }
      });

      if (updated) {
        fs.writeFileSync(this.config.booksFile, JSON.stringify(books, null, 2), "utf-8");
        console.log("[CLOUD-STORAGE] Embedded persistent cover photo backups for existing books.");
      }
    } catch (e) {
      console.warn("[CLOUD-STORAGE] embedExistingBookCovers note:", e.message);
    }
  }

  // Reconstruct missing image file on disk from book's coverPhotoData
  reconstructMissingUpload(filename, books) {
    if (!filename || typeof filename !== "string" || !this.config.uploadsDir || typeof this.config.uploadsDir !== "string") return null;
    const safeFilename = path.basename(filename);
    const targetPath = path.join(this.config.uploadsDir, safeFilename);

    // If file already exists on disk, nothing to reconstruct
    if (fs.existsSync(targetPath)) {
      return targetPath;
    }

    // Look for book with matching coverPhoto or coverPhotoData
    const book = books.find(b =>
      (b.coverPhoto && b.coverPhoto.includes(safeFilename)) ||
      (b.coverPhotoData && typeof b.coverPhotoData === "string" && b.coverPhotoData.includes(safeFilename))
    );

    if (book && book.coverPhotoData && typeof book.coverPhotoData === "string" && book.coverPhotoData.startsWith("data:image/")) {
      try {
        const match = book.coverPhotoData.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
        if (match) {
          const buffer = Buffer.from(match[1], "base64");
          fs.writeFileSync(targetPath, buffer);
          console.log(`[CLOUD-STORAGE] 🛡️ Auto-reconstructed missing image on ephemeral disk: ${safeFilename}`);
          return targetPath;
        }
      } catch (err) {
        console.warn(`[CLOUD-STORAGE] Error reconstructing ${safeFilename}:`, err.message);
      }
    }

    return null;
  }

  // ==========================================
  // Anti-Sleep Keep-Alive Heartbeat
  // Pings server every 13 minutes (Render sleeps after 15 min)
  // ==========================================
  startKeepAlive() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.keepAliveActive = true;

    const KEEP_ALIVE_INTERVAL = 13 * 60 * 1000; // 13 minutes

    const doPing = () => {
      const publicUrl = this.getPublicUrl();
      const pingUrl = `${publicUrl}/api/ping`;

      try {
        const isHttps = pingUrl.startsWith("https://");
        const clientLib = isHttps ? https : http;

        const req = clientLib.get(pingUrl, {
          headers: {
            "User-Agent": "PayLib-AntiSleep-Heartbeat/2.0",
            "X-Anti-Sleep": "true"
          },
          timeout: 12000
        }, (res) => {
          this.lastHeartbeat = new Date().toISOString();
          this.heartbeatCounter++;
          console.log(`[ANTI-SLEEP] 💓 Heartbeat #${this.heartbeatCounter} success (${res.statusCode}) -> ${pingUrl} (Keeps Render free-tier awake 24/7)`);
        });

        req.on("error", (err) => {
          console.log(`[ANTI-SLEEP] Heartbeat ping notice (${pingUrl}): ${err.message}`);
        });

        req.on("timeout", () => {
          req.destroy();
        });
      } catch (e) {
        console.warn("[ANTI-SLEEP] Heartbeat ping failed:", e.message);
      }
    };

    // First ping after 45 seconds of launch, then every 13 minutes
    setTimeout(doPing, 45000);
    this.heartbeatTimer = setInterval(doPing, KEEP_ALIVE_INTERVAL);
    console.log(`[ANTI-SLEEP] Keep-Alive Heartbeat active: Pings every 13 minutes to prevent Render sleep mode.`);
  }

  getPublicUrl() {
    const envUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || process.env.APP_URL;
    if (envUrl && envUrl.trim()) {
      let clean = envUrl.trim();
      if (clean.endsWith("/")) clean = clean.slice(0, -1);
      if (!clean.startsWith("http://") && !clean.startsWith("https://")) clean = `https://${clean}`;
      return clean;
    }
    return this.config.publicUrl || "https://an-ashraf.onrender.com";
  }

  getStatus() {
    const publicUrl = this.getPublicUrl();
    return {
      success: true,
      isMongoConnected: this.isMongoConnected,
      storageType: this.isMongoConnected ? "MongoDB Atlas (Permanent Cloud DB)" : "Local Ephemeral Disk (Shielded)",
      mongoUriConfigured: Boolean(this.mongoUri),
      antiSleep: {
        active: this.keepAliveActive,
        intervalMinutes: 13,
        targetUrl: publicUrl,
        lastHeartbeat: this.lastHeartbeat,
        totalHeartbeats: this.heartbeatCounter
      },
      protectionShield: {
        active: true,
        autoRestoreProtected: true,
        coverPhotoReconstruction: true
      }
    };
  }
}

const cloudStorage = new CloudStorageManager();
module.exports = cloudStorage;
