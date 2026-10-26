const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cloudStorage = require("./cloudStorage.js");
let QRCodeLib = null;
try {
  QRCodeLib = require("qrcode");
} catch (_) {}

const app = express();
const PORT = process.env.PORT || 3000;

// Directories setup
const DATA_DIR = path.join(__dirname, "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");

// Ensure all required directories exist
[DATA_DIR, UPLOADS_DIR, BACKUPS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const BOOKS_FILE = path.join(DATA_DIR, "books.json");
const CATEGORIES_FILE = path.join(DATA_DIR, "categories.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

// ==========================================
// Middleware Configuration
// ==========================================
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use((req, res, next) => {
  if (!req.body || typeof req.body !== "object") {
    req.body = {};
  }
  next();
});

// Static Asset Serving with Anti-Sleep / Auto-Reconstruction Shield
app.get("/uploads/:filename", (req, res, next) => {
  const safeFilename = path.basename(req.params.filename);
  const directPath = path.join(UPLOADS_DIR, safeFilename);
  if (fs.existsSync(directPath)) {
    return res.sendFile(directPath);
  }
  // Auto-reconstruct missing cover from book data if wiped after container sleep
  const books = readJson(BOOKS_FILE, []);
  const reconstructedPath = cloudStorage.reconstructMissingUpload(safeFilename, books);
  if (reconstructedPath && fs.existsSync(reconstructedPath)) {
    return res.sendFile(reconstructedPath);
  }
  const defaultCover = path.join(__dirname, "default_cover.png");
  if (fs.existsSync(defaultCover)) {
    return res.sendFile(defaultCover);
  }
  res.status(404).send("File not found");
});
app.use("/uploads", express.static(UPLOADS_DIR));

// Direct Download for Compiled Android Mobile App (APK)
app.get(["/AN_ASHRAF.apk", "/paylib.apk"], (req, res) => {
  const anAshrafApk = path.join(__dirname, "AN_ASHRAF.apk");
  const rootApk = path.join(__dirname, "paylib.apk");
  const releaseApk = path.join(__dirname, "paylib_mobile", "build", "app", "outputs", "flutter-apk", "app-release.apk");
  const buildApk = path.join(__dirname, "paylib_mobile", "build", "app", "outputs", "flutter-apk", "app-debug.apk");
  const apkPath = fs.existsSync(anAshrafApk) ? anAshrafApk : (fs.existsSync(rootApk) ? rootApk : (fs.existsSync(releaseApk) ? releaseApk : (fs.existsSync(buildApk) ? buildApk : null)));

  if (apkPath) {
    res.setHeader("Content-Disposition", 'attachment; filename="AN_ASHRAF.apk"');
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    fs.createReadStream(apkPath).pipe(res);
  } else {
    res.status(404).send("APK is currently being compiled. Please try again shortly.");
  }
});

// GET /api/qr - Generate standalone SVG QR code locally
app.get("/api/qr", async (req, res) => {
  const text = req.query.text || "https://an-ashraf.onrender.com";
  if (QRCodeLib && typeof QRCodeLib.toString === "function") {
    try {
      const svg = await QRCodeLib.toString(text, {
        type: "svg",
        width: 140,
        margin: 1,
        color: {
          dark: "#1a73e8",
          light: "#ffffff"
        }
      });
      res.setHeader("Content-Type", "image/svg+xml");
      return res.send(svg);
    } catch (e) {
      // Fall through to error
    }
  }
  res.redirect(`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(text)}`);
});

app.use(express.static(__dirname));

// Request Logger (Development / Production Audit)
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
    });
  }
  next();
});

// ==========================================
// Default Fallback Data & Seeders
// ==========================================
const DEFAULT_CATEGORIES = {
  "KITHAB": ["HADHEES"],
  "MALAYALAM": ["General"],
  "Science": ["Biology", "Space & Astronomy", "Human Anatomy", "Physics", "Chemistry"],
  "Technology": ["Software Engineering", "Artificial Intelligence", "Web Development", "Mobile Apps", "Cybersecurity"],
  "Self-Help": ["Habits & Productivity", "Psychology & Mindset", "Mindfulness", "Personal Finance"],
  "Fiction": ["Classic Literature", "Mystery & Thriller", "Sci-Fi & Fantasy", "Historical Fiction"],
  "Business": ["Startups & Entrepreneurship", "Management & Leadership", "Marketing & Sales", "Economics"],
  "Philosophy": ["Stoicism", "Ethics & Morality", "Ancient Philosophy", "Logic"],
  "History": ["World History", "Ancient Civilizations", "Military History", "Biographies"]
};

const DEFAULT_SETTINGS = {
  pin: "1234",
  lockEnabled: true,
  libraryName: "PayLib Library",
  theme: "light"
};

// Vector SVG Cover Generator for Default Showcase
function createVectorCover(title, author, category, color1, color2) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 560" width="100%" height="100%">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${color1}" />
        <stop offset="100%" stop-color="${color2}" />
      </linearGradient>
      <pattern id="pattern" width="40" height="40" patternUnits="userSpaceOnUse">
        <circle cx="20" cy="20" r="1.5" fill="rgba(255,255,255,0.15)"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#grad)" />
    <rect width="100%" height="100%" fill="url(#pattern)" />
    <rect x="0" y="0" width="18" height="560" fill="rgba(0,0,0,0.2)" />
    <rect x="18" y="0" width="2" height="560" fill="rgba(255,255,255,0.2)" />
    <rect x="40" y="44" width="130" height="26" rx="13" fill="rgba(255,255,255,0.25)" />
    <text x="105" y="61" fill="#ffffff" font-family="'Plus Jakarta Sans', sans-serif" font-size="11" font-weight="700" text-anchor="middle" letter-spacing="0.5">${category.toUpperCase()}</text>
    <text x="44" y="190" fill="#ffffff" font-family="'Plus Jakarta Sans', sans-serif" font-size="28" font-weight="800">
      <tspan x="44" dy="0">${title.slice(0, 18)}</tspan>
      <tspan x="44" dy="34">${title.slice(18, 36)}</tspan>
    </text>
    <rect x="44" y="270" width="56" height="4" rx="2" fill="#ffffff" opacity="0.8" />
    <text x="44" y="320" fill="rgba(255,255,255,0.9)" font-family="'Plus Jakarta Sans', sans-serif" font-size="15" font-weight="600">BY ${author.toUpperCase()}</text>
    <circle cx="330" cy="480" r="34" fill="rgba(255,255,255,0.18)" />
    <text x="330" y="486" fill="#ffffff" font-family="'Plus Jakarta Sans', sans-serif" font-size="18" font-weight="800" text-anchor="middle">LIB</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ==========================================
// Atomic Safe File Storage Utilities
// ==========================================
function readJson(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) {
      writeJson(filePath, defaultValue);
      return defaultValue;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw || !raw.trim()) {
      return defaultValue;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[STORAGE] Error reading JSON from ${filePath}:`, err.message);
    return defaultValue;
  }
}

function writeJson(filePath, data) {
  let writeOk = false;
  const tempPath = `${filePath}.${Date.now()}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  try {
    const parent = path.dirname(filePath);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }
    const jsonString = JSON.stringify(data, null, 2);
    fs.writeFileSync(tempPath, jsonString, "utf-8");
    fs.renameSync(tempPath, filePath);
    writeOk = true;
  } catch (err) {
    console.error(`[STORAGE] Error atomic writing ${filePath}:`, err.message);
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (e) {}
    // Fallback direct write if atomic rename is locked on Windows
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
      writeOk = true;
    } catch (innerErr) {
      console.error(`[STORAGE] Direct fallback write failed for ${filePath}:`, innerErr.message);
      writeOk = false;
    }
  }

  // Persistent Cloud Database Sync (MongoDB Atlas)
  if (writeOk) {
    if (filePath === BOOKS_FILE && Array.isArray(data)) {
      cloudStorage.persistBooks(data);
    } else if (filePath === CATEGORIES_FILE && typeof data === "object") {
      cloudStorage.persistCategories(data);
    } else if (filePath === SETTINGS_FILE && typeof data === "object") {
      cloudStorage.persistSettings(data);
    }
  }

  return writeOk;
}

// ==========================================
// Intelligent Image & Media Processing
// Converts heavy Base64 cover photos to stored static files in /uploads
// ==========================================
function processCoverPhoto(bookId, coverPhoto) {
  if (!coverPhoto || typeof coverPhoto !== "string") {
    return { url: "", data: "" };
  }

  // Preserve lightweight SVG data URIs
  if (coverPhoto.startsWith("data:image/svg+xml")) {
    return { url: coverPhoto, data: coverPhoto };
  }

  // Preserve existing hosted URLs or local /uploads paths
  if (coverPhoto.startsWith("http://") || coverPhoto.startsWith("https://") || coverPhoto.startsWith("/uploads/")) {
    return { url: coverPhoto, data: "" };
  }

  // Detect base64 raster image: data:image/(png|jpeg|jpg|webp);base64,...
  const match = coverPhoto.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (match) {
    try {
      const ext = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
      const base64Data = match[2];
      const buffer = Buffer.from(base64Data, "base64");

      const safeId = String(bookId).replace(/[^a-zA-Z0-9_-]/g, "");
      const filename = `cover_${safeId || "book"}_${Date.now()}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, filename);

      fs.writeFileSync(filePath, buffer);
      return { url: `/uploads/${filename}`, data: coverPhoto };
    } catch (err) {
      console.error("[UPLOADS] Failed to convert base64 image:", err.message);
      return { url: coverPhoto, data: coverPhoto };
    }
  }

  return { url: coverPhoto, data: "" };
}

// Delete uploaded image file from disk if it was stored locally
function cleanupCoverFile(coverPhotoPath) {
  if (coverPhotoPath && typeof coverPhotoPath === "string" && coverPhotoPath.startsWith("/uploads/")) {
    const filename = path.basename(coverPhotoPath);
    const fullPath = path.join(UPLOADS_DIR, filename);
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (e) {
      console.warn(`[UPLOADS] Could not delete image ${fullPath}:`, e.message);
    }
  }
}

// Helper: Ensure category & subcategory are registered in categories.json
function ensureCategoryExists(category, subCategory) {
  if (!category || typeof category !== "string") return;
  const categories = readJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  const catTrimmed = category.trim();
  const subTrimmed = subCategory && typeof subCategory === "string" ? subCategory.trim() : "General";

  let updated = false;
  if (!categories[catTrimmed]) {
    categories[catTrimmed] = subTrimmed ? [subTrimmed] : ["General"];
    updated = true;
  } else if (subTrimmed && !categories[catTrimmed].includes(subTrimmed)) {
    categories[catTrimmed].push(subTrimmed);
    updated = true;
  }

  if (updated) {
    writeJson(CATEGORIES_FILE, categories);
  }
}

// Ensure files exist on startup
readJson(BOOKS_FILE, []);
readJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);
readJson(SETTINGS_FILE, DEFAULT_SETTINGS);

// Initialize Cloud Persistence & Anti-Sleep Heartbeat Engine
cloudStorage.init({
  booksFile: BOOKS_FILE,
  categoriesFile: CATEGORIES_FILE,
  settingsFile: SETTINGS_FILE,
  uploadsDir: UPLOADS_DIR,
  defaultCategories: DEFAULT_CATEGORIES,
  defaultSettings: DEFAULT_SETTINGS,
  onDataUpdated: (type, data) => {
    if (type === "books") notifyClients("books_synced", { books: data });
    if (type === "categories") notifyClients("categories_updated", { categories: data });
  }
});

// ==========================================
// Real-Time Server-Sent Events (SSE) Stream
// Powers Instant Bi-Directional Web <-> Mobile Sync
// ==========================================
let sseClients = [];

function notifyClients(type, payload = {}) {
  const data = JSON.stringify({ type, payload, timestamp: Date.now() });
  const message = `event: ${type}\ndata: ${data}\n\n`;
  sseClients.forEach(c => {
    try {
      c.res.write(message);
    } catch (e) {}
  });
}

app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ message: "Live sync connected", timestamp: Date.now() })}\n\n`);

  const clientId = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  sseClients.push({ id: clientId, res });

  req.on("close", () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// Periodic SSE Keep-Alive Heartbeat every 20 seconds
setInterval(() => {
  sseClients.forEach(c => {
    try {
      c.res.write(": keepalive\n\n");
    } catch (e) {}
  });
}, 20000);

// ==========================================
// 1. Health, Status, Anti-Sleep Ping & Cloud Diagnostics
// ==========================================
app.get(["/api/ping", "/api/health"], (req, res) => {
  res.json({
    status: "ok",
    awake: true,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    ...cloudStorage.getStatus()
  });
});

app.get("/api/cloud-status", (req, res) => {
  res.json(cloudStorage.getStatus());
});

app.post("/api/cloud-config", async (req, res) => {
  const { mongodbUri } = req.body;
  if (!mongodbUri || typeof mongodbUri !== "string" || !mongodbUri.trim()) {
    return res.status(400).json({ success: false, message: "Valid MongoDB connection URI required." });
  }
  try {
    await cloudStorage.connectMongo(mongodbUri.trim());
    const settings = readJson(SETTINGS_FILE, DEFAULT_SETTINGS);
    settings.mongodbUri = mongodbUri.trim();
    writeJson(SETTINGS_FILE, settings);
    res.json({
      success: true,
      message: "Connected to MongoDB Atlas! All library data is now permanently persisted in the cloud.",
      status: cloudStorage.getStatus()
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: `Could not connect to MongoDB: ${err.message}`
    });
  }
});

app.get("/api/status", (req, res) => {
  const books = readJson(BOOKS_FILE, []);
  const categories = readJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);

  res.json({
    status: "online",
    name: "PayLib Dynamic Backend",
    version: "2.1.0",
    totalBooks: books.length,
    availableBooks: books.filter(b => b.status === "Available").length,
    borrowedBooks: books.filter(b => b.status === "Borrowed").length,
    categoriesCount: Object.keys(categories).length,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    cloud: cloudStorage.getStatus()
  });
});

// ==========================================
// 2. Comprehensive Analytics & Library Insights
// ==========================================
app.get("/api/stats", (req, res) => {
  const books = readJson(BOOKS_FILE, []);
  const categories = readJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);

  const total = books.length;
  const available = books.filter(b => b.status === "Available").length;
  const borrowed = total - available;
  const totalPages = books.reduce((sum, b) => sum + (Number(b.totalPages) || 0), 0);
  const totalValuation = books.reduce((sum, b) => sum + (Number(b.price) || 0), 0);
  const averagePrice = total > 0 ? Math.round(totalValuation / total) : 0;

  // Category breakdown
  const categoryBreakdown = {};
  Object.keys(categories).forEach(cat => {
    const catBooks = books.filter(b => b.category === cat);
    categoryBreakdown[cat] = {
      total: catBooks.length,
      available: catBooks.filter(b => b.status === "Available").length,
      borrowed: catBooks.filter(b => b.status === "Borrowed").length,
      valuation: catBooks.reduce((sum, b) => sum + (Number(b.price) || 0), 0),
      subCategories: {}
    };
    (categories[cat] || []).forEach(sub => {
      categoryBreakdown[cat].subCategories[sub] = catBooks.filter(b => b.subCategory === sub).length;
    });
  });

  // Top Authors
  const authorCounts = {};
  books.forEach(b => {
    if (b.author) {
      const a = b.author.trim();
      authorCounts[a] = (authorCounts[a] || 0) + 1;
    }
  });
  const topAuthors = Object.entries(authorCounts)
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  res.json({
    success: true,
    totalBooks: total,
    availableBooks: available,
    borrowedBooks: borrowed,
    totalPages,
    totalValuation,
    averagePrice,
    categoryBreakdown,
    topAuthors,
    recentBooks: books.slice(0, 5)
  });
});

// ==========================================
// 3. Books Collection Endpoints
// ==========================================

// GET /api/books - Filter, Search, Sort & Paginate
app.get("/api/books", (req, res) => {
  const books = readJson(BOOKS_FILE, []);
  const { category, subCategory, available, status, search, sortBy, order, limit, page } = req.query;

  let filtered = [...books];

  // Category filter
  if (category && category !== "All") {
    filtered = filtered.filter(b => b.category === category);
  }

  // Sub-category filter
  if (subCategory && subCategory !== "All") {
    filtered = filtered.filter(b => b.subCategory === subCategory);
  }

  // Status / Availability filter
  if (available === "true" || status === "Available") {
    filtered = filtered.filter(b => b.status === "Available");
  } else if (available === "false" || status === "Borrowed") {
    filtered = filtered.filter(b => b.status === "Borrowed");
  }

  // Full-text Multi-Field Search
  if (search) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(b =>
      (b.name && b.name.toLowerCase().includes(q)) ||
      (b.author && b.author.toLowerCase().includes(q)) ||
      (b.bookNumber && b.bookNumber.toLowerCase().includes(q)) ||
      (b.category && b.category.toLowerCase().includes(q)) ||
      (b.subCategory && b.subCategory.toLowerCase().includes(q)) ||
      (b.publisher && b.publisher.toLowerCase().includes(q)) ||
      (b.shelfLocation && b.shelfLocation.toLowerCase().includes(q))
    );
  }

  // Sorting
  const sortKey = sortBy || "addedDate";
  const isAsc = order === "asc";
  filtered.sort((a, b) => {
    let valA = a[sortKey] || "";
    let valB = b[sortKey] || "";

    if (typeof valA === "string") valA = valA.toLowerCase();
    if (typeof valB === "string") valB = valB.toLowerCase();

    if (valA < valB) return isAsc ? -1 : 1;
    if (valA > valB) return isAsc ? 1 : -1;
    return 0;
  });

  // Optional Pagination
  let result = filtered;
  if (limit) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10);
    const startIdx = (pageNum - 1) * limitNum;
    result = filtered.slice(startIdx, startIdx + limitNum);
  }

  res.json({
    success: true,
    count: result.length,
    total: filtered.length,
    books: result
  });
});

// GET /api/books/:id - Lookup by ID or Book Number (LIB-XXXX)
app.get("/api/books/:id", (req, res) => {
  const books = readJson(BOOKS_FILE, []);
  const target = req.params.id.trim().toLowerCase();
  const book = books.find(b => b.id.toLowerCase() === target || (b.bookNumber && b.bookNumber.toLowerCase() === target));

  if (!book) {
    return res.status(404).json({ success: false, message: `Book "${req.params.id}" not found.` });
  }

  res.json({ success: true, book });
});

// POST /api/books - Add New Book
app.post("/api/books", (req, res) => {
  const books = readJson(BOOKS_FILE, []);
  const {
    bookNumber,
    name,
    author,
    category,
    subCategory,
    totalPages,
    price,
    publisher,
    status,
    shelfLocation,
    coverPhoto,
    id
  } = req.body;

  if (!name || !name.trim() || !author || !author.trim() || !bookNumber || !bookNumber.trim()) {
    return res.status(400).json({
      success: false,
      message: "Book Name, Author, and Book Number are required."
    });
  }

  const cleanBookNumber = bookNumber.trim();

  // Enforce Unique Book Number
  const exists = books.some(b => b.bookNumber && b.bookNumber.toLowerCase() === cleanBookNumber.toLowerCase());
  if (exists) {
    return res.status(409).json({
      success: false,
      message: `Book Number "${cleanBookNumber}" is already in use by another book.`
    });
  }

  const generatedId = (id && String(id).trim()) || `book-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const coverResult = processCoverPhoto(generatedId, coverPhoto);

  const cleanCategory = (category || "General").trim();
  const cleanSubCategory = (subCategory || "General").trim();

  const newBook = {
    id: generatedId,
    bookNumber: cleanBookNumber,
    name: name.trim(),
    author: author.trim(),
    category: cleanCategory,
    subCategory: cleanSubCategory,
    totalPages: parseInt(totalPages, 10) || 0,
    price: parseFloat(price) || 0,
    publisher: (publisher || "").trim(),
    status: status === "Borrowed" ? "Borrowed" : "Available",
    shelfLocation: (shelfLocation || "").trim(),
    addedDate: new Date().toISOString().split("T")[0],
    coverPhoto: coverResult.url,
    coverPhotoData: coverResult.data || (req.body.coverPhotoData || "")
  };

  // Prepend new book
  books.unshift(newBook);
  writeJson(BOOKS_FILE, books);

  // Sync category taxonomy
  ensureCategoryExists(cleanCategory, cleanSubCategory);

  // Broadcast to all connected Web & Mobile clients
  notifyClients("book_added", { book: newBook });

  res.status(201).json({
    success: true,
    message: `"${newBook.name}" successfully added to library!`,
    book: newBook
  });
});

// PUT /api/books/:id - Update Book (Accepts ID or Book Number)
app.put("/api/books/:id", (req, res) => {
  const books = readJson(BOOKS_FILE, []);
  const target = req.params.id.trim().toLowerCase();
  const index = books.findIndex(b => b.id.toLowerCase() === target || (b.bookNumber && b.bookNumber.toLowerCase() === target));

  if (index === -1) {
    return res.status(404).json({ success: false, message: `Book "${req.params.id}" not found.` });
  }

  const current = books[index];
  const {
    bookNumber,
    name,
    author,
    category,
    subCategory,
    totalPages,
    price,
    publisher,
    status,
    shelfLocation,
    coverPhoto
  } = req.body;

  // If Book Number changed, check uniqueness
  if (bookNumber && bookNumber.trim().toLowerCase() !== current.bookNumber.toLowerCase()) {
    const exists = books.some((b, i) => i !== index && b.bookNumber && b.bookNumber.toLowerCase() === bookNumber.trim().toLowerCase());
    if (exists) {
      return res.status(409).json({
        success: false,
        message: `Book Number "${bookNumber.trim()}" is already assigned to another book.`
      });
    }
  }

  let updatedCover = current.coverPhoto;
  let updatedCoverData = current.coverPhotoData || "";
  if (coverPhoto !== undefined) {
    if (coverPhoto !== current.coverPhoto) {
      cleanupCoverFile(current.coverPhoto);
      const coverResult = processCoverPhoto(current.id, coverPhoto);
      updatedCover = coverResult.url;
      updatedCoverData = coverResult.data || current.coverPhotoData || "";
    }
  }

  const updatedCategory = category !== undefined ? category.trim() : current.category;
  const updatedSubCategory = subCategory !== undefined ? subCategory.trim() : current.subCategory;

  books[index] = {
    ...current,
    bookNumber: bookNumber !== undefined ? bookNumber.trim() : current.bookNumber,
    name: name !== undefined ? name.trim() : current.name,
    author: author !== undefined ? author.trim() : current.author,
    category: updatedCategory,
    subCategory: updatedSubCategory,
    totalPages: totalPages !== undefined ? parseInt(totalPages, 10) || 0 : current.totalPages,
    price: price !== undefined ? parseFloat(price) || 0 : current.price,
    publisher: publisher !== undefined ? publisher.trim() : current.publisher,
    status: status !== undefined ? (status === "Borrowed" ? "Borrowed" : "Available") : current.status,
    shelfLocation: shelfLocation !== undefined ? shelfLocation.trim() : current.shelfLocation,
    coverPhoto: updatedCover,
    coverPhotoData: updatedCoverData
  };

  writeJson(BOOKS_FILE, books);
  ensureCategoryExists(updatedCategory, updatedSubCategory);

  // Broadcast to all connected Web & Mobile clients
  notifyClients("book_updated", { book: books[index] });

  res.json({
    success: true,
    message: `"${books[index].name}" updated successfully!`,
    book: books[index]
  });
});

// PATCH /api/books/:id/status - Quick Toggle or Set Status
app.patch("/api/books/:id/status", (req, res) => {
  const books = readJson(BOOKS_FILE, []);
  const target = req.params.id.trim().toLowerCase();
  const index = books.findIndex(b => b.id.toLowerCase() === target || (b.bookNumber && b.bookNumber.toLowerCase() === target));

  if (index === -1) {
    return res.status(404).json({ success: false, message: `Book "${req.params.id}" not found.` });
  }

  const { status } = req.body;
  if (status && (status === "Available" || status === "Borrowed")) {
    books[index].status = status;
  } else {
    // Toggle current status
    books[index].status = books[index].status === "Available" ? "Borrowed" : "Available";
  }

  writeJson(BOOKS_FILE, books);

  // Broadcast to all connected Web & Mobile clients
  notifyClients("book_status_changed", { book: books[index] });

  res.json({
    success: true,
    message: `"${books[index].name}" status set to ${books[index].status}`,
    book: books[index]
  });
});

// POST /api/books/:id/toggle-status - Alternate status toggle route
app.post("/api/books/:id/toggle-status", (req, res) => {
  const books = readJson(BOOKS_FILE, []);
  const target = req.params.id.trim().toLowerCase();
  const index = books.findIndex(b => b.id.toLowerCase() === target || (b.bookNumber && b.bookNumber.toLowerCase() === target));

  if (index === -1) {
    return res.status(404).json({ success: false, message: "Book not found." });
  }

  books[index].status = books[index].status === "Available" ? "Borrowed" : "Available";
  writeJson(BOOKS_FILE, books);

  // Broadcast to all connected Web & Mobile clients
  notifyClients("book_status_changed", { book: books[index] });

  res.json({
    success: true,
    message: `"${books[index].name}" is now marked as ${books[index].status}`,
    book: books[index]
  });
});

// DELETE /api/books/:id - Delete Single Book
app.delete("/api/books/:id", (req, res) => {
  let books = readJson(BOOKS_FILE, []);
  const target = req.params.id.trim().toLowerCase();
  const book = books.find(b => b.id.toLowerCase() === target || (b.bookNumber && b.bookNumber.toLowerCase() === target));

  if (!book) {
    return res.status(404).json({ success: false, message: "Book not found." });
  }

  cleanupCoverFile(book.coverPhoto);
  books = books.filter(b => b.id !== book.id && b.bookNumber !== book.bookNumber);
  writeJson(BOOKS_FILE, books);

  // Broadcast to all connected Web & Mobile clients
  notifyClients("book_deleted", { id: book.id, bookNumber: book.bookNumber });

  res.json({
    success: true,
    message: `"${book.name}" (${book.bookNumber}) deleted from library.`
  });
});

// POST /api/books/batch-delete - Delete multiple books by array of IDs
app.post("/api/books/batch-delete", (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: "Array of book IDs required." });
  }

  let books = readJson(BOOKS_FILE, []);
  const lowerIds = ids.map(id => String(id).toLowerCase());

  const deletedBooks = books.filter(b => lowerIds.includes(b.id.toLowerCase()) || lowerIds.includes(b.bookNumber.toLowerCase()));
  deletedBooks.forEach(b => cleanupCoverFile(b.coverPhoto));

  books = books.filter(b => !lowerIds.includes(b.id.toLowerCase()) && !lowerIds.includes(b.bookNumber.toLowerCase()));
  writeJson(BOOKS_FILE, books);

  res.json({
    success: true,
    message: `Successfully removed ${deletedBooks.length} books.`,
    deletedCount: deletedBooks.length
  });
});

// ==========================================
// 4. Categories & Taxonomy Management
// ==========================================

// GET /api/categories - Full Categories Map
app.get("/api/categories", (req, res) => {
  const categories = readJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  res.json({ success: true, categories });
});

// POST /api/categories - Create New Main Category
app.post("/api/categories", (req, res) => {
  const categories = readJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  const { name, subCategories } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: "Category name required." });
  }

  const trimmed = name.trim();
  if (categories[trimmed]) {
    return res.status(409).json({ success: false, message: `Category "${trimmed}" already exists.` });
  }

  categories[trimmed] = Array.isArray(subCategories) && subCategories.length > 0 ? subCategories : ["General"];
  writeJson(CATEGORIES_FILE, categories);

  res.status(201).json({
    success: true,
    message: `Category "${trimmed}" created!`,
    categories
  });
});

// PUT /api/categories/:name - Rename Main Category
app.put("/api/categories/:name", (req, res) => {
  const categories = readJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  const oldName = req.params.name;
  const { newName } = req.body;

  if (!categories[oldName]) {
    return res.status(404).json({ success: false, message: `Category "${oldName}" not found.` });
  }
  if (!newName || !newName.trim()) {
    return res.status(400).json({ success: false, message: "New category name required." });
  }

  const trimmedNew = newName.trim();
  if (trimmedNew !== oldName && categories[trimmedNew]) {
    return res.status(409).json({ success: false, message: `Category "${trimmedNew}" already exists.` });
  }

  // Preserve subcategories and transfer
  const subs = categories[oldName];
  delete categories[oldName];
  categories[trimmedNew] = subs;
  writeJson(CATEGORIES_FILE, categories);

  // Update affected books
  const books = readJson(BOOKS_FILE, []);
  let affected = 0;
  books.forEach(b => {
    if (b.category === oldName) {
      b.category = trimmedNew;
      affected++;
    }
  });
  if (affected > 0) {
    writeJson(BOOKS_FILE, books);
  }

  res.json({
    success: true,
    message: `Category renamed to "${trimmedNew}". ${affected} books updated.`,
    categories
  });
});

// DELETE /api/categories/:name - Delete Main Category & Migrate Books
app.delete("/api/categories/:name", (req, res) => {
  const categories = readJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  const catName = req.params.name;

  if (!categories[catName]) {
    return res.status(404).json({ success: false, message: `Category "${catName}" not found.` });
  }

  if (Object.keys(categories).length <= 1) {
    return res.status(400).json({ success: false, message: "You must keep at least one category." });
  }

  delete categories[catName];
  writeJson(CATEGORIES_FILE, categories);

  // Reassign books belonging to deleted category to remaining first category
  const remainingKeys = Object.keys(categories);
  const fallbackCat = remainingKeys[0] || "General";
  const fallbackSub = (categories[fallbackCat] && categories[fallbackCat][0]) || "General";

  const books = readJson(BOOKS_FILE, []);
  let reassignedCount = 0;
  books.forEach(b => {
    if (b.category === catName) {
      b.category = fallbackCat;
      b.subCategory = fallbackSub;
      reassignedCount++;
    }
  });
  if (reassignedCount > 0) {
    writeJson(BOOKS_FILE, books);
  }

  res.json({
    success: true,
    message: `Category "${catName}" removed. ${reassignedCount} books moved to "${fallbackCat}".`,
    categories
  });
});

// POST /api/categories/:name/subcategories - Add Subcategory
app.post("/api/categories/:name/subcategories", (req, res) => {
  const categories = readJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  const catName = req.params.name;
  const { subCategory } = req.body;

  if (!categories[catName]) {
    return res.status(404).json({ success: false, message: `Category "${catName}" not found.` });
  }

  if (!subCategory || !subCategory.trim()) {
    return res.status(400).json({ success: false, message: "Subcategory name required." });
  }

  const trimmed = subCategory.trim();
  if (categories[catName].some(s => s.toLowerCase() === trimmed.toLowerCase())) {
    return res.status(409).json({ success: false, message: `"${trimmed}" already exists under "${catName}".` });
  }

  categories[catName].push(trimmed);
  writeJson(CATEGORIES_FILE, categories);

  res.status(201).json({
    success: true,
    message: `Subcategory "${trimmed}" added to "${catName}"!`,
    categories
  });
});

// DELETE /api/categories/:name/subcategories/:subName - Delete Subcategory
app.delete("/api/categories/:name/subcategories/:subName", (req, res) => {
  const categories = readJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  const catName = req.params.name;
  const subName = req.params.subName;

  if (!categories[catName]) {
    return res.status(404).json({ success: false, message: `Category "${catName}" not found.` });
  }

  categories[catName] = categories[catName].filter(s => s !== subName);
  writeJson(CATEGORIES_FILE, categories);

  // Update affected books to "General"
  const fallbackSub = (categories[catName] && categories[catName][0]) || "General";
  const books = readJson(BOOKS_FILE, []);
  let affected = 0;
  books.forEach(b => {
    if (b.category === catName && b.subCategory === subName) {
      b.subCategory = fallbackSub;
      affected++;
    }
  });
  if (affected > 0) {
    writeJson(BOOKS_FILE, books);
  }

  res.json({
    success: true,
    message: `Subcategory "${subName}" removed from "${catName}".`,
    categories
  });
});

// PUT /api/categories - Full Categories Sync / Replace
app.put("/api/categories", (req, res) => {
  const { categories } = req.body;
  if (!categories || typeof categories !== "object" || Array.isArray(categories)) {
    return res.status(400).json({ success: false, message: "Valid categories mapping object required." });
  }

  writeJson(CATEGORIES_FILE, categories);
  res.json({ success: true, message: "Categories updated successfully.", categories });
});

// ==========================================
// 5. Settings & Security
// ==========================================
app.get("/api/settings", (req, res) => {
  const settings = readJson(SETTINGS_FILE, DEFAULT_SETTINGS);
  res.json({ success: true, settings });
});

app.put("/api/settings", (req, res) => {
  const current = readJson(SETTINGS_FILE, DEFAULT_SETTINGS);
  const { pin, lockEnabled, libraryName, theme } = req.body;

  const updated = {
    ...current,
    pin: pin !== undefined ? String(pin) : current.pin,
    lockEnabled: lockEnabled !== undefined ? Boolean(lockEnabled) : current.lockEnabled,
    libraryName: libraryName !== undefined ? String(libraryName).trim() : current.libraryName,
    theme: theme !== undefined ? String(theme) : current.theme
  };

  writeJson(SETTINGS_FILE, updated);
  res.json({ success: true, message: "Settings saved successfully.", settings: updated });
});

// POST /api/settings/verify-pin - Validate user pin
app.post("/api/settings/verify-pin", (req, res) => {
  const settings = readJson(SETTINGS_FILE, DEFAULT_SETTINGS);
  const { pin } = req.body;
  const isValid = String(pin) === String(settings.pin);
  res.json({ success: true, valid: isValid });
});

// ==========================================
// 6. Direct Media / Image Upload Endpoint
// ==========================================
app.post("/api/upload", (req, res) => {
  const { image, filename } = req.body;
  if (!image || typeof image !== "string") {
    return res.status(400).json({ success: false, message: "Base64 image payload required." });
  }

  const coverResult = processCoverPhoto(filename || "upload", image);
  if (coverResult && coverResult.url && coverResult.url.startsWith("/uploads/")) {
    res.status(201).json({ success: true, url: coverResult.url });
  } else {
    res.status(400).json({ success: false, message: "Failed to process image." });
  }
});

// ==========================================
// 7. Conversational Chat Search Endpoint
// ==========================================
app.post("/api/chat-search", (req, res) => {
  const { query } = req.body;
  const rawQuery = (query || "").trim().toLowerCase();

  if (!rawQuery) {
    return res.json({ success: true, message: "Please enter an author name or book query.", books: [] });
  }

  const books = readJson(BOOKS_FILE, []);

  // Strip common conversational prefixes
  const cleaned = rawQuery
    .replace(/^(books?\s+(written\s+)?by|author|show\s+(me\s+)?books?\s+by|find\s+books?\s+by|search\s+author|search\s+for|do\s+you\s+have\s+books?\s+by)\s+/i, "")
    .trim();

  // 1. Author Match
  let matched = books.filter(b => {
    const a = (b.author || "").toLowerCase();
    return a === cleaned || a.includes(cleaned) || (cleaned.length >= 3 && cleaned.includes(a));
  });

  // 2. Availability query
  if (matched.length === 0 && (rawQuery.includes("available") || rawQuery === "check available")) {
    matched = books.filter(b => b.status === "Available");
    return res.json({
      success: true,
      queryType: "availability",
      message: `Found ${matched.length} available book${matched.length === 1 ? "" : "s"} ready on shelf.`,
      books: matched
    });
  }

  // 3. Fallback: Title / Book number / Category search
  if (matched.length === 0) {
    matched = books.filter(b =>
      (b.name && b.name.toLowerCase().includes(cleaned)) ||
      (b.bookNumber && b.bookNumber.toLowerCase() === cleaned) ||
      (b.category && b.category.toLowerCase().includes(cleaned))
    );
  }

  res.json({
    success: true,
    queryType: "general",
    count: matched.length,
    message: matched.length > 0
      ? `Found ${matched.length} matching book${matched.length === 1 ? "" : "s"}.`
      : `No books found matching "${query}".`,
    books: matched
  });
});

// ==========================================
// 8. Backup, Snapshot & Restore Studio
// ==========================================
function getBackupPayload() {
  const books = readJson(BOOKS_FILE, []);
  const categories = readJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  const settings = readJson(SETTINGS_FILE, DEFAULT_SETTINGS);

  return {
    app: "PayLib",
    version: "2.0.0",
    exportedAt: new Date().toISOString(),
    stats: {
      totalBooks: books.length,
      availableBooks: books.filter(b => b.status === "Available").length,
      borrowedBooks: books.filter(b => b.status === "Borrowed").length,
      totalCategories: Object.keys(categories).length
    },
    data: {
      books,
      categories,
      settings
    }
  };
}

// GET /api/backup - Full Backup JSON payload
app.get("/api/backup", (req, res) => {
  const payload = getBackupPayload();
  res.json({ success: true, backup: payload });
});

// GET /api/backup/download - Direct File Download attachment
app.get("/api/backup/download", (req, res) => {
  const payload = getBackupPayload();
  const dateStr = new Date().toISOString().split("T")[0];
  const filename = `paylib_backup_${dateStr}.json`;

  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(payload, null, 2));
});

// POST /api/backup/snapshot - Save server snapshot to disk
app.post("/api/backup/snapshot", (req, res) => {
  const payload = getBackupPayload();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `snapshot_${timestamp}.json`;
  const filePath = path.join(BACKUPS_DIR, filename);

  const ok = writeJson(filePath, payload);
  if (ok) {
    res.json({
      success: true,
      message: `Server snapshot saved: ${filename}`,
      filename,
      timestamp: payload.exportedAt
    });
  } else {
    res.status(500).json({ success: false, message: "Failed to save server snapshot." });
  }
});

// GET /api/backup/snapshots - List all existing server snapshots
app.get("/api/backup/snapshots", (req, res) => {
  try {
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.endsWith(".json"))
      .map(file => {
        const full = path.join(BACKUPS_DIR, file);
        const stats = fs.statSync(full);
        return {
          filename: file,
          sizeBytes: stats.size,
          createdAt: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, snapshots: files });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error reading snapshots." });
  }
});

// GET /api/backup/snapshots/:filename/download - Download specific snapshot
app.get("/api/backup/snapshots/:filename/download", (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(BACKUPS_DIR, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: "Snapshot file not found." });
  }

  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
  res.setHeader("Content-Type", "application/json");
  fs.createReadStream(filePath).pipe(res);
});

// DELETE /api/backup/snapshots/:filename - Delete specific snapshot
app.delete("/api/backup/snapshots/:filename", (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(BACKUPS_DIR, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: "Snapshot not found." });
  }

  try {
    fs.unlinkSync(filePath);
    res.json({ success: true, message: `Snapshot "${safeFilename}" deleted.` });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to delete snapshot." });
  }
});

// POST /api/backup/restore - Restore Library (Supports BOTH filename from disk and uploaded payload)
app.post("/api/backup/restore", (req, res) => {
  const body = req.body;
  if (!body) {
    return res.status(400).json({ success: false, message: "No restore data received." });
  }

  let restoreData = null;

  // Mode 1: Restoring from server-side snapshot filename (e.g. { filename: "snapshot_...json" })
  if (body.filename) {
    const safeFilename = path.basename(body.filename);
    const snapshotPath = path.join(BACKUPS_DIR, safeFilename);

    if (!fs.existsSync(snapshotPath)) {
      return res.status(404).json({ success: false, message: `Snapshot file "${safeFilename}" not found on server.` });
    }

    try {
      const content = fs.readFileSync(snapshotPath, "utf-8");
      const parsed = JSON.parse(content);
      restoreData = parsed.data || parsed;
    } catch (err) {
      return res.status(500).json({ success: false, message: `Failed to read snapshot file: ${err.message}` });
    }
  } else {
    // Mode 2: Direct uploaded payload { data: { books, categories, settings } } or direct { books, categories }
    restoreData = body.data || body;
  }

  if (!restoreData || !Array.isArray(restoreData.books) || typeof restoreData.categories !== "object" || restoreData.categories === null) {
    return res.status(400).json({
      success: false,
      message: "Invalid backup format: Must contain valid 'books' array and 'categories' object."
    });
  }

  const { books, categories, settings } = restoreData;

  // Create automatic rollback snapshot before overwriting active database
  const rollbackPayload = getBackupPayload();
  const rollbackFilename = `rollback_${Date.now()}.json`;
  writeJson(path.join(BACKUPS_DIR, rollbackFilename), rollbackPayload);

  // Restore datasets atomically
  writeJson(BOOKS_FILE, books);
  writeJson(CATEGORIES_FILE, categories);
  if (settings && typeof settings === "object") {
    writeJson(SETTINGS_FILE, settings);
  }

  res.json({
    success: true,
    message: "Library successfully restored from backup!",
    restored: {
      booksCount: books.length,
      categoriesCount: Object.keys(categories).length,
      rollbackCreated: rollbackFilename
    }
  });
});

// POST /api/backup/reset - Factory Reset to clean initial state
app.post("/api/backup/reset", (req, res) => {
  // Save rollback first
  const rollbackPayload = getBackupPayload();
  writeJson(path.join(BACKUPS_DIR, `rollback_${Date.now()}.json`), rollbackPayload);

  writeJson(BOOKS_FILE, []);
  writeJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  writeJson(SETTINGS_FILE, DEFAULT_SETTINGS);

  res.json({
    success: true,
    message: "Library reset to original clean catalog.",
    restored: {
      booksCount: 0,
      categoriesCount: Object.keys(DEFAULT_CATEGORIES).length
    }
  });
});

// ==========================================
// 9. Error Handling & 404 Catch-All
// ==========================================

// Catch-all 404 for unhandled /api routes
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint ${req.method} ${req.originalUrl} not found.`
  });
});

// Global Express Error Handler
app.use((err, req, res, next) => {
  console.error("[SERVER ERROR]", err);

  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "Payload too large. Please use a smaller image or file."
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      message: "Malformed JSON payload received."
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});

// ==========================================
// 10. Start Server
// ==========================================
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("=================================================");
  console.log(`PayLib Server running on port ${PORT} (0.0.0.0:${PORT})`);
  console.log(`Dynamic Data Directory: ${DATA_DIR}`);
  console.log(`Uploads Directory:      ${UPLOADS_DIR}`);
  console.log(`Backups Directory:      ${BACKUPS_DIR}`);
  console.log("=================================================");
});

module.exports = app;
