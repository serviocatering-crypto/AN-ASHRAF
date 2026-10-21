const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");

// Enable CORS & JSON Body Parsing with generous limit for cover images
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Serve frontend static assets
app.use(express.static(__dirname));

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const BOOKS_FILE = path.join(DATA_DIR, "books.json");
const CATEGORIES_FILE = path.join(DATA_DIR, "categories.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

// Helper: Vector SVG Cover Generator for Default Showcase
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

// Initial Seed Data
const DEFAULT_CATEGORIES = {
  "Science": ["Biology", "Space & Astronomy", "Human Anatomy", "Physics", "Chemistry"],
  "Technology": ["Software Engineering", "Artificial Intelligence", "Web Development", "Mobile Apps", "Cybersecurity"],
  "Self-Help": ["Habits & Productivity", "Psychology & Mindset", "Mindfulness", "Personal Finance"],
  "Fiction": ["Classic Literature", "Mystery & Thriller", "Sci-Fi & Fantasy", "Historical Fiction"],
  "Business": ["Startups & Entrepreneurship", "Management & Leadership", "Marketing & Sales", "Economics"],
  "Philosophy": ["Stoicism", "Ethics & Morality", "Ancient Philosophy", "Logic"],
  "History": ["World History", "Ancient Civilizations", "Military History", "Biographies"]
};

const DEFAULT_BOOKS = [];

const DEFAULT_SETTINGS = {
  pin: "1234",
  lockEnabled: true
};

// Safe File Read/Write Utilities
function readJson(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) {
      writeJson(filePath, defaultValue);
      return defaultValue;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return defaultValue;
  }
}

function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
    return false;
  }
}

// Seed on startup if needed
readJson(BOOKS_FILE, DEFAULT_BOOKS);
readJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);
readJson(SETTINGS_FILE, DEFAULT_SETTINGS);

// ==========================================
// API Routes
// ==========================================

// 1. Health & Status
app.get("/api/status", (req, res) => {
  const books = readJson(BOOKS_FILE, []);
  res.json({
    status: "online",
    name: "PayLib Dynamic Backend",
    version: "1.0.0",
    totalBooks: books.length,
    availableBooks: books.filter(b => b.status === "Available").length,
    timestamp: new Date().toISOString()
  });
});

// 2. Books Collection
app.get("/api/books", (req, res) => {
  const books = readJson(BOOKS_FILE, []);
  const { category, subCategory, available, search } = req.query;

  let filtered = [...books];

  if (category && category !== "All") {
    filtered = filtered.filter(b => b.category === category);
  }
  if (subCategory && subCategory !== "All") {
    filtered = filtered.filter(b => b.subCategory === subCategory);
  }
  if (available === "true") {
    filtered = filtered.filter(b => b.status === "Available");
  }
  if (search) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(b =>
      (b.name && b.name.toLowerCase().includes(q)) ||
      (b.author && b.author.toLowerCase().includes(q)) ||
      (b.bookNumber && b.bookNumber.toLowerCase().includes(q)) ||
      (b.category && b.category.toLowerCase().includes(q)) ||
      (b.subCategory && b.subCategory.toLowerCase().includes(q)) ||
      (b.publisher && b.publisher.toLowerCase().includes(q))
    );
  }

  res.json({ success: true, count: filtered.length, books: filtered });
});

// 3. Single Book
app.get("/api/books/:id", (req, res) => {
  const books = readJson(BOOKS_FILE, []);
  const book = books.find(b => b.id === req.params.id);
  if (!book) {
    return res.status(404).json({ success: false, message: "Book not found" });
  }
  res.json({ success: true, book });
});

// 4. Add Book
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
    coverPhoto
  } = req.body;

  if (!name || !author || !bookNumber) {
    return res.status(400).json({
      success: false,
      message: "Book Name, Author, and Book Number are required."
    });
  }

  // Check unique book number
  const exists = books.some(b => b.bookNumber.toLowerCase() === bookNumber.trim().toLowerCase());
  if (exists) {
    return res.status(409).json({
      success: false,
      message: `Book Number ${bookNumber} is already in use.`
    });
  }

  const newBook = {
    id: (req.body.id && String(req.body.id).trim()) || `book-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    bookNumber: bookNumber.trim(),
    name: name.trim(),
    author: author.trim(),
    category: category || "General",
    subCategory: subCategory || "General",
    totalPages: parseInt(totalPages, 10) || 0,
    price: parseFloat(price) || 0,
    publisher: (publisher || "").trim(),
    status: status || "Available",
    shelfLocation: (shelfLocation || "").trim(),
    addedDate: new Date().toISOString().split("T")[0],
    coverPhoto: coverPhoto || ""
  };

  books.unshift(newBook);
  writeJson(BOOKS_FILE, books);

  res.status(201).json({
    success: true,
    message: `"${newBook.name}" successfully added to library!`,
    book: newBook
  });
});

// 5. Update Book
app.put("/api/books/:id", (req, res) => {
  const books = readJson(BOOKS_FILE, []);
  const index = books.findIndex(b => b.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ success: false, message: "Book not found." });
  }

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

  // If bookNumber changed, check uniqueness
  if (bookNumber && bookNumber.trim().toLowerCase() !== books[index].bookNumber.toLowerCase()) {
    const exists = books.some(b => b.id !== req.params.id && b.bookNumber.toLowerCase() === bookNumber.trim().toLowerCase());
    if (exists) {
      return res.status(409).json({
        success: false,
        message: `Book Number ${bookNumber} is already taken.`
      });
    }
  }

  books[index] = {
    ...books[index],
    bookNumber: bookNumber !== undefined ? bookNumber.trim() : books[index].bookNumber,
    name: name !== undefined ? name.trim() : books[index].name,
    author: author !== undefined ? author.trim() : books[index].author,
    category: category !== undefined ? category : books[index].category,
    subCategory: subCategory !== undefined ? subCategory : books[index].subCategory,
    totalPages: totalPages !== undefined ? parseInt(totalPages, 10) : books[index].totalPages,
    price: price !== undefined ? parseFloat(price) : books[index].price,
    publisher: publisher !== undefined ? publisher.trim() : books[index].publisher,
    status: status !== undefined ? status : books[index].status,
    shelfLocation: shelfLocation !== undefined ? shelfLocation.trim() : books[index].shelfLocation,
    coverPhoto: coverPhoto !== undefined ? coverPhoto : books[index].coverPhoto
  };

  writeJson(BOOKS_FILE, books);

  res.json({
    success: true,
    message: `"${books[index].name}" updated successfully!`,
    book: books[index]
  });
});

// 6. Delete Book
app.delete("/api/books/:id", (req, res) => {
  let books = readJson(BOOKS_FILE, []);
  const target = req.params.id;
  const book = books.find(b => b.id === target || b.bookNumber === target);

  if (!book) {
    return res.status(404).json({ success: false, message: "Book not found." });
  }

  books = books.filter(b => b.id !== book.id && b.bookNumber !== book.bookNumber);
  writeJson(BOOKS_FILE, books);

  res.json({
    success: true,
    message: `"${book.name}" (${book.bookNumber}) deleted from library.`
  });
});

// 7. Categories Management
app.get("/api/categories", (req, res) => {
  const categories = readJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  res.json({ success: true, categories });
});

// Add main category
app.post("/api/categories", (req, res) => {
  const categories = readJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: "Category name required." });
  }

  const trimmed = name.trim();
  if (categories[trimmed]) {
    return res.status(409).json({ success: false, message: `Category "${trimmed}" already exists.` });
  }

  categories[trimmed] = [];
  writeJson(CATEGORIES_FILE, categories);

  res.status(201).json({ success: true, message: `Category "${trimmed}" created!`, categories });
});

// Delete main category
app.delete("/api/categories/:name", (req, res) => {
  const categories = readJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  let catName = req.params.name;
  if (!categories[catName]) {
    try {
      const decoded = decodeURIComponent(req.params.name);
      if (categories[decoded]) catName = decoded;
    } catch (e) {}
  }

  if (!categories[catName]) {
    return res.status(404).json({ success: false, message: "Category not found." });
  }

  if (Object.keys(categories).length <= 1) {
    return res.status(400).json({ success: false, message: "You must keep at least one category." });
  }

  delete categories[catName];
  writeJson(CATEGORIES_FILE, categories);

  res.json({ success: true, message: `Category "${catName}" removed.`, categories });
});

// Add sub-category
app.post("/api/categories/:name/subcategories", (req, res) => {
  const categories = readJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  let catName = req.params.name;
  if (!categories[catName]) {
    try {
      const decoded = decodeURIComponent(req.params.name);
      if (categories[decoded]) catName = decoded;
    } catch (e) {}
  }
  const { subCategory } = req.body;

  if (!categories[catName]) {
    return res.status(404).json({ success: false, message: `Main category "${catName}" does not exist.` });
  }

  if (!subCategory || !subCategory.trim()) {
    return res.status(400).json({ success: false, message: "Sub-category name required." });
  }

  const trimmed = subCategory.trim();
  if (categories[catName].includes(trimmed)) {
    return res.status(409).json({ success: false, message: `"${trimmed}" already exists under ${catName}.` });
  }

  categories[catName].push(trimmed);
  writeJson(CATEGORIES_FILE, categories);

  res.status(201).json({
    success: true,
    message: `Added sub-category "${trimmed}" under ${catName}!`,
    categories
  });
});

// Delete sub-category
app.delete("/api/categories/:name/subcategories/:subName", (req, res) => {
  const categories = readJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  let catName = req.params.name;
  if (!categories[catName]) {
    try {
      const decoded = decodeURIComponent(req.params.name);
      if (categories[decoded]) catName = decoded;
    } catch (e) {}
  }

  if (!categories[catName]) {
    return res.status(404).json({ success: false, message: "Category not found." });
  }

  let subName = req.params.subName;
  if (!categories[catName].includes(subName)) {
    try {
      const decodedSub = decodeURIComponent(req.params.subName);
      if (categories[catName].includes(decodedSub)) subName = decodedSub;
    } catch (e) {}
  }

  categories[catName] = categories[catName].filter(s => s !== subName);
  writeJson(CATEGORIES_FILE, categories);

  res.json({
    success: true,
    message: `Removed sub-category "${subName}" from ${catName}.`,
    categories
  });
});

// 8. Settings Management (PIN, Lock)
app.get("/api/settings", (req, res) => {
  const settings = readJson(SETTINGS_FILE, DEFAULT_SETTINGS);
  res.json({ success: true, settings });
});

app.put("/api/settings", (req, res) => {
  const current = readJson(SETTINGS_FILE, DEFAULT_SETTINGS);
  const { pin, lockEnabled } = req.body;

  const updated = {
    ...current,
    pin: pin !== undefined ? String(pin) : current.pin,
    lockEnabled: lockEnabled !== undefined ? Boolean(lockEnabled) : current.lockEnabled
  };

  writeJson(SETTINGS_FILE, updated);
  res.json({ success: true, message: "Settings updated successfully.", settings: updated });
});

// ==========================================
// 9. Backup & Restore Endpoints
// ==========================================
const BACKUPS_DIR = path.join(DATA_DIR, "backups");
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// Generate full backup payload
function getBackupPayload() {
  const books = readJson(BOOKS_FILE, []);
  const categories = readJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  const settings = readJson(SETTINGS_FILE, DEFAULT_SETTINGS);

  return {
    app: "PayLib",
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    stats: {
      totalBooks: books.length,
      availableBooks: books.filter(b => b.status === "Available").length,
      totalCategories: Object.keys(categories).length
    },
    data: {
      books,
      categories,
      settings
    }
  };
}

// GET /api/backup - Get full backup JSON
app.get("/api/backup", (req, res) => {
  const payload = getBackupPayload();
  res.json({ success: true, backup: payload });
});

// GET /api/backup/download - Direct file download attachment
app.get("/api/backup/download", (req, res) => {
  const payload = getBackupPayload();
  const dateStr = new Date().toISOString().split("T")[0];
  const filename = `paylib_backup_${dateStr}.json`;

  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(payload, null, 2));
});

// POST /api/backup/snapshot - Save server-side snapshot to disk
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
    res.status(500).json({ success: false, message: "Failed to save snapshot file." });
  }
});

// GET /api/backup/snapshots - List existing server-side snapshots
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

// POST /api/backup/restore - Restore library from uploaded JSON
app.post("/api/backup/restore", (req, res) => {
  const body = req.body;
  if (!body) {
    return res.status(400).json({ success: false, message: "No backup data received." });
  }

  // Support both wrapped { data: { books, categories } } and direct { books, categories }
  const data = body.data || body;
  const books = data.books;
  const categories = data.categories;
  const settings = data.settings;

  if (!Array.isArray(books) || typeof categories !== "object" || categories === null) {
    return res.status(400).json({
      success: false,
      message: "Invalid backup format: Must contain valid 'books' array and 'categories' mapping."
    });
  }

  // Create auto-rollback snapshot before overwriting
  const rollbackPayload = getBackupPayload();
  const rollbackFile = path.join(BACKUPS_DIR, `rollback_${Date.now()}.json`);
  writeJson(rollbackFile, rollbackPayload);

  // Restore datasets
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
      categoriesCount: Object.keys(categories).length
    }
  });
});

// POST /api/backup/reset - Factory Reset to default demo library
app.post("/api/backup/reset", (req, res) => {
  // Save rollback first
  const rollbackPayload = getBackupPayload();
  writeJson(path.join(BACKUPS_DIR, `rollback_${Date.now()}.json`), rollbackPayload);

  writeJson(BOOKS_FILE, DEFAULT_BOOKS);
  writeJson(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  writeJson(SETTINGS_FILE, DEFAULT_SETTINGS);

  res.json({
    success: true,
    message: "Library reset to original sample catalog.",
    restored: {
      booksCount: DEFAULT_BOOKS.length,
      categoriesCount: Object.keys(DEFAULT_CATEGORIES).length
    }
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`PayLib Server running at http://localhost:${PORT}`);
  console.log(`Data stored dynamically in: ${DATA_DIR}`);
  console.log(`===============================================`);
});
