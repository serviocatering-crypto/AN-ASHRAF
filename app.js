/**
 * Google PayLib - Personal Library Management Application
 * Complete Client-Side State, Persistence, Label Printing, & Fullscreen Viewer
 * Includes Hierarchical Main Categories & Sub-Categories (e.g. Science -> Bio, Space, Human)
 */

// ==========================================
// Initial Sample Data (Pre-loaded Library)
// ==========================================
const DEFAULT_CATEGORIES_DATA = {
  "Science": ["Biology", "Space & Astronomy", "Human Anatomy", "Physics", "Chemistry"],
  "Technology": ["Software Engineering", "Artificial Intelligence", "Web Development", "Mobile Apps", "Cybersecurity"],
  "Self-Help": ["Habits & Productivity", "Psychology & Mindset", "Mindfulness", "Personal Finance"],
  "Fiction": ["Classic Literature", "Mystery & Thriller", "Sci-Fi & Fantasy", "Historical Fiction"],
  "Business": ["Startups & Entrepreneurship", "Management & Leadership", "Marketing & Sales", "Economics"],
  "Philosophy": ["Stoicism", "Ethics & Morality", "Ancient Philosophy", "Logic"],
  "History": ["World History", "Ancient Civilizations", "Military History", "Biographies"]
};

// High quality SVG generated covers for initial showcase
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
    <!-- Spine Accent -->
    <rect x="0" y="0" width="18" height="560" fill="rgba(0,0,0,0.2)" />
    <rect x="18" y="0" width="2" height="560" fill="rgba(255,255,255,0.2)" />
    
    <!-- Header Tag -->
    <rect x="40" y="44" width="130" height="26" rx="13" fill="rgba(255,255,255,0.25)" />
    <text x="105" y="61" fill="#ffffff" font-family="'Plus Jakarta Sans', sans-serif" font-size="11" font-weight="700" text-anchor="middle" letter-spacing="0.5">${category.toUpperCase()}</text>

    <!-- Main Title -->
    <text x="44" y="190" fill="#ffffff" font-family="'Plus Jakarta Sans', sans-serif" font-size="28" font-weight="800">
      <tspan x="44" dy="0">${title.slice(0, 18)}</tspan>
      <tspan x="44" dy="34">${title.slice(18, 36)}</tspan>
    </text>

    <!-- Decorative Line -->
    <rect x="44" y="270" width="56" height="4" rx="2" fill="#ffffff" opacity="0.8" />

    <!-- Author -->
    <text x="44" y="320" fill="rgba(255,255,255,0.9)" font-family="'Plus Jakarta Sans', sans-serif" font-size="15" font-weight="600">BY ${author.toUpperCase()}</text>
    
    <!-- Library Seal / Emblem -->
    <circle cx="330" cy="480" r="34" fill="rgba(255,255,255,0.18)" />
    <text x="330" y="486" fill="#ffffff" font-family="'Plus Jakarta Sans', sans-serif" font-size="18" font-weight="800" text-anchor="middle">LIB</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const DEFAULT_BOOKS = [];

// ==========================================
// Application State
// ==========================================
let books = [];
let categoriesMap = {}; // Format: { "Science": ["Biology", "Space & Astronomy", "Human Anatomy", ...], ... }
let currentFilter = {
  search: "",
  category: "All",
  subCategory: "All",
  availableOnly: false,
  sortBy: "name"
};

// Security & App Lock State (Google Pay Security)
let libraryPin = "1234";
let lockEnabled = true;
let isUnlocked = false;
let enteredPinBuffer = "";

// Fullscreen Viewer State
let currentFsZoom = 1;
let currentFsRotation = 0;
let currentPrintingBook = null;
let currentLabelFormat = "spine";

// ==========================================
// ==========================================
// Dynamic Backend API Client & Persistent Storage
// ==========================================
const API_BASE = (window.location.protocol === "http:" || window.location.protocol === "https:") && window.location.port !== "3000"
  ? "http://localhost:3000/api"
  : "/api";

let isBackendOnline = false;
const BACKEND_SYNC_INTERVAL_MS = 5000;
let backendAutoSyncTimer = null;
let lastSyncedBooksHash = "";
let lastSyncedCatsHash = "";
let lastSyncedSettingsHash = "";
let isSyncInProgress = false;

function updateBackendStatusBadge(online, syncing = false) {
  const badge = document.getElementById("backendStatusPill");
  const text = document.getElementById("backendStatusText");
  if (!badge || !text) return;

  if (online) {
    badge.classList.remove("offline");
    badge.title = "Connected to Dynamic Backend • Auto Syncs Every 5s";
    text.textContent = syncing ? "Syncing..." : "Backend Live • 5s";
    if (syncing) {
      badge.classList.add("syncing");
    } else {
      badge.classList.remove("syncing");
    }
  } else {
    badge.classList.remove("syncing");
    badge.classList.add("offline");
    badge.title = "Backend unreachable - using browser local storage";
    text.textContent = "Local Storage";
  }
}

async function checkBackendConnection() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${API_BASE}/status`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      isBackendOnline = true;
      updateBackendStatusBadge(true, false);
      return true;
    }
  } catch (e) {
    // Backend offline or unreachable
  }
  isBackendOnline = false;
  updateBackendStatusBadge(false, false);
  return false;
}

async function syncFromBackend(forceRefresh = false) {
  if (isSyncInProgress) return;
  isSyncInProgress = true;
  updateBackendStatusBadge(isBackendOnline, true);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    // Concurrently fetch Books, Categories, and Settings from Backend
    const [bRes, cRes, sRes] = await Promise.all([
      fetch(`${API_BASE}/books`, { signal: controller.signal }),
      fetch(`${API_BASE}/categories`, { signal: controller.signal }),
      fetch(`${API_BASE}/settings`, { signal: controller.signal })
    ]);
    clearTimeout(timer);

    if (!bRes.ok || !cRes.ok || !sRes.ok) {
      throw new Error("One or more backend endpoints unreachable");
    }

    isBackendOnline = true;

    const [bData, cData, sData] = await Promise.all([
      bRes.json(),
      cRes.json(),
      sRes.json()
    ]);

    let booksChanged = false;
    let catsChanged = false;

    // 1. Sync Books with deep diffing
    if (Array.isArray(bData.books)) {
      const bHash = JSON.stringify(bData.books);
      if (bHash !== lastSyncedBooksHash || forceRefresh) {
        lastSyncedBooksHash = bHash;
        books = bData.books;
        booksChanged = true;
        try {
          localStorage.setItem("gpaylib_books_v2", bHash);
        } catch (e) { }
      }
    }

    // 2. Sync Categories with deep diffing
    if (cData.categories && typeof cData.categories === "object") {
      const cHash = JSON.stringify(cData.categories);
      if (cHash !== lastSyncedCatsHash || forceRefresh) {
        lastSyncedCatsHash = cHash;
        categoriesMap = cData.categories;
        catsChanged = true;
        try {
          localStorage.setItem("gpaylib_categories_map", cHash);
        } catch (e) { }
      }
    }

    // 3. Sync Settings with deep diffing
    if (sData.settings) {
      const sHash = JSON.stringify(sData.settings);
      if (sHash !== lastSyncedSettingsHash || forceRefresh) {
        lastSyncedSettingsHash = sHash;
        if (sData.settings.pin) libraryPin = sData.settings.pin;
        if (sData.settings.lockEnabled !== undefined) {
          lockEnabled = sData.settings.lockEnabled;
          if (lockEnabledCheckbox) lockEnabledCheckbox.checked = lockEnabled;
        }
      }
    }

    // Only update UI if changes occurred or forced
    if (catsChanged) {
      renderCategoryChips();
      renderSubCategoryChips();
      // Protect user's input if book modal is open
      const isBookModalOpen = bookModalBackdrop && bookModalBackdrop.classList.contains("open");
      if (!isBookModalOpen) {
        populateCategoryDropdowns();
      }
    }

    if (booksChanged) {
      renderBooks();
      updateAvailabilityCounter();
    }

    updateBackendStatusBadge(true, false);
  } catch (err) {
    // Backend offline / unreachable
    isBackendOnline = false;
    updateBackendStatusBadge(false, false);
  } finally {
    isSyncInProgress = false;
    setTimeout(() => {
      const badge = document.getElementById("backendStatusPill");
      if (badge && !isSyncInProgress && isBackendOnline) {
        badge.classList.remove("syncing");
      }
    }, 450);
  }
}

function startAutoBackendSync() {
  if (backendAutoSyncTimer) clearInterval(backendAutoSyncTimer);

  // 1. Initial immediate sync
  syncFromBackend(true);

  // 2. Recurring 5-second automatic sync (bring data from backend to frontend every 5 seconds)
  backendAutoSyncTimer = setInterval(() => {
    syncFromBackend(false);
  }, BACKEND_SYNC_INTERVAL_MS);
}

// Backend API CRUD Operations
async function apiAddBook(book) {
  if (!isBackendOnline) return;
  try {
    await fetch(`${API_BASE}/books`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(book)
    });
  } catch (err) {
    console.error("apiAddBook error:", err);
  }
}

async function apiUpdateBook(id, book) {
  if (!isBackendOnline) return;
  try {
    await fetch(`${API_BASE}/books/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(book)
    });
  } catch (err) {
    console.error("apiUpdateBook error:", err);
  }
}

async function apiDeleteBook(id) {
  if (!isBackendOnline) return;
  try {
    await fetch(`${API_BASE}/books/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
  } catch (err) {
    console.error("apiDeleteBook error:", err);
  }
}

async function apiAddCategory(name) {
  if (!isBackendOnline) return;
  try {
    await fetch(`${API_BASE}/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
  } catch (err) {
    console.error("apiAddCategory error:", err);
  }
}

async function apiDeleteCategory(name) {
  if (!isBackendOnline) return;
  try {
    await fetch(`${API_BASE}/categories/${encodeURIComponent(name)}`, {
      method: "DELETE"
    });
  } catch (err) {
    console.error("apiDeleteCategory error:", err);
  }
}

async function apiAddSubCategory(mainCat, subCategory) {
  if (!isBackendOnline) return;
  try {
    await fetch(`${API_BASE}/categories/${encodeURIComponent(mainCat)}/subcategories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subCategory })
    });
  } catch (err) {
    console.error("apiAddSubCategory error:", err);
  }
}

async function apiDeleteSubCategory(mainCat, subCategory) {
  if (!isBackendOnline) return;
  try {
    await fetch(`${API_BASE}/categories/${encodeURIComponent(mainCat)}/subcategories/${encodeURIComponent(subCategory)}`, {
      method: "DELETE"
    });
  } catch (err) {
    console.error("apiDeleteSubCategory error:", err);
  }
}

async function apiUpdateSettings(settings) {
  if (!isBackendOnline) return;
  try {
    await fetch(`${API_BASE}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
  } catch (err) {
    console.error("apiUpdateSettings error:", err);
  }
}

// Storage Helpers
function loadStorageData() {
  try {
    const storedBooks = localStorage.getItem("gpaylib_books_v2");
    const storedCatsMap = localStorage.getItem("gpaylib_categories_map");
    const storedTheme = localStorage.getItem("gpaylib_theme");
    const storedPin = localStorage.getItem("gpaylib_pin");
    const storedLockEnabled = localStorage.getItem("gpaylib_lock_enabled");
    const sessionUnlocked = sessionStorage.getItem("gpaylib_unlocked");

    // Load Security State
    libraryPin = storedPin || "1234";
    lockEnabled = storedLockEnabled !== "false";
    isUnlocked = sessionUnlocked === "true";

    // Load Categories Map
    if (storedCatsMap) {
      categoriesMap = JSON.parse(storedCatsMap);
    } else {
      categoriesMap = { ...DEFAULT_CATEGORIES_DATA };
    }

    // Load Books
    if (storedBooks) {
      const parsed = JSON.parse(storedBooks);
      const defaultSampleTitles = [
        "Atomic Habits", "Clean Architecture", "Astrophysics for People in a Hurry",
        "The Psychology of Money", "Deep Work", "Sapiens: A Brief History of Humankind",
        "Zero to One", "The Pragmatic Programmer"
      ];
      books = Array.isArray(parsed)
        ? parsed.filter(b =>
          !["book-1", "book-2", "book-3", "book-4", "book-5", "book-6", "book-7", "book-8"].includes(b.id) &&
          !defaultSampleTitles.includes(b.name)
        )
        : [];
      localStorage.setItem("gpaylib_books_v2", JSON.stringify(books));
    } else {
      books = [];
      localStorage.setItem("gpaylib_books_v2", JSON.stringify([]));
    }

    if (storedTheme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  } catch (e) {
    console.error("Storage loading error:", e);
    categoriesMap = { ...DEFAULT_CATEGORIES_DATA };
    books = DEFAULT_BOOKS;
    libraryPin = "1234";
    lockEnabled = true;
  }
}

function getDefaultSubCategory(mainCategory) {
  if (categoriesMap[mainCategory] && categoriesMap[mainCategory].length > 0) {
    return categoriesMap[mainCategory][0];
  }
  return "General";
}

function saveBooksToStorage() {
  try {
    localStorage.setItem("gpaylib_books_v2", JSON.stringify(books));
  } catch (e) {
    console.error("Storage write error:", e);
    showToast("Error saving data (storage might be full)", "error");
  }
}

function saveCategoriesToStorage() {
  try {
    localStorage.setItem("gpaylib_categories_map", JSON.stringify(categoriesMap));
  } catch (e) {
    console.error("Storage write error:", e);
  }
}

function getMainCategories() {
  return Object.keys(categoriesMap);
}

function getSubCategories(mainCat) {
  return categoriesMap[mainCat] || [];
}

// ==========================================
// DOM Elements
// ==========================================
const booksGrid = document.getElementById("booksGrid");
const emptyState = document.getElementById("emptyState");
const booksCountBadge = document.getElementById("booksCountBadge");
const shelfDisplayTitle = document.getElementById("shelfDisplayTitle");
const liveAvailabilityCounter = document.getElementById("liveAvailabilityCounter");
const availabilityToggleCheckbox = document.getElementById("availabilityToggleCheckbox");
const switchLabel = document.getElementById("switchLabel");
const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const categoryChipsContainer = document.getElementById("categoryChipsContainer");
const subCategoryChipsSection = document.getElementById("subCategoryChipsSection");
const subCategoryChipsContainer = document.getElementById("subCategoryChipsContainer");
const subChipsCategoryLabel = document.getElementById("subChipsCategoryLabel");
const sortChips = document.querySelectorAll(".sort-chip");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const navTabs = document.querySelectorAll(".nav-tab");

// Modals
const bookModalBackdrop = document.getElementById("bookModalBackdrop");
const bookForm = document.getElementById("bookForm");
const bookModalTitle = document.getElementById("bookModalTitle");
const bookIdInput = document.getElementById("bookIdInput");
const bookNumberInput = document.getElementById("bookNumberInput");
const bookNameInput = document.getElementById("bookNameInput");
const authorInput = document.getElementById("authorInput");
const categorySelect = document.getElementById("categorySelect");
const subCategorySelect = document.getElementById("subCategorySelect");
const quickAddSubCatBtn = document.getElementById("quickAddSubCatBtn");
const pagesInput = document.getElementById("pagesInput");
const priceInput = document.getElementById("priceInput");
const publisherInput = document.getElementById("publisherInput");
const bookStatusSelect = document.getElementById("bookStatusSelect");
const shelfLocationInput = document.getElementById("shelfLocationInput");
const coverUploadBox = document.getElementById("coverUploadBox");
const coverFileInput = document.getElementById("coverFileInput");
const coverPreviewWrapper = document.getElementById("coverPreviewWrapper");
const coverPreviewImg = document.getElementById("coverPreviewImg");
const uploaderPlaceholder = document.getElementById("uploaderPlaceholder");
const removeCoverBtn = document.getElementById("removeCoverBtn");
const viewCoverPreviewFullBtn = document.getElementById("viewCoverPreviewFullBtn");

// Fullscreen Viewer
const fullscreenViewerModal = document.getElementById("fullscreenViewerModal");
const fullscreenImg = document.getElementById("fullscreenImg");
const fullscreenTitle = document.getElementById("fullscreenTitle");
const fullscreenAuthorDetails = document.getElementById("fullscreenAuthorDetails");
const fsCloseBtn = document.getElementById("fsCloseBtn");
const fsZoomInBtn = document.getElementById("fsZoomInBtn");
const fsZoomOutBtn = document.getElementById("fsZoomOutBtn");
const fsRotateBtn = document.getElementById("fsRotateBtn");

// Print Modal
const printModalBackdrop = document.getElementById("printModalBackdrop");
const renderedLabel = document.getElementById("renderedLabel");
const triggerPrintBtn = document.getElementById("triggerPrintBtn");
const closePrintModalBtn = document.getElementById("closePrintModalBtn");
const cancelPrintBtn = document.getElementById("cancelPrintBtn");
const formatTabs = document.querySelectorAll(".format-tab");

// Chat Search Studio Modal
const chatSearchModalBackdrop = document.getElementById("chatSearchModalBackdrop");
const closeChatSearchBtn = document.getElementById("closeChatSearchBtn");
const openChatSearchFromBarBtn = document.getElementById("openChatSearchFromBarBtn");
const openChatSearchQuickBtn = document.getElementById("openChatSearchQuickBtn");
const openChatSearchFabBtn = document.getElementById("openChatSearchFabBtn");
const navChatTab = document.getElementById("navChatTab");
const chatSearchForm = document.getElementById("chatSearchForm");
const chatSearchInputField = document.getElementById("chatSearchInputField");
const chatMessagesContainer = document.getElementById("chatMessagesContainer");
const chatChipsContainer = document.getElementById("chatChipsContainer");
const clearChatHistoryBtn = document.getElementById("clearChatHistoryBtn");

// Category Studio Modal
const categoryModalBackdrop = document.getElementById("categoryModalBackdrop");
const openAddCategoryBtn = document.getElementById("openAddCategoryBtn");
const closeCategoryModalBtn = document.getElementById("closeCategoryModalBtn");
const closeCategoryDoneBtn = document.getElementById("closeCategoryDoneBtn");
const tabSubCategoriesBtn = document.getElementById("tabSubCategoriesBtn");
const tabMainCategoriesBtn = document.getElementById("tabMainCategoriesBtn");
const panelSubCategories = document.getElementById("panelSubCategories");
const panelMainCategories = document.getElementById("panelMainCategories");
const manageCatSelect = document.getElementById("manageCatSelect");
const newSubCategoryInput = document.getElementById("newSubCategoryInput");
const saveSubCategoryBtn = document.getElementById("saveSubCategoryBtn");
const existingSubCategoriesList = document.getElementById("existingSubCategoriesList");
const currentSubCatsHeader = document.getElementById("currentSubCatsHeader");
const newCategoryInput = document.getElementById("newCategoryInput");
const saveCategoryBtn = document.getElementById("saveCategoryBtn");
const existingCategoriesList = document.getElementById("existingCategoriesList");

// Stats Modal
const statsModalBackdrop = document.getElementById("statsModalBackdrop");
const quickStatsBtn = document.getElementById("quickStatsBtn");
const closeStatsModalBtn = document.getElementById("closeStatsModalBtn");
const closeStatsBtn2 = document.getElementById("closeStatsBtn2");
const statTotalBooks = document.getElementById("statTotalBooks");
const statAvailableBooks = document.getElementById("statAvailableBooks");
const statBorrowedBooks = document.getElementById("statBorrowedBooks");
const statTotalPages = document.getElementById("statTotalPages");
const statTotalValuation = document.getElementById("statTotalValuation");
const categoryBreakdownList = document.getElementById("categoryBreakdownList");

// Buttons & Actions
const openAddBookBtn = document.getElementById("openAddBookBtn");
const fabAddBook = document.getElementById("fabAddBook");
const closeBookModalBtn = document.getElementById("closeBookModalBtn");
const cancelBookBtn = document.getElementById("cancelBookBtn");
const autoGenNumberBtn = document.getElementById("autoGenNumberBtn");
const filterAvailableBtn = document.getElementById("filterAvailableBtn");
const emptyResetBtn = document.getElementById("emptyResetBtn");

// ==========================================
// ==========================================
// Custom Interactive Pop-Up Dialog System (Google Pay style)
// ==========================================
const nativeAlert = window.alert ? window.alert.bind(window) : (m) => console.log(m);
const nativeConfirm = window.confirm ? window.confirm.bind(window) : () => true;
const nativePrompt = window.prompt ? window.prompt.bind(window) : (m, d) => d;

let customPopupBackdrop = document.getElementById("customPopupBackdrop");
let customPopupCard = document.getElementById("customPopupCard");
let popupIconWrapper = document.getElementById("popupIconWrapper");
let popupIcon = document.getElementById("popupIcon");
let popupCloseXBtn = document.getElementById("popupCloseXBtn");
let popupTitle = document.getElementById("popupTitle");
let popupMessage = document.getElementById("popupMessage");
let popupInputGroup = document.getElementById("popupInputGroup");
let popupInputLabel = document.getElementById("popupInputLabel");
let popupTextInput = document.getElementById("popupTextInput");
let popupCancelBtn = document.getElementById("popupCancelBtn");
let popupConfirmBtn = document.getElementById("popupConfirmBtn");

function refreshPopupElements() {
  customPopupBackdrop = document.getElementById("customPopupBackdrop");
  customPopupCard = document.getElementById("customPopupCard");
  popupIconWrapper = document.getElementById("popupIconWrapper");
  popupIcon = document.getElementById("popupIcon");
  popupCloseXBtn = document.getElementById("popupCloseXBtn");
  popupTitle = document.getElementById("popupTitle");
  popupMessage = document.getElementById("popupMessage");
  popupInputGroup = document.getElementById("popupInputGroup");
  popupInputLabel = document.getElementById("popupInputLabel");
  popupTextInput = document.getElementById("popupTextInput");
  popupCancelBtn = document.getElementById("popupCancelBtn");
  popupConfirmBtn = document.getElementById("popupConfirmBtn");
}

let activePopupResolver = null;

function closeCustomPopup(result = null) {
  refreshPopupElements();
  if (customPopupBackdrop) {
    customPopupBackdrop.classList.remove("open");
  }
  if (activePopupResolver) {
    const fn = activePopupResolver;
    activePopupResolver = null;
    fn(result);
  }
}

function showCustomConfirm({
  title = "Please Confirm",
  message = "Are you sure you want to proceed?",
  icon = "help",
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false
} = {}) {
  return new Promise((resolve) => {
    refreshPopupElements();

    if (!customPopupBackdrop || !popupTitle || !popupConfirmBtn) {
      // Safe fallback if custom popup is missing in DOM
      const ok = nativeConfirm(`${title}\n\n${message}`);
      resolve(ok);
      return;
    }

    activePopupResolver = (res) => resolve(res === true);

    popupTitle.textContent = title;
    popupMessage.textContent = message;
    if (popupIcon) popupIcon.textContent = icon;
    popupConfirmBtn.textContent = confirmText;
    if (popupCancelBtn) {
      popupCancelBtn.textContent = cancelText;
      popupCancelBtn.style.display = "inline-flex";
    }

    if (popupIconWrapper) {
      popupIconWrapper.className = "popup-icon-wrapper" + (danger ? " danger" : "");
    }
    popupConfirmBtn.className = "gpay-pill-btn primary" + (danger ? " danger-btn" : "");

    if (popupInputGroup) popupInputGroup.style.display = "none";
    customPopupBackdrop.classList.add("open");

    setTimeout(() => popupConfirmBtn.focus(), 60);
  });
}

function showCustomPrompt({
  title = "Input Required",
  message = "Please enter the required information:",
  defaultValue = "",
  placeholder = "Enter text...",
  label = "Value",
  icon = "edit",
  confirmText = "Save",
  cancelText = "Cancel",
  danger = false
} = {}) {
  return new Promise((resolve) => {
    refreshPopupElements();

    if (!customPopupBackdrop || !popupTitle || !popupTextInput) {
      const res = nativePrompt(`${title}\n\n${message}`, defaultValue);
      resolve(res);
      return;
    }

    activePopupResolver = (res) => {
      resolve(res === true ? popupTextInput.value.trim() : null);
    };

    popupTitle.textContent = title;
    popupMessage.textContent = message;
    if (popupIcon) popupIcon.textContent = icon;
    if (popupInputLabel) popupInputLabel.textContent = label;
    popupTextInput.placeholder = placeholder;
    popupTextInput.value = defaultValue;
    popupConfirmBtn.textContent = confirmText;
    if (popupCancelBtn) {
      popupCancelBtn.textContent = cancelText;
      popupCancelBtn.style.display = "inline-flex";
    }

    if (popupIconWrapper) {
      popupIconWrapper.className = "popup-icon-wrapper" + (danger ? " danger" : "");
    }
    popupConfirmBtn.className = "gpay-pill-btn primary" + (danger ? " danger-btn" : "");

    if (popupInputGroup) popupInputGroup.style.display = "flex";
    customPopupBackdrop.classList.add("open");

    setTimeout(() => {
      popupTextInput.focus();
      popupTextInput.select();
    }, 60);
  });
}

function showCustomAlert({
  title = "PayLib Notice",
  message = "",
  icon = "info",
  buttonText = "Got it",
  type = "info"
} = {}) {
  return new Promise((resolve) => {
    refreshPopupElements();

    if (!customPopupBackdrop || !popupTitle || !popupConfirmBtn) {
      nativeAlert(`${title}\n\n${message}`);
      resolve();
      return;
    }

    activePopupResolver = () => resolve();

    popupTitle.textContent = title;
    popupMessage.textContent = message;
    if (popupIcon) popupIcon.textContent = icon;
    popupConfirmBtn.textContent = buttonText;
    if (popupCancelBtn) popupCancelBtn.style.display = "none";

    let iconClass = "popup-icon-wrapper";
    if (type === "warning") iconClass += " warning";
    else if (type === "error" || type === "danger") iconClass += " danger";
    else if (type === "success") iconClass += " success";
    if (popupIconWrapper) popupIconWrapper.className = iconClass;
    popupConfirmBtn.className = "gpay-pill-btn primary";

    if (popupInputGroup) popupInputGroup.style.display = "none";
    customPopupBackdrop.classList.add("open");

    setTimeout(() => popupConfirmBtn.focus(), 60);
  });
}

// Global browser window overrides
window.alert = (msg) => {
  return showCustomAlert({ title: "PayLib Notice", message: String(msg) });
};
window.confirm = (msg) => {
  return showCustomConfirm({ title: "Please Confirm", message: String(msg) });
};
window.prompt = (msg, def = "") => {
  return showCustomPrompt({ title: "Input Required", message: String(msg), defaultValue: def });
};

function initCustomPopupEvents() {
  refreshPopupElements();
  if (!customPopupBackdrop) return;

  if (popupCloseXBtn) popupCloseXBtn.addEventListener("click", () => closeCustomPopup(null));
  if (popupCancelBtn) popupCancelBtn.addEventListener("click", () => closeCustomPopup(null));
  if (popupConfirmBtn) popupConfirmBtn.addEventListener("click", () => closeCustomPopup(true));

  if (popupTextInput) {
    popupTextInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        closeCustomPopup(true);
      } else if (e.key === "Escape") {
        closeCustomPopup(null);
      }
    });
  }

  customPopupBackdrop.addEventListener("click", (e) => {
    if (e.target === customPopupBackdrop) {
      closeCustomPopup(null);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && customPopupBackdrop && customPopupBackdrop.classList.contains("open")) {
      closeCustomPopup(null);
    }
  });
}

// Toast
const gpayToast = document.getElementById("gpayToast");
const toastMessage = document.getElementById("toastMessage");
const toastIcon = document.getElementById("toastIcon");

// Lock Screen & Security DOM Elements
const libraryLockScreen = document.getElementById("libraryLockScreen");
const pinDotsContainer = document.getElementById("pinDotsContainer");
const pinDots = pinDotsContainer ? pinDotsContainer.querySelectorAll(".pin-dot") : [];
const pinKeyboardInput = document.getElementById("pinKeyboardInput");
const lockMessage = document.getElementById("lockMessage");
const gpayKeypad = document.getElementById("gpayKeypad");
const keyResetBtn = document.getElementById("keyResetBtn");
const keyBackspaceBtn = document.getElementById("keyBackspaceBtn");
const forgotPinBtn = document.getElementById("forgotPinBtn");
const lockLibraryBtn = document.getElementById("lockLibraryBtn");
const profileAvatarBtn = document.getElementById("profileAvatarBtn");

// Security Settings Modal DOM Elements
const securitySettingsModalBackdrop = document.getElementById("securitySettingsModalBackdrop");
const closeSecurityModalBtn = document.getElementById("closeSecurityModalBtn");
const closeSecurityBtn2 = document.getElementById("closeSecurityBtn2");
const lockEnabledCheckbox = document.getElementById("lockEnabledCheckbox");
const currentPinInput = document.getElementById("currentPinInput");
const newPinInput = document.getElementById("newPinInput");
const updatePinBtn = document.getElementById("updatePinBtn");
const lockNowBtn = document.getElementById("lockNowBtn");

// Backup & Restore Modal DOM Elements
const backupModalBackdrop = document.getElementById("backupModalBackdrop");
const openBackupBtn = document.getElementById("openBackupBtn");
const quickBackupBtn = document.getElementById("quickBackupBtn");
const openBackupFromSecurityBtn = document.getElementById("openBackupFromSecurityBtn");
const closeBackupModalBtn = document.getElementById("closeBackupModalBtn");
const closeBackupBtn2 = document.getElementById("closeBackupBtn2");
const backupStatBooks = document.getElementById("backupStatBooks");
const backupStatCategories = document.getElementById("backupStatCategories");
const backupStatServer = document.getElementById("backupStatServer");
const downloadBackupBtn = document.getElementById("downloadBackupBtn");
const saveServerSnapshotBtn = document.getElementById("saveServerSnapshotBtn");
const restoreFileInput = document.getElementById("restoreFileInput");
const refreshSnapshotsBtn = document.getElementById("refreshSnapshotsBtn");
const snapshotsList = document.getElementById("snapshotsList");
const resetSampleDataBtn = document.getElementById("resetSampleDataBtn");

let currentUploadedCover = "";

// ==========================================
// Initialization
// ==========================================
function initApp() {
  loadStorageData();
  initCustomPopupEvents();
  initLockScreen();
  renderCategoryChips();
  renderSubCategoryChips();
  populateCategoryDropdowns();
  renderBooks();
  updateAvailabilityCounter();
  bindEventListeners();
  startAutoBackendSync();
}

// ==========================================
// Availability Counter & Banner
// ==========================================
function updateAvailabilityCounter() {
  const total = books.length;
  const availableCount = books.filter(b => b.status === "Available").length;
  const borrowedCount = total - availableCount;

  liveAvailabilityCounter.textContent = `${availableCount} Available on Shelf • ${borrowedCount} Checked Out`;
}

// ==========================================
// Category & Sub-Category Chips (Google Pay Look)
// ==========================================
function renderCategoryChips() {
  categoryChipsContainer.innerHTML = "";
  const mainCategories = getMainCategories();

  // 'All' chip
  const allChip = document.createElement("button");
  allChip.className = `category-chip ${currentFilter.category === "All" ? "active" : ""}`;
  allChip.innerHTML = `<span class="material-symbols-rounded">apps</span> All Books`;
  allChip.addEventListener("click", () => {
    currentFilter.category = "All";
    currentFilter.subCategory = "All";
    renderCategoryChips();
    renderSubCategoryChips();
    renderBooks();
  });
  categoryChipsContainer.appendChild(allChip);

  // Individual Main Category chips
  mainCategories.forEach(cat => {
    const chip = document.createElement("button");
    chip.className = `category-chip ${currentFilter.category === cat ? "active" : ""}`;
    chip.textContent = cat;
    chip.addEventListener("click", () => {
      currentFilter.category = cat;
      currentFilter.subCategory = "All"; // Reset sub-category filter when changing category
      renderCategoryChips();
      renderSubCategoryChips();
      renderBooks();
    });
    categoryChipsContainer.appendChild(chip);
  });

  // '+ Category Studio' chip
  const addChip = document.createElement("button");
  addChip.className = "category-chip add-category-chip";
  addChip.innerHTML = `<span class="material-symbols-rounded">add</span> Manage Categories`;
  addChip.addEventListener("click", () => openCategoryModal());
  categoryChipsContainer.appendChild(addChip);
}

// Render Sub-Category Filter Bar (e.g. Science -> Biology, Space, Human Anatomy)
function renderSubCategoryChips() {
  if (currentFilter.category === "All") {
    subCategoryChipsSection.style.display = "none";
    return;
  }

  const subCategories = getSubCategories(currentFilter.category);
  subCategoryChipsSection.style.display = "block";
  subChipsCategoryLabel.innerHTML = `
    <span class="material-symbols-rounded" style="font-size: 14px; vertical-align: middle;">subdirectory_arrow_right</span>
    ${escapeHtml(currentFilter.category)} Sub-Categories:
  `;

  subCategoryChipsContainer.innerHTML = "";

  // 'All in [Category]' sub-chip
  const allSubChip = document.createElement("button");
  allSubChip.className = `sub-category-chip ${currentFilter.subCategory === "All" ? "active" : ""}`;
  allSubChip.textContent = `All ${currentFilter.category}`;
  allSubChip.addEventListener("click", () => {
    currentFilter.subCategory = "All";
    renderSubCategoryChips();
    renderBooks();
  });
  subCategoryChipsContainer.appendChild(allSubChip);

  // Render each sub-category
  subCategories.forEach(subCat => {
    const subChip = document.createElement("button");
    subChip.className = `sub-category-chip ${currentFilter.subCategory === subCat ? "active" : ""}`;
    subChip.textContent = subCat;
    subChip.addEventListener("click", () => {
      currentFilter.subCategory = subCat;
      renderSubCategoryChips();
      renderBooks();
    });
    subCategoryChipsContainer.appendChild(subChip);
  });

  // '+ Add Sub-Category' quick chip
  const addSubChip = document.createElement("button");
  addSubChip.className = "sub-category-chip add-sub-category-chip";
  addSubChip.innerHTML = `<span class="material-symbols-rounded" style="font-size: 14px;">add</span> Add Sub-Category`;
  addSubChip.addEventListener("click", () => {
    openCategoryModal("sub", currentFilter.category);
  });
  subCategoryChipsContainer.appendChild(addSubChip);
}

// ==========================================
// Category Dropdowns in Add/Edit Book Form
// ==========================================
function populateCategoryDropdowns() {
  const mainCategories = getMainCategories();

  // Populate Form categorySelect
  categorySelect.innerHTML = "";
  mainCategories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });

  // Populate Modal manageCatSelect
  manageCatSelect.innerHTML = "";
  mainCategories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    manageCatSelect.appendChild(opt);
  });

  // Populate sub-categories for current form selection
  updateSubCategoryDropdown();
}

function updateSubCategoryDropdown(selectedSubValue = "") {
  const currentMainCat = categorySelect.value || getMainCategories()[0];
  const subCats = getSubCategories(currentMainCat);

  subCategorySelect.innerHTML = "";

  if (subCats.length === 0) {
    const opt = document.createElement("option");
    opt.value = "General";
    opt.textContent = "General";
    subCategorySelect.appendChild(opt);
    return;
  }

  subCats.forEach(sub => {
    const opt = document.createElement("option");
    opt.value = sub;
    opt.textContent = sub;
    subCategorySelect.appendChild(opt);
  });

  if (selectedSubValue && subCats.includes(selectedSubValue)) {
    subCategorySelect.value = selectedSubValue;
  } else {
    subCategorySelect.value = subCats[0];
  }
}

// ==========================================
// Category & Sub-Category Modal Studio
// ==========================================
function openCategoryModal(mode = "main", targetMainCat = "") {
  populateCategoryDropdowns();

  if (targetMainCat && getMainCategories().includes(targetMainCat)) {
    manageCatSelect.value = targetMainCat;
  }

  if (mode === "sub") {
    switchCategoryTab("sub");
  } else {
    switchCategoryTab("main");
  }

  renderExistingSubCategoriesList();
  renderExistingMainCategoriesList();

  newSubCategoryInput.value = "";
  newCategoryInput.value = "";
  categoryModalBackdrop.classList.add("open");
}

function closeCategoryModal() {
  categoryModalBackdrop.classList.remove("open");
}

function switchCategoryTab(tabName) {
  if (tabName === "sub") {
    tabSubCategoriesBtn.classList.add("active");
    tabMainCategoriesBtn.classList.remove("active");
    panelSubCategories.style.display = "block";
    panelMainCategories.style.display = "none";
    renderExistingSubCategoriesList();
  } else {
    tabMainCategoriesBtn.classList.add("active");
    tabSubCategoriesBtn.classList.remove("active");
    panelMainCategories.style.display = "block";
    panelSubCategories.style.display = "none";
    renderExistingMainCategoriesList();
  }
}

function renderExistingSubCategoriesList() {
  const selectedMain = manageCatSelect.value;
  if (!selectedMain) return;

  currentSubCatsHeader.textContent = `Existing Sub-Categories in "${selectedMain}"`;
  existingSubCategoriesList.innerHTML = "";

  const subCats = getSubCategories(selectedMain);

  if (subCats.length === 0) {
    existingSubCategoriesList.innerHTML = `<span style="color: var(--text-tertiary); font-size: 13px;">No sub-categories yet. Add one above!</span>`;
    return;
  }

  subCats.forEach(sub => {
    const booksCount = books.filter(b => b.category === selectedMain && b.subCategory === sub).length;
    const item = document.createElement("div");
    item.className = "existing-cat-item";
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px;">
        <span class="material-symbols-rounded" style="color: var(--gpay-blue); font-size: 16px;">subdirectory_arrow_right</span>
        <span>${escapeHtml(sub)}</span>
        <small style="color: var(--text-tertiary); font-size: 11px;">(${booksCount} ${booksCount === 1 ? "book" : "books"})</small>
      </div>
      <button type="button" class="delete-cat-btn" data-sub="${escapeHtml(sub)}" title="Delete Sub-Category '${escapeHtml(sub)}'" aria-label="Delete Sub-Category ${escapeHtml(sub)}">
        <span class="material-symbols-rounded">delete</span>
      </button>
    `;
    item.querySelector(".delete-cat-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSubCategory(selectedMain, sub);
    });
    existingSubCategoriesList.appendChild(item);
  });
}

function renderExistingMainCategoriesList() {
  existingCategoriesList.innerHTML = "";
  const mainCategories = getMainCategories();

  mainCategories.forEach(cat => {
    const subCount = getSubCategories(cat).length;
    const booksCount = books.filter(b => b.category === cat).length;
    const item = document.createElement("div");
    item.className = "existing-cat-item";
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px;">
        <span class="material-symbols-rounded" style="color: var(--gpay-purple); font-size: 17px;">folder</span>
        <span style="font-weight: 600;">${escapeHtml(cat)}</span>
        <small style="color: var(--text-tertiary); font-size: 11px;">(${booksCount} books • ${subCount} subs)</small>
      </div>
      <button type="button" class="delete-cat-btn" data-cat="${escapeHtml(cat)}" title="Delete Main Category '${escapeHtml(cat)}'" aria-label="Delete Main Category ${escapeHtml(cat)}">
        <span class="material-symbols-rounded">delete</span>
      </button>
    `;
    item.querySelector(".delete-cat-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteMainCategory(cat);
    });
    existingCategoriesList.appendChild(item);
  });
}

function addNewSubCategory(mainCat, subCatName) {
  const trimmed = subCatName.trim();
  if (!trimmed) {
    showToast("Please enter a valid sub-category name", "warning");
    return;
  }

  if (!categoriesMap[mainCat]) {
    categoriesMap[mainCat] = [];
  }

  if (categoriesMap[mainCat].some(s => s.toLowerCase() === trimmed.toLowerCase())) {
    showToast(`"${trimmed}" already exists under ${mainCat}!`, "warning");
    return;
  }

  categoriesMap[mainCat].push(trimmed);
  saveCategoriesToStorage();
  lastSyncedCatsHash = JSON.stringify(categoriesMap);
  apiAddSubCategory(mainCat, trimmed);

  renderExistingSubCategoriesList();
  renderCategoryChips();
  renderSubCategoryChips();
  updateSubCategoryDropdown(trimmed);

  newSubCategoryInput.value = "";
  showToast(`Added sub-category "${trimmed}" under ${mainCat}!`);
}

async function deleteSubCategory(mainCat, subCatName) {
  if (!categoriesMap[mainCat]) return;

  const booksCount = books.filter(b => b.category === mainCat && b.subCategory === subCatName).length;
  const countMsg = booksCount > 0 
    ? `\n${booksCount} book${booksCount > 1 ? "s" : ""} currently using this sub-category will be moved to General.` 
    : "";

  const confirmed = await showCustomConfirm({
    title: `Remove "${subCatName}"?`,
    message: `Remove sub-category "${subCatName}" from category "${mainCat}"?${countMsg}`,
    icon: "delete",
    confirmText: "Remove Sub-Category",
    cancelText: "Cancel",
    danger: true
  });
  if (!confirmed) return;

  categoriesMap[mainCat] = categoriesMap[mainCat].filter(s => s !== subCatName);
  saveCategoriesToStorage();
  lastSyncedCatsHash = JSON.stringify(categoriesMap);
  await apiDeleteSubCategory(mainCat, subCatName);

  // Update affected books
  const fallbackSub = getDefaultSubCategory(mainCat);
  let affected = false;
  books.forEach(b => {
    if (b.category === mainCat && b.subCategory === subCatName) {
      b.subCategory = fallbackSub;
      affected = true;
      if (isBackendOnline) {
        apiUpdateBook(b.id, b);
      }
    }
  });
  if (affected) {
    saveBooksToStorage();
    lastSyncedBooksHash = JSON.stringify(books);
  }

  if (currentFilter.subCategory === subCatName) {
    currentFilter.subCategory = "All";
  }

  renderExistingSubCategoriesList();
  renderSubCategoryChips();
  updateSubCategoryDropdown();
  renderBooks();
  showToast(`Removed sub-category "${subCatName}"`);
}

function addNewMainCategory(catName) {
  const trimmed = catName.trim();
  if (!trimmed) {
    showToast("Please enter a valid category name", "warning");
    return;
  }
  if (categoriesMap[trimmed]) {
    showToast(`Category "${trimmed}" already exists`, "warning");
    return;
  }

  categoriesMap[trimmed] = ["General"];
  saveCategoriesToStorage();
  lastSyncedCatsHash = JSON.stringify(categoriesMap);
  apiAddCategory(trimmed);

  populateCategoryDropdowns();
  renderExistingMainCategoriesList();
  renderCategoryChips();
  newCategoryInput.value = "";
  showToast(`Category "${trimmed}" created!`);
}

async function deleteMainCategory(catName) {
  const mainCategories = getMainCategories();
  if (mainCategories.length <= 1) {
    showToast("You must keep at least one category", "warning");
    return;
  }

  const booksCount = books.filter(b => b.category === catName).length;
  const countMsg = booksCount > 0 
    ? `\nThis category currently has ${booksCount} book${booksCount > 1 ? "s" : ""}. They will be safely moved to remaining category.` 
    : "";

  const confirmed = await showCustomConfirm({
    title: `Delete "${catName}"?`,
    message: `Delete category "${catName}" and all its sub-categories?${countMsg}`,
    icon: "delete_sweep",
    confirmText: "Delete Category",
    cancelText: "Cancel",
    danger: true
  });

  if (confirmed) {
    delete categoriesMap[catName];
    saveCategoriesToStorage();
    lastSyncedCatsHash = JSON.stringify(categoriesMap);
    await apiDeleteCategory(catName);

    // Reassign books if any had this category
    const remainingCats = getMainCategories();
    const fallbackCat = remainingCats[0] || "General";
    let reassigned = false;
    books.forEach(b => {
      if (b.category === catName) {
        b.category = fallbackCat;
        b.subCategory = getDefaultSubCategory(fallbackCat);
        reassigned = true;
        if (isBackendOnline) {
          apiUpdateBook(b.id, b);
        }
      }
    });

    if (reassigned) {
      saveBooksToStorage();
      lastSyncedBooksHash = JSON.stringify(books);
    }

    if (currentFilter.category === catName) {
      currentFilter.category = "All";
      currentFilter.subCategory = "All";
    }
    populateCategoryDropdowns();
    renderExistingMainCategoriesList();
    renderCategoryChips();
    renderSubCategoryChips();
    renderBooks();
    showToast(`Category "${catName}" removed`);
  }
}

// ==========================================
// Books Rendering & Filter Logic
// ==========================================
function getFilteredAndSortedBooks() {
  let result = [...books];

  // 1. Availability Filter (Check Available Books Only)
  if (currentFilter.availableOnly) {
    result = result.filter(b => b.status === "Available");
  }

  // 2. Main Category Filter
  if (currentFilter.category !== "All") {
    result = result.filter(b => b.category === currentFilter.category);

    // 3. Sub-Category Filter (e.g. Science -> Biology, Space, Human Anatomy)
    if (currentFilter.subCategory !== "All") {
      result = result.filter(b =>
        b.subCategory && b.subCategory.toLowerCase() === currentFilter.subCategory.toLowerCase()
      );
    }
  }

  // 4. Search Filter (Book name, author, book number, publisher, subCategory)
  if (currentFilter.search.trim()) {
    const q = currentFilter.search.toLowerCase().trim();
    result = result.filter(b =>
      (b.name && b.name.toLowerCase().includes(q)) ||
      (b.author && b.author.toLowerCase().includes(q)) ||
      (b.bookNumber && b.bookNumber.toLowerCase().includes(q)) ||
      (b.publisher && b.publisher.toLowerCase().includes(q)) ||
      (b.category && b.category.toLowerCase().includes(q)) ||
      (b.subCategory && b.subCategory.toLowerCase().includes(q))
    );
  }

  // 5. Sort
  result.sort((a, b) => {
    if (currentFilter.sortBy === "name") {
      return a.name.localeCompare(b.name);
    } else if (currentFilter.sortBy === "number") {
      return a.bookNumber.localeCompare(b.bookNumber);
    } else if (currentFilter.sortBy === "price") {
      return Number(a.price) - Number(b.price);
    }
    return 0;
  });

  return result;
}

function renderBooks() {
  const filtered = getFilteredAndSortedBooks();
  booksGrid.innerHTML = "";

  // Dynamic Shelf Title
  if (currentFilter.availableOnly) {
    if (currentFilter.category !== "All") {
      shelfDisplayTitle.textContent = currentFilter.subCategory !== "All"
        ? `Available ${currentFilter.category} › ${currentFilter.subCategory}`
        : `Available ${currentFilter.category} Books`;
    } else {
      shelfDisplayTitle.textContent = "Available Books on Shelf";
    }
  } else if (currentFilter.category !== "All") {
    shelfDisplayTitle.textContent = currentFilter.subCategory !== "All"
      ? `${currentFilter.category} › ${currentFilter.subCategory}`
      : `${currentFilter.category} Books`;
  } else {
    shelfDisplayTitle.textContent = "All Books in Library";
  }

  booksCountBadge.textContent = `${filtered.length} ${filtered.length === 1 ? "book" : "books"}`;

  if (books.length === 0) {
    emptyState.style.display = "block";
    const titleEl = emptyState.querySelector("h4");
    const msgEl = document.getElementById("emptyStateMessage");
    const iconEl = emptyState.querySelector(".empty-icon-circle span");
    if (titleEl) titleEl.textContent = "Your Library is Clean & Empty";
    if (msgEl) msgEl.textContent = "All default sample books have been removed. Click below to add your first book!";
    if (iconEl) iconEl.textContent = "library_add";
    if (emptyResetBtn) {
      emptyResetBtn.innerHTML = `<span class="material-symbols-rounded">add</span> Add First Book`;
    }
    return;
  }

  if (filtered.length === 0) {
    emptyState.style.display = "block";
    const titleEl = emptyState.querySelector("h4");
    const msgEl = document.getElementById("emptyStateMessage");
    const iconEl = emptyState.querySelector(".empty-icon-circle span");
    if (titleEl) titleEl.textContent = "No books found";
    if (msgEl) msgEl.textContent = "No books match your current availability filter or search.";
    if (iconEl) iconEl.textContent = "search_off";
    if (emptyResetBtn) {
      emptyResetBtn.innerHTML = `<span class="material-symbols-rounded">refresh</span> View All Books`;
    }
    return;
  }
  emptyState.style.display = "none";

  filtered.forEach(book => {
    const card = createBookCardElement(book);
    booksGrid.appendChild(card);
  });
}

function createBookCardElement(book) {
  const card = document.createElement("div");
  card.className = "book-card";
  card.setAttribute("data-id", book.id);

  const isAvailable = book.status === "Available";

  // Cover image / fallback
  let coverHtml = "";
  if (book.coverPhoto) {
    coverHtml = `<img src="${book.coverPhoto}" alt="${escapeHtml(book.name)}" class="book-cover-img" loading="lazy">`;
  } else {
    coverHtml = `
      <div class="book-cover-fallback">
        <span class="material-symbols-rounded">auto_stories</span>
        <div class="fallback-title">${escapeHtml(book.name)}</div>
      </div>
    `;
  }

  card.innerHTML = `
    <!-- Top Cover Banner -->
    <div class="book-card-top">
      ${coverHtml}
      
      <!-- Availability Status Badge -->
      <div class="card-status-pill ${isAvailable ? "available" : "borrowed"}" title="Click to toggle status">
        <span class="status-indicator-dot"></span>
        <span>${isAvailable ? "Available" : "Checked Out"}</span>
      </div>

      <!-- Quick Fullscreen Button -->
      <button class="view-cover-fs-btn" title="View Full Screen Cover">
        <span class="material-symbols-rounded">fullscreen</span>
        <span>View Cover</span>
      </button>
    </div>

    <!-- Body Details -->
    <div class="book-card-body">
      <div class="card-meta-row">
        <span class="book-number-chip">
          <span class="material-symbols-rounded" style="font-size: 13px;">tag</span>
          ${escapeHtml(book.bookNumber)}
        </span>
        <div class="card-tags-group">
          <span class="category-tag">${escapeHtml(book.category)}</span>
          ${book.subCategory ? `<span class="sub-category-tag">${escapeHtml(book.subCategory)}</span>` : ""}
        </div>
      </div>

      <h4 class="book-title" title="${escapeHtml(book.name)}">${escapeHtml(book.name)}</h4>
      <p class="book-author">
        <span class="material-symbols-rounded">person</span>
        ${escapeHtml(book.author)}
      </p>

      <!-- Details Grid -->
      <div class="book-card-details">
        <div class="detail-item">
          <span class="detail-label">Total Pages</span>
          <span class="detail-value">${book.totalPages} pgs</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Price</span>
          <span class="detail-value price">₹${Number(book.price).toLocaleString()}</span>
        </div>
        <div class="detail-item full-width">
          <span class="detail-label">Classification</span>
          <span class="detail-value" title="${escapeHtml(book.category)} › ${escapeHtml(book.subCategory || 'General')}">
            ${escapeHtml(book.category)}${book.subCategory ? ` › ${escapeHtml(book.subCategory)}` : ''}
          </span>
        </div>
        <div class="detail-item full-width">
          <span class="detail-label">Publisher</span>
          <span class="detail-value" title="${escapeHtml(book.publisher)}">${escapeHtml(book.publisher)}</span>
        </div>
        ${book.shelfLocation ? `
        <div class="detail-item full-width">
          <span class="detail-label">Location</span>
          <span class="detail-value">${escapeHtml(book.shelfLocation)}</span>
        </div>` : ""}
      </div>

      <!-- Action Buttons -->
      <div class="book-card-actions">
        <!-- Print Label Button -->
        <button class="print-label-btn" title="Print Library Label for this book">
          <span class="material-symbols-rounded">print</span>
          Print Label
        </button>

        <!-- Toggle Status Button -->
        <button class="card-icon-action toggle-status" title="Toggle Availability (Available / Borrowed)">
          <span class="material-symbols-rounded">${isAvailable ? "sync_alt" : "check"}</span>
        </button>

        <!-- Edit Button -->
        <button class="card-icon-action edit-btn" title="Edit Book Details">
          <span class="material-symbols-rounded">edit</span>
        </button>

        <!-- Delete Button -->
        <button class="card-icon-action delete-btn" title="Delete Book">
          <span class="material-symbols-rounded">delete</span>
        </button>
      </div>
    </div>
  `;

  // Bind Card Event Handlers
  const coverImg = card.querySelector(".book-cover-img");
  const fsBtn = card.querySelector(".view-cover-fs-btn");
  if (coverImg) {
    coverImg.addEventListener("click", () => openFullscreenCover(book));
  }
  if (fsBtn) {
    fsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openFullscreenCover(book);
    });
  }

  // Card status pill click also toggles
  card.querySelector(".card-status-pill").addEventListener("click", () => {
    toggleBookStatus(book.id);
  });

  // Toggle status button
  card.querySelector(".toggle-status").addEventListener("click", () => {
    toggleBookStatus(book.id);
  });

  // Print Label
  card.querySelector(".print-label-btn").addEventListener("click", () => {
    openPrintLabelModal(book);
  });

  // Edit Book
  card.querySelector(".edit-btn").addEventListener("click", () => {
    openEditBookModal(book);
  });

  // Delete Book
  card.querySelector(".delete-btn").addEventListener("click", () => {
    confirmDeleteBook(book);
  });

  return card;
}

// ==========================================
// Toggle Book Status (Available / Borrowed)
// ==========================================
function toggleBookStatus(bookId) {
  const index = books.findIndex(b => b.id === bookId);
  if (index === -1) return;

  const current = books[index].status;
  books[index].status = current === "Available" ? "Borrowed" : "Available";

  saveBooksToStorage();
  updateAvailabilityCounter();
  renderBooks();

  const newStatus = books[index].status;
  const msg = newStatus === "Available"
    ? `"${books[index].name}" marked as Available on Shelf!`
    : `"${books[index].name}" marked as Borrowed (Checked Out)`;

  showToast(msg, newStatus === "Available" ? "check_circle" : "sync_alt");
}

// ==========================================
// Add / Edit Book Bottom Sheet
// ==========================================
function openAddBookModal() {
  bookModalTitle.textContent = "Add New Book";
  bookForm.reset();
  bookIdInput.value = "";
  currentUploadedCover = "";

  // Set default book number
  bookNumberInput.value = generateUniqueBookNumber();
  bookStatusSelect.value = "Available";

  // Reset category dropdowns
  populateCategoryDropdowns();

  const deleteBtn = document.getElementById("deleteCurrentBookBtn");
  if (deleteBtn) {
    deleteBtn.style.display = "none";
    deleteBtn.onclick = null;
  }

  resetCoverPreview();
  bookModalBackdrop.classList.add("open");
}

function openEditBookModal(book) {
  bookModalTitle.textContent = "Edit Book Details";
  saveBookBtn.innerHTML = `<span class="material-symbols-rounded">save</span> Save Changes`;
  bookIdInput.value = book.id;
  bookNumberInput.value = book.bookNumber || "";
  bookNameInput.value = book.name || "";
  authorInput.value = book.author || "";

  populateCategoryDropdowns();
  categorySelect.value = book.category || getMainCategories()[0];
  updateSubCategoryDropdown(book.subCategory);

  pagesInput.value = book.totalPages || "";
  priceInput.value = book.price || "";
  publisherInput.value = book.publisher || "";
  bookStatusSelect.value = book.status || "Available";
  shelfLocationInput.value = book.shelfLocation || "";

  currentUploadedCover = book.coverPhoto || "";
  if (currentUploadedCover) {
    showCoverPreview(currentUploadedCover);
  } else {
    resetCoverPreview();
  }

  const deleteBtn = document.getElementById("deleteCurrentBookBtn");
  if (deleteBtn) {
    deleteBtn.style.display = "inline-flex";
    deleteBtn.onclick = () => {
      closeBookModal();
      confirmDeleteBook(book);
    };
  }

  bookModalBackdrop.classList.add("open");
}

function closeBookModal() {
  bookModalBackdrop.classList.remove("open");
}

function generateUniqueBookNumber() {
  const nextNum = Math.floor(1000 + Math.random() * 9000);
  return `LIB-${nextNum}`;
}

// Quick add subcategory from form
quickAddSubCatBtn.addEventListener("click", async () => {
  const mainCat = categorySelect.value || getMainCategories()[0];
  const promptVal = await showCustomPrompt({
    title: "Add Sub-Category",
    message: `Add a new sub-category for "${mainCat}":`,
    label: "Sub-Category Name",
    placeholder: "e.g. Biology, Space, Human Anatomy",
    icon: "add_circle",
    confirmText: "Add"
  });
  if (promptVal && promptVal.trim()) {
    addNewSubCategory(mainCat, promptVal.trim());
  }
});

// Cover Upload & Preview
function handleCoverFileUpload(file) {
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showToast("Please choose an image under 5MB", "warning");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    currentUploadedCover = e.target.result;
    showCoverPreview(currentUploadedCover);
    showToast("Cover photo uploaded successfully!");
  };
  reader.readAsDataURL(file);
}

function showCoverPreview(dataUrl) {
  coverPreviewImg.src = dataUrl;
  coverPreviewWrapper.style.display = "block";
  uploaderPlaceholder.style.display = "none";
}

function resetCoverPreview() {
  currentUploadedCover = "";
  coverPreviewImg.src = "";
  coverPreviewWrapper.style.display = "none";
  uploaderPlaceholder.style.display = "flex";
  coverFileInput.value = "";
}

// Handle Form Submission
bookForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const id = bookIdInput.value.trim();
  const bookNumber = bookNumberInput.value.trim();
  const name = bookNameInput.value.trim();
  const author = authorInput.value.trim();
  const category = categorySelect.value;
  const subCategory = subCategorySelect.value || "General";
  const totalPages = parseInt(pagesInput.value, 10);
  const price = parseFloat(priceInput.value);
  const publisher = publisherInput.value.trim();
  const status = bookStatusSelect.value;
  const shelfLocation = shelfLocationInput.value.trim();

  if (!name || !author || !bookNumber) {
    showToast("Please fill in all required fields", "warning");
    return;
  }

  // Check unique book number if new or changed
  const existingNumIndex = books.findIndex(b => b.bookNumber.toLowerCase() === bookNumber.toLowerCase() && b.id !== id);
  if (existingNumIndex !== -1) {
    showToast(`Book Number ${bookNumber} is already used!`, "warning");
    return;
  }

  // Vector fallback cover if none provided
  let coverPhoto = currentUploadedCover;
  if (!coverPhoto) {
    const colors = [
      ["#1a73e8", "#0d47a1"],
      ["#1e8e3e", "#0b6623"],
      ["#8430ce", "#4a148c"],
      ["#e37400", "#b06000"],
      ["#d93025", "#8b0000"]
    ];
    const picked = colors[Math.floor(Math.random() * colors.length)];
    coverPhoto = createVectorCover(name, author, category, picked[0], picked[1]);
  }

  if (id) {
    // Edit existing book
    const index = books.findIndex(b => b.id === id);
    if (index !== -1) {
      books[index] = {
        ...books[index],
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
      };
      saveBooksToStorage();
      apiUpdateBook(id, books[index]);
      showToast(`Updated "${name}" successfully!`);
    }
  } else {
    // Add new book
    const newBook = {
      id: `book-${Date.now()}`,
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
      addedDate: new Date().toISOString().split("T")[0],
      coverPhoto
    };
    books.unshift(newBook);
    saveBooksToStorage();
    apiAddBook(newBook);
    showToast(`"${name}" added to your library!`);
  }

  updateAvailabilityCounter();
  renderBooks();
  closeBookModal();
});

// Delete book
async function confirmDeleteBook(book) {
  const confirmed = await showCustomConfirm({
    title: "Remove Book?",
    message: `Are you sure you want to remove "${book.name}" (${book.bookNumber}) from your library?`,
    icon: "delete",
    confirmText: "Remove Book",
    cancelText: "Keep Book",
    danger: true
  });

  if (confirmed) {
    books = books.filter(b => b.id !== book.id && b.bookNumber !== book.bookNumber);
    saveBooksToStorage();
    lastSyncedBooksHash = JSON.stringify(books);
    await apiDeleteBook(book.id || book.bookNumber);
    updateAvailabilityCounter();
    renderBooks();
    showToast(`Deleted "${book.name}"`);
  }
}

// ==========================================
// Fullscreen Cover Viewer
// ==========================================
function openFullscreenCover(book) {
  if (!book.coverPhoto) {
    showToast("No cover photo available to view full screen", "warning");
    return;
  }

  currentFsZoom = 1;
  currentFsRotation = 0;
  applyFullscreenTransform();

  fullscreenImg.src = book.coverPhoto;
  fullscreenTitle.textContent = `${book.name} (${book.bookNumber})`;
  fullscreenAuthorDetails.textContent = `Author: ${book.author} • Category: ${book.category} › ${book.subCategory || 'General'} • Publisher: ${book.publisher}`;
  fullscreenViewerModal.classList.add("open");
}

function closeFullscreenCover() {
  fullscreenViewerModal.classList.remove("open");
}

function applyFullscreenTransform() {
  fullscreenImg.style.transform = `scale(${currentFsZoom}) rotate(${currentFsRotation}deg)`;
}

// Fullscreen controls
fsZoomInBtn.addEventListener("click", () => {
  if (currentFsZoom < 3) {
    currentFsZoom += 0.25;
    applyFullscreenTransform();
  }
});

fsZoomOutBtn.addEventListener("click", () => {
  if (currentFsZoom > 0.5) {
    currentFsZoom -= 0.25;
    applyFullscreenTransform();
  }
});

fsRotateBtn.addEventListener("click", () => {
  currentFsRotation = (currentFsRotation + 90) % 360;
  applyFullscreenTransform();
});

fsCloseBtn.addEventListener("click", closeFullscreenCover);
fullscreenViewerModal.addEventListener("click", (e) => {
  if (e.target === fullscreenViewerModal || e.target === document.getElementById("fullscreenBody")) {
    closeFullscreenCover();
  }
});

viewCoverPreviewFullBtn.addEventListener("click", () => {
  if (currentUploadedCover) {
    openFullscreenCover({
      name: bookNameInput.value || "Cover Preview",
      bookNumber: bookNumberInput.value || "PREVIEW",
      author: authorInput.value || "Author",
      category: categorySelect.value || "General",
      subCategory: subCategorySelect.value || "General",
      publisher: publisherInput.value || "Publisher",
      coverPhoto: currentUploadedCover
    });
  }
});

removeCoverBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  resetCoverPreview();
  showToast("Cover photo removed");
});

// ==========================================
// Separate Label Printing Studio
// ==========================================
function openPrintLabelModal(book) {
  currentPrintingBook = book;
  currentLabelFormat = "spine";
  formatTabs.forEach(t => {
    if (t.getAttribute("data-format") === "spine") {
      t.classList.add("active");
    } else {
      t.classList.remove("active");
    }
  });
  renderPrintableLabel();
  printModalBackdrop.classList.add("open");
}

function closePrintModal() {
  printModalBackdrop.classList.remove("open");
  currentPrintingBook = null;
}

function renderPrintableLabel() {
  if (!currentPrintingBook) return;
  const book = currentPrintingBook;
  const subLabel = book.subCategory ? ` / ${escapeHtml(book.subCategory)}` : "";

  if (currentLabelFormat === "spine") {
    // Format 1: Standard Official Label (AN ASHRF ANWARI, BOOK NUMBER, NAME, CATEGORY)
    renderedLabel.innerHTML = `
      <div class="label-header-band">
        <div class="library-brand-title">AN ASHRF ANWARI</div>
      </div>
      <div class="label-content-grid">
        <div class="label-field-block">
          <span class="label-field-label">BOOK NUMBER</span>
          <span class="label-field-value mono-val">${escapeHtml(book.bookNumber)}</span>
        </div>
        <div class="label-field-block">
          <span class="label-field-label">NAME</span>
          <span class="label-field-value bold-title">${escapeHtml(book.name)}</span>
        </div>
        <div class="label-field-block">
          <span class="label-field-label">CATEGORY</span>
          <span class="label-field-value cat-text">${escapeHtml(book.category)}${subLabel}</span>
        </div>
      </div>
    `;
  } else if (currentLabelFormat === "card") {
    // Format 2: Classic Ledger Grid Label (AN ASHRF ANWARI, BOOK NUMBER, NAME, CATEGORY)
    renderedLabel.innerHTML = `
      <div class="label-header-band">
        <div class="library-brand-title">AN ASHRF ANWARI</div>
      </div>
      <table class="label-table-grid">
        <tbody>
          <tr>
            <td class="table-key">BOOK NUMBER</td>
            <td class="table-sep">:</td>
            <td class="table-val mono-val">${escapeHtml(book.bookNumber)}</td>
          </tr>
          <tr>
            <td class="table-key">NAME</td>
            <td class="table-sep">:</td>
            <td class="table-val bold-title">${escapeHtml(book.name)}</td>
          </tr>
          <tr>
            <td class="table-key">CATEGORY</td>
            <td class="table-sep">:</td>
            <td class="table-val cat-text">${escapeHtml(book.category)}${subLabel}</td>
          </tr>
        </tbody>
      </table>
    `;
  } else if (currentLabelFormat === "qr") {
    // Format 4: QR Code Sticker (AN ASHRF ANWARI, BOOK NUMBER, NAME, CATEGORY + QR Code)
    renderedLabel.innerHTML = `
      <div class="label-header-band">
        <div class="library-brand-title">AN ASHRF ANWARI</div>
      </div>
      <div class="label-qr-layout">
        <div class="label-content-grid" style="flex: 1;">
          <div class="label-field-block">
            <span class="label-field-label">BOOK NUMBER</span>
            <span class="label-field-value mono-val">${escapeHtml(book.bookNumber)}</span>
          </div>
          <div class="label-field-block">
            <span class="label-field-label">NAME</span>
            <span class="label-field-value bold-title">${escapeHtml(book.name)}</span>
          </div>
          <div class="label-field-block">
            <span class="label-field-label">CATEGORY</span>
            <span class="label-field-value cat-text">${escapeHtml(book.category)}${subLabel}</span>
          </div>
        </div>
        <div class="label-qr-box">
          <canvas id="labelQrCanvas" class="label-qr-canvas"></canvas>
          <span class="qr-caption">QR CODE</span>
        </div>
      </div>
    `;
  } else {
    // Format 3: Barcode Sticker (AN ASHRF ANWARI, BOOK NUMBER, NAME, CATEGORY + Barcode)
    renderedLabel.innerHTML = `
      <div class="label-header-band">
        <div class="library-brand-title">AN ASHRF ANWARI</div>
      </div>
      <div class="label-content-grid">
        <div class="label-compact-row">
          <div class="compact-field">
            <span class="label-field-label">BOOK NUMBER</span>
            <span class="label-field-value mono-val">${escapeHtml(book.bookNumber)}</span>
          </div>
          <div class="compact-field" style="text-align: right;">
            <span class="label-field-label">CATEGORY</span>
            <span class="label-field-value cat-text">${escapeHtml(book.category)}${subLabel}</span>
          </div>
        </div>
        <div class="label-field-block" style="margin-top: 10px;">
          <span class="label-field-label">NAME</span>
          <span class="label-field-value bold-title">${escapeHtml(book.name)}</span>
        </div>
        <div class="barcode-section" style="margin-top: 10px;">
          <svg id="labelBarcodeSvg" class="barcode-svg"></svg>
          <span class="barcode-text">${escapeHtml(book.bookNumber)}</span>
        </div>
      </div>
    `;
  }

  // Generate Barcode or QR Code
  setTimeout(() => {
    generateBarcode(book.bookNumber);
    generateQRCode(book);
  }, 50);
}

function generateBarcode(text) {
  const svgEl = document.getElementById("labelBarcodeSvg");
  if (!svgEl) return;

  if (window.JsBarcode) {
    try {
      JsBarcode(svgEl, text, {
        format: "CODE128",
        lineColor: "#000000",
        width: 1.8,
        height: 40,
        displayValue: false,
        margin: 0
      });
      return;
    } catch (e) {
      console.warn("JsBarcode error, falling back to simulated barcode", e);
    }
  }

  // SVG fallback barcode representation
  svgEl.innerHTML = `
    <rect x="0" y="0" width="4" height="40" fill="#000"/>
    <rect x="8" y="0" width="2" height="40" fill="#000"/>
    <rect x="14" y="0" width="6" height="40" fill="#000"/>
    <rect x="24" y="0" width="2" height="40" fill="#000"/>
    <rect x="30" y="0" width="4" height="40" fill="#000"/>
    <rect x="38" y="0" width="6" height="40" fill="#000"/>
    <rect x="48" y="0" width="2" height="40" fill="#000"/>
    <rect x="54" y="0" width="4" height="40" fill="#000"/>
    <rect x="62" y="0" width="8" height="40" fill="#000"/>
    <rect x="74" y="0" width="2" height="40" fill="#000"/>
    <rect x="80" y="0" width="6" height="40" fill="#000"/>
    <rect x="90" y="0" width="4" height="40" fill="#000"/>
    <rect x="98" y="0" width="2" height="40" fill="#000"/>
    <rect x="104" y="0" width="6" height="40" fill="#000"/>
    <rect x="114" y="0" width="4" height="40" fill="#000"/>
  `;
}

function generateQRCode(book, targetCanvas = null, size = 76) {
  const canvas = targetCanvas || document.getElementById("labelQrCanvas");
  if (!canvas) return;

  const qrData = `PAYLIB:${book.bookNumber}|${book.name}|${book.author}|${book.category}|${book.subCategory || ''}`;

  if (window.QRCode && window.QRCode.toCanvas) {
    QRCode.toCanvas(canvas, qrData, {
      width: size,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" }
    }, (err) => {
      if (err) console.error("QR Code Error:", err);
    });
  } else {
    const ctx = canvas.getContext("2d");
    canvas.width = size;
    canvas.height = size;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(6, 6, 20, 20);
    ctx.fillRect(size - 26, 6, 20, 20);
    ctx.fillRect(6, size - 26, 20, 20);
    ctx.fillStyle = "#000000";
    ctx.fillRect(10, 10, 12, 12);
    ctx.fillRect(size - 22, 10, 12, 12);
    ctx.fillRect(10, size - 22, 12, 12);
  }
}

// Trigger single print
triggerPrintBtn.addEventListener("click", () => {
  document.body.classList.add("printing-single");
  window.print();
  setTimeout(() => {
    document.body.classList.remove("printing-single");
  }, 1200);
});

formatTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    formatTabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentLabelFormat = tab.getAttribute("data-format");
    renderPrintableLabel();
  });
});

closePrintModalBtn.addEventListener("click", closePrintModal);
cancelPrintBtn.addEventListener("click", closePrintModal);

const switchToBatchBtn = document.getElementById("switchToBatchBtn");
if (switchToBatchBtn) {
  switchToBatchBtn.addEventListener("click", () => {
    closePrintModal();
    openBatchQrModal();
  });
}

// ==========================================
// Batch Print Multiple QR Codes & Labels Studio
// ==========================================
const batchQrModalBackdrop = document.getElementById("batchQrModalBackdrop");
const closeBatchQrModalBtn = document.getElementById("closeBatchQrModalBtn");
const cancelBatchQrBtn = document.getElementById("cancelBatchQrBtn");
const triggerBatchPrintBtn = document.getElementById("triggerBatchPrintBtn");
const batchPrintBtnLabel = document.getElementById("batchPrintBtnLabel");
const openBatchQrHeaderBtn = document.getElementById("openBatchQrHeaderBtn");
const quickBatchQrBtn = document.getElementById("quickBatchQrBtn");
const openBatchQrShelfBtn = document.getElementById("openBatchQrShelfBtn");
const navLabelsTab = document.getElementById("navLabelsTab");

const batchCategorySelect = document.getElementById("batchCategorySelect");
const batchStatusSelect = document.getElementById("batchStatusSelect");
const batchSheetColumns = document.getElementById("batchSheetColumns");
const batchCountText = document.getElementById("batchCountText");
const batchSelectAllBtn = document.getElementById("batchSelectAllBtn");
const batchDeselectAllBtn = document.getElementById("batchDeselectAllBtn");
const batchToggleCustomBtn = document.getElementById("batchToggleCustomBtn");
const batchCustomListDrawer = document.getElementById("batchCustomListDrawer");
const batchSearchInput = document.getElementById("batchSearchInput");
const batchBooksChecklist = document.getElementById("batchBooksChecklist");
const printableBatchQrContainer = document.getElementById("printableBatchQrContainer");

let batchSelectedBookIds = new Set();
let batchCurrentColumns = "3";
let batchCustomDrawerOpen = false;

function openBatchQrModal() {
  if (!batchQrModalBackdrop) return;
  // Initialize selection with all books if empty or first open
  if (batchSelectedBookIds.size === 0 && books.length > 0) {
    books.forEach(b => batchSelectedBookIds.add(b.id));
  }
  populateBatchCategoryDropdown();
  renderBatchChecklist();
  renderBatchQrSheet();
  batchQrModalBackdrop.classList.add("open");
}

function closeBatchQrModal() {
  if (!batchQrModalBackdrop) return;
  batchQrModalBackdrop.classList.remove("open");
}

function populateBatchCategoryDropdown() {
  if (!batchCategorySelect) return;
  const currentVal = batchCategorySelect.value || "all";
  const uniqueCats = [...new Set(books.map(b => (b.category || "General").trim()))].sort();
  
  batchCategorySelect.innerHTML = `<option value="all">All Categories (${books.length})</option>`;
  uniqueCats.forEach(cat => {
    const count = books.filter(b => (b.category || "General").trim() === cat).length;
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = `${cat} (${count})`;
    if (cat === currentVal) opt.selected = true;
    batchCategorySelect.appendChild(opt);
  });
}

function getBatchFilteredBooks() {
  const catFilter = batchCategorySelect ? batchCategorySelect.value : "all";
  const statusFilter = batchStatusSelect ? batchStatusSelect.value : "all";

  return books.filter(b => {
    if (catFilter !== "all" && (b.category || "General").trim() !== catFilter) return false;
    if (statusFilter === "Available" && b.status !== "Available") return false;
    return true;
  });
}

function renderBatchChecklist() {
  if (!batchBooksChecklist) return;
  const filtered = getBatchFilteredBooks();
  const search = (batchSearchInput ? batchSearchInput.value : "").toLowerCase().trim();

  batchBooksChecklist.innerHTML = "";

  const displayed = filtered.filter(b => {
    if (!search) return true;
    return (b.name || "").toLowerCase().includes(search) ||
           (b.bookNumber || "").toLowerCase().includes(search) ||
           (b.author || "").toLowerCase().includes(search);
  });

  if (displayed.length === 0) {
    batchBooksChecklist.innerHTML = `<div style="font-size: 12px; color: var(--text-tertiary); padding: 8px;">No matching books in current filter.</div>`;
    return;
  }

  displayed.forEach(book => {
    const item = document.createElement("label");
    item.className = "batch-check-item";
    const isChecked = batchSelectedBookIds.has(book.id);
    item.innerHTML = `
      <input type="checkbox" data-id="${book.id}" ${isChecked ? "checked" : ""}>
      <span style="font-family: 'Space Mono', monospace; font-size: 11px; font-weight: 700;">${escapeHtml(book.bookNumber)}</span>
      <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(book.name)}</span>
      <span style="font-size: 11px; color: var(--text-tertiary);">(${escapeHtml(book.category)})</span>
    `;

    const checkbox = item.querySelector("input");
    checkbox.addEventListener("change", (e) => {
      if (e.target.checked) {
        batchSelectedBookIds.add(book.id);
      } else {
        batchSelectedBookIds.delete(book.id);
      }
      renderBatchQrSheet();
    });

    batchBooksChecklist.appendChild(item);
  });
}

function renderBatchQrSheet() {
  if (!printableBatchQrContainer) return;
  const filtered = getBatchFilteredBooks();
  const toPrint = filtered.filter(b => batchSelectedBookIds.has(b.id));

  // Update Stats & Button Label
  if (batchCountText) {
    batchCountText.textContent = `Selected ${toPrint.length} of ${filtered.length} books`;
  }
  if (batchPrintBtnLabel) {
    batchPrintBtnLabel.textContent = `Print ${toPrint.length} Selected QR${toPrint.length === 1 ? '' : 's'} Now`;
  }

  // Update Grid Columns Class
  printableBatchQrContainer.className = `batch-qr-print-grid grid-cols-${batchCurrentColumns}`;
  printableBatchQrContainer.innerHTML = "";

  if (toPrint.length === 0) {
    printableBatchQrContainer.innerHTML = `
      <div class="batch-empty-preview">
        <span class="material-symbols-rounded" style="font-size: 40px; color: var(--text-tertiary); margin-bottom: 8px;">qr_code_2</span>
        <p>No books selected for printing.</p>
        <button type="button" class="gpay-pill-btn primary small" id="batchEmptySelectAllBtn" style="margin-top: 10px;">
          Select All ${filtered.length} Books
        </button>
      </div>
    `;
    const btn = document.getElementById("batchEmptySelectAllBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        filtered.forEach(b => batchSelectedBookIds.add(b.id));
        renderBatchChecklist();
        renderBatchQrSheet();
      });
    }
    return;
  }

  toPrint.forEach(book => {
    const card = document.createElement("div");
    card.className = "batch-qr-card";
    const subLabel = book.subCategory ? ` / ${escapeHtml(book.subCategory)}` : "";
    const canvasId = `batch-qr-canvas-${book.id}`;

    card.innerHTML = `
      <div class="batch-card-header">
        <div class="batch-brand-title">AN ASHRF ANWARI</div>
      </div>
      <div class="batch-card-body">
        <div class="batch-card-info">
          <div class="batch-field">
            <span class="batch-label">BOOK NUMBER</span>
            <span class="batch-mono">${escapeHtml(book.bookNumber)}</span>
          </div>
          <div class="batch-field">
            <span class="batch-label">NAME</span>
            <span class="batch-title" title="${escapeHtml(book.name)}">${escapeHtml(book.name)}</span>
          </div>
          <div class="batch-field">
            <span class="batch-label">CATEGORY</span>
            <span class="batch-cat">${escapeHtml(book.category)}${subLabel}</span>
          </div>
        </div>
        <div class="batch-card-qr">
          <canvas class="batch-qr-canvas" id="${canvasId}"></canvas>
        </div>
      </div>
    `;

    printableBatchQrContainer.appendChild(card);

    // Generate QR Code onto canvas
    setTimeout(() => {
      const canvasEl = document.getElementById(canvasId);
      if (canvasEl) {
        generateQRCode(book, canvasEl, 66);
      }
    }, 10);
  });
}

// Batch modal event listeners
if (openBatchQrHeaderBtn) openBatchQrHeaderBtn.addEventListener("click", openBatchQrModal);
if (quickBatchQrBtn) quickBatchQrBtn.addEventListener("click", openBatchQrModal);
if (openBatchQrShelfBtn) openBatchQrShelfBtn.addEventListener("click", openBatchQrModal);
if (closeBatchQrModalBtn) closeBatchQrModalBtn.addEventListener("click", closeBatchQrModal);
if (cancelBatchQrBtn) cancelBatchQrBtn.addEventListener("click", closeBatchQrModal);

if (batchCategorySelect) {
  batchCategorySelect.addEventListener("change", () => {
    renderBatchChecklist();
    renderBatchQrSheet();
  });
}

if (batchStatusSelect) {
  batchStatusSelect.addEventListener("change", () => {
    renderBatchChecklist();
    renderBatchQrSheet();
  });
}

if (batchSheetColumns) {
  batchSheetColumns.addEventListener("change", (e) => {
    batchCurrentColumns = e.target.value;
    renderBatchQrSheet();
  });
}

if (batchSelectAllBtn) {
  batchSelectAllBtn.addEventListener("click", () => {
    const filtered = getBatchFilteredBooks();
    filtered.forEach(b => batchSelectedBookIds.add(b.id));
    renderBatchChecklist();
    renderBatchQrSheet();
    showToast(`Selected all ${filtered.length} books for QR printing`, "done_all");
  });
}

if (batchDeselectAllBtn) {
  batchDeselectAllBtn.addEventListener("click", () => {
    const filtered = getBatchFilteredBooks();
    filtered.forEach(b => batchSelectedBookIds.delete(b.id));
    renderBatchChecklist();
    renderBatchQrSheet();
    showToast("Cleared book selection", "clear");
  });
}

if (batchToggleCustomBtn) {
  batchToggleCustomBtn.addEventListener("click", () => {
    batchCustomDrawerOpen = !batchCustomDrawerOpen;
    if (batchCustomListDrawer) {
      batchCustomListDrawer.style.display = batchCustomDrawerOpen ? "flex" : "none";
    }
  });
}

if (batchSearchInput) {
  batchSearchInput.addEventListener("input", () => {
    renderBatchChecklist();
  });
}

if (triggerBatchPrintBtn) {
  triggerBatchPrintBtn.addEventListener("click", () => {
    const filtered = getBatchFilteredBooks();
    const toPrint = filtered.filter(b => batchSelectedBookIds.has(b.id));
    if (toPrint.length === 0) {
      showToast("Please select at least 1 book to print", "warning");
      return;
    }
    document.body.classList.add("printing-batch");
    window.print();
    setTimeout(() => {
      document.body.classList.remove("printing-batch");
    }, 1200);
  });
}

window.addEventListener("afterprint", () => {
  document.body.classList.remove("printing-single", "printing-batch");
});

// ==========================================
// Interactive Library Chat Search Studio
// ==========================================
function openChatSearchModal(initialQuery = "") {
  if (!chatSearchModalBackdrop) return;
  chatSearchModalBackdrop.classList.add("open");
  renderChatAuthorChips();

  if (chatMessagesContainer && chatMessagesContainer.children.length === 0) {
    renderChatWelcomeMessage();
  }

  setTimeout(() => {
    if (chatSearchInputField) {
      chatSearchInputField.focus();
      if (initialQuery) {
        chatSearchInputField.value = initialQuery;
        executeChatSearch(initialQuery);
      }
    }
  }, 100);
}

function closeChatSearchModal() {
  if (!chatSearchModalBackdrop) return;
  chatSearchModalBackdrop.classList.remove("open");
}

function renderChatAuthorChips() {
  if (!chatChipsContainer) return;
  chatChipsContainer.innerHTML = "";

  const uniqueAuthors = [...new Set(books.map(b => (b.author || "").trim()).filter(Boolean))];

  if (uniqueAuthors.length === 0) {
    chatChipsContainer.innerHTML = `<span style="font-size: 11px; color: var(--text-tertiary);">No authors in catalog yet</span>`;
    return;
  }

  uniqueAuthors.forEach(author => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chat-author-chip";
    chip.innerHTML = `<span class="material-symbols-rounded" style="font-size: 14px;">person</span> ${escapeHtml(author)}`;
    chip.addEventListener("click", () => {
      if (chatSearchInputField) chatSearchInputField.value = author;
      executeChatSearch(author);
    });
    chatChipsContainer.appendChild(chip);
  });

  const availChip = document.createElement("button");
  availChip.type = "button";
  availChip.className = "chat-author-chip";
  availChip.innerHTML = `<span class="material-symbols-rounded" style="font-size: 14px;">check_circle</span> Available Books`;
  availChip.addEventListener("click", () => {
    if (chatSearchInputField) chatSearchInputField.value = "available books";
    executeChatSearch("available books");
  });
  chatChipsContainer.appendChild(availChip);
}

function renderChatWelcomeMessage() {
  if (!chatMessagesContainer) return;
  chatMessagesContainer.innerHTML = "";

  const uniqueAuthors = [...new Set(books.map(b => (b.author || "").trim()).filter(Boolean))];
  const sampleAuthor = uniqueAuthors.length > 0 ? uniqueAuthors[0] : "gfhtg";

  const welcomeMsg = document.createElement("div");
  welcomeMsg.className = "chat-msg bot-msg";
  welcomeMsg.innerHTML = `
    <div class="msg-avatar bot-avatar">
      <span class="material-symbols-rounded">forum</span>
    </div>
    <div class="msg-content-wrap">
      <div class="msg-bubble bot-bubble">
        <p>👋 Hello! I am your <strong>Library Chat Assistant</strong>.</p>
        <p>Type any <strong>Author Name</strong> (e.g. <em>"${escapeHtml(sampleAuthor)}"</em>), and I will immediately reply with all books written by that author in the library!</p>
        <p style="font-size: 12px; color: var(--text-tertiary); margin-top: 6px;">💡 You can also ask for book names, categories, or tap the author chips above.</p>
      </div>
    </div>
  `;
  chatMessagesContainer.appendChild(welcomeMsg);
}

function executeChatSearch(rawQuery) {
  const query = (rawQuery || "").trim();
  if (!query || !chatMessagesContainer) return;

  // Append User Message
  const userMsgEl = document.createElement("div");
  userMsgEl.className = "chat-msg user-msg";
  userMsgEl.innerHTML = `
    <div class="msg-avatar user-avatar">
      <span class="material-symbols-rounded">person</span>
    </div>
    <div class="msg-content-wrap">
      <div class="msg-bubble user-bubble">${escapeHtml(query)}</div>
    </div>
  `;
  chatMessagesContainer.appendChild(userMsgEl);

  if (chatSearchInputField) chatSearchInputField.value = "";
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

  // Show Typing Indicator
  const typingEl = document.createElement("div");
  typingEl.className = "chat-msg bot-msg typing-msg";
  typingEl.id = "chatTypingIndicator";
  typingEl.innerHTML = `
    <div class="msg-avatar bot-avatar">
      <span class="material-symbols-rounded">forum</span>
    </div>
    <div class="msg-bubble bot-bubble typing-bubble">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
    </div>
  `;
  chatMessagesContainer.appendChild(typingEl);
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

  setTimeout(() => {
    const existingTyping = document.getElementById("chatTypingIndicator");
    if (existingTyping) existingTyping.remove();

    processChatReply(query);
  }, 280);
}

function processChatReply(query) {
  const lowerQuery = query.toLowerCase().trim();

  // Strip conversational prefixes
  const cleanedAuthorQuery = lowerQuery
    .replace(/^(books?\s+(written\s+)?by|author|show\s+(me\s+)?books?\s+by|find\s+books?\s+by|search\s+author|search\s+for|do\s+you\s+have\s+books?\s+by)\s+/i, '')
    .trim();

  // 1. Author Match
  let matchedBooks = books.filter(b => {
    const a = (b.author || "").toLowerCase();
    return a === cleanedAuthorQuery || a.includes(cleanedAuthorQuery) || (cleanedAuthorQuery.length >= 3 && cleanedAuthorQuery.includes(a));
  });

  if (matchedBooks.length === 0) {
    matchedBooks = books.filter(b => (b.author || "").toLowerCase().includes(lowerQuery));
  }

  let botHtml = "";

  if (matchedBooks.length > 0) {
    const authorName = matchedBooks[0].author;
    botHtml = `
      <p>📚 Found <strong>${matchedBooks.length} book${matchedBooks.length > 1 ? "s" : ""}</strong> by author <strong>${escapeHtml(authorName)}</strong>:</p>
      <div class="chat-books-grid">
        ${matchedBooks.map(b => renderChatBookCardHtml(b)).join("")}
      </div>
    `;
  } else if (lowerQuery.includes("available") || lowerQuery === "check available") {
    const availableBooks = books.filter(b => b.status === "Available");
    if (availableBooks.length > 0) {
      botHtml = `
        <p>🟢 Found <strong>${availableBooks.length} available book${availableBooks.length > 1 ? "s" : ""}</strong> ready on shelves:</p>
        <div class="chat-books-grid">
          ${availableBooks.map(b => renderChatBookCardHtml(b)).join("")}
        </div>
      `;
    } else {
      botHtml = `<p>Currently no books are marked as <strong>Available</strong>.</p>`;
    }
  } else if (lowerQuery.includes("backup") || lowerQuery.includes("export") || lowerQuery.includes("restore") || lowerQuery.includes("download data")) {
    botHtml = `
      <p>💾 <strong>Backup & Restore Data Studio:</strong></p>
      <p style="margin-top: 4px;">You can export your complete library catalog, download JSON backups, save server snapshots, or restore previous data anytime.</p>
      <div style="margin-top: 10px;">
        <button type="button" class="chat-action-btn primary" id="openBackupFromChatBtn" style="padding: 8px 16px; font-size: 13px;">
          <span class="material-symbols-rounded" style="font-size: 18px;">cloud_sync</span> Open Backup & Restore Studio
        </button>
      </div>
    `;
  } else if (lowerQuery.includes("qr") || lowerQuery.includes("print") || lowerQuery.includes("batch") || lowerQuery.includes("label") || lowerQuery.includes("multiple")) {
    botHtml = `
      <p>🖨️ <strong>Batch QR Code & Label Studio:</strong></p>
      <p style="margin-top: 4px;">You can print multiple QR codes/stickers for all books or filtered by category in 2, 3 (standard A4 sticker sheet), or 4 column grids!</p>
      <div style="margin-top: 10px;">
        <button type="button" class="chat-action-btn primary" id="openBatchQrFromChatBtn" style="padding: 8px 16px; font-size: 13px;">
          <span class="material-symbols-rounded" style="font-size: 18px;">qr_code_2</span> Open Multiple QR Printer
        </button>
      </div>
    `;
  } else {
    // Check if query matches Book Title
    const titleMatches = books.filter(b => (b.name || "").toLowerCase().includes(lowerQuery));
    if (titleMatches.length > 0) {
      botHtml = `
        <p>📖 I found <strong>${titleMatches.length} book${titleMatches.length > 1 ? "s" : ""}</strong> with a matching title:</p>
        <div class="chat-books-grid">
          ${titleMatches.map(b => renderChatBookCardHtml(b)).join("")}
        </div>
      `;
    } else {
      // Check if query matches Category
      const catMatches = books.filter(b => 
        (b.category || "").toLowerCase().includes(lowerQuery) || 
        (b.subCategory || "").toLowerCase().includes(lowerQuery)
      );
      if (catMatches.length > 0) {
        botHtml = `
          <p>🏷️ Found <strong>${catMatches.length} book${catMatches.length > 1 ? "s" : ""}</strong> in classification matching <strong>"${escapeHtml(query)}"</strong>:</p>
          <div class="chat-books-grid">
            ${catMatches.map(b => renderChatBookCardHtml(b)).join("")}
          </div>
        `;
      } else {
        const uniqueAuthors = [...new Set(books.map(b => (b.author || "").trim()).filter(Boolean))];
        botHtml = `
          <p>🔍 Sorry, I couldn't find any books by author or title matching <strong>"${escapeHtml(query)}"</strong>.</p>
          <p style="font-size: 12px; margin-top: 6px;">Here are authors currently in our library you can tap to search:</p>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
            ${uniqueAuthors.map(a => `<button type="button" class="chat-author-chip dynamic-chat-chip" data-author="${escapeHtml(a)}"><span class="material-symbols-rounded" style="font-size: 13px;">person</span> ${escapeHtml(a)}</button>`).join("")}
          </div>
        `;
      }
    }
  }

  const botMsgEl = document.createElement("div");
  botMsgEl.className = "chat-msg bot-msg";
  botMsgEl.innerHTML = `
    <div class="msg-avatar bot-avatar">
      <span class="material-symbols-rounded">forum</span>
    </div>
    <div class="msg-content-wrap" style="width: 100%;">
      <div class="msg-bubble bot-bubble" style="width: 100%;">
        ${botHtml}
      </div>
    </div>
  `;
  chatMessagesContainer.appendChild(botMsgEl);

  const openBackupFromChat = botMsgEl.querySelector("#openBackupFromChatBtn");
  if (openBackupFromChat) {
    openBackupFromChat.addEventListener("click", () => {
      closeChatSearchModal();
      openBackupModal();
    });
  }

  const openBatchQrFromChat = botMsgEl.querySelector("#openBatchQrFromChatBtn");
  if (openBatchQrFromChat) {
    openBatchQrFromChat.addEventListener("click", () => {
      closeChatSearchModal();
      openBatchQrModal();
    });
  }

  botMsgEl.querySelectorAll(".chat-action-btn.print-label").forEach(btn => {
    btn.addEventListener("click", () => {
      const bookId = btn.getAttribute("data-book-id");
      const book = books.find(b => b.id === bookId);
      if (book) {
        closeChatSearchModal();
        openPrintLabelModal(book);
      }
    });
  });

  botMsgEl.querySelectorAll(".chat-action-btn.view-library").forEach(btn => {
    btn.addEventListener("click", () => {
      const bookId = btn.getAttribute("data-book-id");
      closeChatSearchModal();
      navigateToBookInCatalog(bookId);
    });
  });

  botMsgEl.querySelectorAll(".dynamic-chat-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const author = chip.getAttribute("data-author");
      if (chatSearchInputField) chatSearchInputField.value = author;
      executeChatSearch(author);
    });
  });

  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

function renderChatBookCardHtml(book) {
  const isAvail = book.status === "Available";
  return `
    <div class="chat-book-result-card">
      <div class="chat-book-header-row">
        <div>
          <div class="chat-book-title">${escapeHtml(book.name)}</div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
            by <strong>${escapeHtml(book.author)}</strong>
          </div>
        </div>
        <span class="chat-book-id-badge">#${escapeHtml(book.bookNumber)}</span>
      </div>
      
      <div class="chat-book-meta-row">
        <span class="chat-meta-chip">🏷️ ${escapeHtml(book.category)}${book.subCategory ? ` › ${escapeHtml(book.subCategory)}` : ""}</span>
        <span class="chat-meta-chip">📍 Shelf ${escapeHtml(book.shelfLocation || "General")}</span>
        <span class="chat-status-pill ${isAvail ? 'available' : 'borrowed'}">
          <span class="material-symbols-rounded" style="font-size: 13px;">${isAvail ? 'check_circle' : 'schedule'}</span>
          ${isAvail ? 'Available' : 'Borrowed'}
        </span>
      </div>

      <div class="chat-book-actions-row">
        <button type="button" class="chat-action-btn print-label primary" data-book-id="${book.id}">
          <span class="material-symbols-rounded" style="font-size: 15px;">print</span> Print Label
        </button>
        <button type="button" class="chat-action-btn view-library" data-book-id="${book.id}">
          <span class="material-symbols-rounded" style="font-size: 15px;">visibility</span> View in Catalog
        </button>
      </div>
    </div>
  `;
}

function navigateToBookInCatalog(bookId) {
  currentFilter.search = "";
  currentFilter.availableOnly = false;
  currentFilter.category = "all";
  currentFilter.subCategory = "all";
  if (searchInput) searchInput.value = "";
  if (clearSearchBtn) clearSearchBtn.style.display = "none";
  if (availabilityToggleCheckbox) availabilityToggleCheckbox.checked = false;
  if (switchLabel) switchLabel.textContent = "All Books";
  renderBooks();

  setTimeout(() => {
    const card = document.querySelector(`[data-book-id="${bookId}"]`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("highlight-pulse");
      setTimeout(() => card.classList.remove("highlight-pulse"), 2600);
      showToast("Found book in catalog", "search");
    }
  }, 220);
}

// Chat Search Event Listeners
if (openChatSearchFromBarBtn) {
  openChatSearchFromBarBtn.addEventListener("click", () => openChatSearchModal());
}
if (openChatSearchQuickBtn) {
  openChatSearchQuickBtn.addEventListener("click", () => openChatSearchModal());
}
if (openChatSearchFabBtn) {
  openChatSearchFabBtn.addEventListener("click", () => openChatSearchModal());
}
if (closeChatSearchBtn) {
  closeChatSearchBtn.addEventListener("click", closeChatSearchModal);
}
if (clearChatHistoryBtn) {
  clearChatHistoryBtn.addEventListener("click", () => {
    renderChatWelcomeMessage();
    renderChatAuthorChips();
    showToast("Chat conversation reset", "refresh");
  });
}
if (chatSearchForm) {
  chatSearchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (chatSearchInputField) {
      executeChatSearch(chatSearchInputField.value);
    }
  });
}
if (chatSearchModalBackdrop) {
  chatSearchModalBackdrop.addEventListener("click", (e) => {
    if (e.target === chatSearchModalBackdrop) {
      closeChatSearchModal();
    }
  });
}

// ==========================================
// Category Studio Modal Events
// ==========================================
openAddCategoryBtn.addEventListener("click", () => openCategoryModal("main"));
closeCategoryModalBtn.addEventListener("click", closeCategoryModal);
closeCategoryDoneBtn.addEventListener("click", closeCategoryModal);

tabSubCategoriesBtn.addEventListener("click", () => switchCategoryTab("sub"));
tabMainCategoriesBtn.addEventListener("click", () => switchCategoryTab("main"));

manageCatSelect.addEventListener("change", () => {
  renderExistingSubCategoriesList();
});

saveSubCategoryBtn.addEventListener("click", () => {
  addNewSubCategory(manageCatSelect.value, newSubCategoryInput.value);
});
newSubCategoryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addNewSubCategory(manageCatSelect.value, newSubCategoryInput.value);
  }
});

saveCategoryBtn.addEventListener("click", () => {
  addNewMainCategory(newCategoryInput.value);
});
newCategoryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addNewMainCategory(newCategoryInput.value);
  }
});

categorySelect.addEventListener("change", () => {
  updateSubCategoryDropdown();
});

// ==========================================
// Insights / Stats Modal
// ==========================================
function openStatsModal() {
  const total = books.length;
  const available = books.filter(b => b.status === "Available").length;
  const borrowed = total - available;
  const totalPages = books.reduce((sum, b) => sum + (Number(b.totalPages) || 0), 0);
  const totalValuation = books.reduce((sum, b) => sum + (Number(b.price) || 0), 0);

  statTotalBooks.textContent = total;
  statAvailableBooks.textContent = available;
  statBorrowedBooks.textContent = borrowed;
  statTotalPages.textContent = totalPages.toLocaleString();
  statTotalValuation.textContent = `₹${totalValuation.toLocaleString()}`;

  // Category and sub-category breakdown
  categoryBreakdownList.innerHTML = "";
  const mainCategories = getMainCategories();

  mainCategories.forEach(cat => {
    const catBooks = books.filter(b => b.category === cat);
    if (catBooks.length > 0) {
      const row = document.createElement("div");
      row.className = "cat-breakdown-row";

      const subCats = getSubCategories(cat);
      const subDetails = subCats
        .map(s => {
          const sCount = catBooks.filter(b => b.subCategory === s).length;
          return sCount > 0 ? `${s} (${sCount})` : null;
        })
        .filter(Boolean)
        .join(" • ");

      row.innerHTML = `
        <div style="display: flex; flex-direction: column;">
          <span>${escapeHtml(cat)}</span>
          ${subDetails ? `<small style="color: var(--text-tertiary); font-size: 11px;">${escapeHtml(subDetails)}</small>` : ""}
        </div>
        <span class="item-count-chip">${catBooks.length} ${catBooks.length === 1 ? 'book' : 'books'}</span>
      `;
      categoryBreakdownList.appendChild(row);
    }
  });

  statsModalBackdrop.classList.add("open");
}

function closeStatsModal() {
  statsModalBackdrop.classList.remove("open");
}

quickStatsBtn.addEventListener("click", openStatsModal);
closeStatsModalBtn.addEventListener("click", closeStatsModal);
closeStatsBtn2.addEventListener("click", closeStatsModal);

// ==========================================
// Backup & Restore Data Logic
// ==========================================
async function openBackupModal() {
  if (backupStatBooks) {
    backupStatBooks.textContent = `${books.length} Books`;
  }
  if (backupStatCategories) {
    backupStatCategories.textContent = `${getMainCategories().length} Categories`;
  }
  if (backupStatServer) {
    backupStatServer.textContent = isBackendOnline ? "Dynamic Sync Active" : "Local Storage Mode";
  }

  if (isBackendOnline) {
    try {
      const res = await fetch(`${API_BASE}/status`);
      if (res.ok) {
        const data = await res.json();
        if (backupStatBooks && data.totalBooks !== undefined) {
          backupStatBooks.textContent = `${data.totalBooks} Books`;
        }
      }
    } catch (e) { }
  }

  fetchServerSnapshots();
  backupModalBackdrop.classList.add("open");
}

function closeBackupModal() {
  backupModalBackdrop.classList.remove("open");
}

function downloadBackupFile() {
  const payload = {
    app: "PayLib",
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    stats: {
      totalBooks: books.length,
      availableBooks: books.filter(b => b.status === "Available").length,
      totalCategories: getMainCategories().length
    },
    data: {
      books,
      categories: categoriesMap,
      settings: {
        pin: libraryPin,
        lockEnabled
      }
    }
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().split("T")[0];
  const a = document.createElement("a");
  a.href = url;
  a.download = `paylib_library_backup_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast("Backup downloaded successfully!", "download_done");
}

async function saveServerSnapshot() {
  if (!isBackendOnline) {
    showToast("Backend offline - downloading local file instead", "warning");
    downloadBackupFile();
    return;
  }

  try {
    saveServerSnapshotBtn.disabled = true;
    saveServerSnapshotBtn.innerHTML = `<span class="material-symbols-rounded">sync</span> Saving...`;

    const res = await fetch(`${API_BASE}/backup/snapshot`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      showToast(data.message || "Snapshot saved on server!", "check_circle");
      fetchServerSnapshots();
    } else {
      showToast("Error saving server snapshot", "warning");
    }
  } catch (err) {
    showToast("Server snapshot failed", "error");
  } finally {
    saveServerSnapshotBtn.disabled = false;
    saveServerSnapshotBtn.innerHTML = `<span class="material-symbols-rounded">save</span> Server Snapshot`;
  }
}

async function fetchServerSnapshots() {
  if (!snapshotsList) return;

  if (!isBackendOnline) {
    snapshotsList.innerHTML = `<div class="snapshot-empty">Backend offline - Server snapshots available when server is running</div>`;
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/backup/snapshots`);
    if (!res.ok) throw new Error("Fetch failed");
    const data = await res.json();
    const list = data.snapshots || [];

    if (list.length === 0) {
      snapshotsList.innerHTML = `<div class="snapshot-empty">No server snapshots yet. Click 'Server Snapshot' above to create one.</div>`;
      return;
    }

    snapshotsList.innerHTML = "";
    list.forEach(item => {
      const row = document.createElement("div");
      row.className = "snapshot-item";

      const dateFormatted = new Date(item.createdAt).toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
      });
      const sizeKb = (item.sizeBytes / 1024).toFixed(1) + " KB";

      row.innerHTML = `
        <div class="snapshot-item-left">
          <span class="material-symbols-rounded" style="color: var(--gpay-blue); font-size: 18px;">cloud_done</span>
          <div>
            <div class="snapshot-name">${escapeHtml(item.filename)}</div>
            <div class="snapshot-meta">${dateFormatted} • ${sizeKb}</div>
          </div>
        </div>
        <button type="button" class="gpay-pill-btn secondary restore-snap-btn" style="padding: 4px 10px; font-size: 11px;">
          <span class="material-symbols-rounded" style="font-size: 14px;">restore</span> Restore
        </button>
      `;

      row.querySelector(".restore-snap-btn").addEventListener("click", () => {
        confirmRestoreSnapshot(item.filename);
      });

      snapshotsList.appendChild(row);
    });
  } catch (err) {
    snapshotsList.innerHTML = `<div class="snapshot-empty">Unable to load snapshots from server</div>`;
  }
}

async function confirmRestoreSnapshot(filename) {
  const confirmed = await showCustomConfirm({
    title: "Restore Server Snapshot?",
    message: `Restore library from "${filename}"?\nThis will replace your current books and categories.`,
    icon: "cloud_download",
    confirmText: "Restore Now",
    cancelText: "Cancel",
    danger: true
  });

  if (!confirmed) return;

  try {
    const res = await fetch(`${API_BASE}/backup/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename })
    });

    await syncFromBackend();
    showToast("Snapshot restored successfully!", "check_circle");
    closeBackupModal();
  } catch (err) {
    showToast("Error restoring snapshot", "error");
  }
}

async function handleRestoreFileInput(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (event) {
    try {
      const parsed = JSON.parse(event.target.result);
      const data = parsed.data || parsed;
      const targetBooks = data.books;
      const targetCats = data.categories;
      const targetSettings = data.settings;

      if (!Array.isArray(targetBooks) || typeof targetCats !== "object" || targetCats === null) {
        showToast("Invalid backup file: missing books or categories", "warning");
        return;
      }

      const count = targetBooks.length;
      const catsCount = Object.keys(targetCats).length;

      const confirmed = await showCustomConfirm({
        title: "Restore Library?",
        message: `Restore library from "${file.name}"?\nContains ${count} books and ${catsCount} categories.\nYour current library data will be replaced.`,
        icon: "restore_page",
        confirmText: "Restore Library",
        cancelText: "Cancel",
        danger: true
      });

      if (!confirmed) {
        restoreFileInput.value = "";
        return;
      }

      // Apply locally
      books = targetBooks;
      categoriesMap = targetCats;
      if (targetSettings && targetSettings.pin) libraryPin = targetSettings.pin;
      if (targetSettings && targetSettings.lockEnabled !== undefined) lockEnabled = targetSettings.lockEnabled;

      saveBooksToStorage();
      saveCategoriesToStorage();

      // Sync to backend if online
      if (isBackendOnline) {
        try {
          await fetch(`${API_BASE}/backup/restore`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
          });
        } catch (err) {
          console.warn("Backend restore sync error:", err);
        }
      }

      // Update UI
      currentFilter.category = "All";
      currentFilter.subCategory = "All";
      renderCategoryChips();
      renderSubCategoryChips();
      populateCategoryDropdowns();
      renderBooks();
      updateAvailabilityCounter();

      showToast(`Restored ${count} books from backup!`, "check_circle");
      closeBackupModal();
    } catch (err) {
      console.error(err);
      showToast("Could not read backup file. Ensure it is valid JSON.", "error");
    } finally {
      restoreFileInput.value = "";
    }
  };

  reader.readAsText(file);
}

async function handleResetSampleData() {
  const confirmed = await showCustomConfirm({
    title: "Reset to Demo Catalog?",
    message: "Reset library to the original default sample catalog?\nAll existing entries will be replaced with initial showcase books.",
    icon: "restart_alt",
    confirmText: "Reset Demo",
    cancelText: "Cancel",
    danger: true
  });

  if (!confirmed) return;

  if (isBackendOnline) {
    try {
      await fetch(`${API_BASE}/backup/reset`, { method: "POST" });
      await syncFromBackend();
    } catch (err) {
      console.warn("Reset error:", err);
    }
  } else {
    books = [...DEFAULT_BOOKS];
    categoriesMap = { ...DEFAULT_CATEGORIES_DATA };
    libraryPin = "1234";
    lockEnabled = true;
    saveBooksToStorage();
    saveCategoriesToStorage();
    renderCategoryChips();
    renderSubCategoryChips();
    populateCategoryDropdowns();
    renderBooks();
    updateAvailabilityCounter();
  }

  showToast("Library reset to sample demo data!", "restart_alt");
  closeBackupModal();
}

// ==========================================
// Event Listeners & Interactions
// ==========================================
function bindEventListeners() {
  // Add Book Buttons
  openAddBookBtn.addEventListener("click", openAddBookModal);
  fabAddBook.addEventListener("click", openAddBookModal);
  closeBookModalBtn.addEventListener("click", closeBookModal);
  cancelBookBtn.addEventListener("click", closeBookModal);

  // Auto Gen Book Number
  autoGenNumberBtn.addEventListener("click", () => {
    bookNumberInput.value = generateUniqueBookNumber();
    showToast(`Generated: ${bookNumberInput.value}`);
  });

  // Backup & Restore Buttons
  if (openBackupBtn) openBackupBtn.addEventListener("click", openBackupModal);
  if (quickBackupBtn) quickBackupBtn.addEventListener("click", openBackupModal);
  if (openBackupFromSecurityBtn) {
    openBackupFromSecurityBtn.addEventListener("click", () => {
      closeSecurityModal();
      openBackupModal();
    });
  }
  if (closeBackupModalBtn) closeBackupModalBtn.addEventListener("click", closeBackupModal);
  if (closeBackupBtn2) closeBackupBtn2.addEventListener("click", closeBackupModal);
  if (downloadBackupBtn) downloadBackupBtn.addEventListener("click", downloadBackupFile);
  if (saveServerSnapshotBtn) saveServerSnapshotBtn.addEventListener("click", saveServerSnapshot);
  if (restoreFileInput) restoreFileInput.addEventListener("change", handleRestoreFileInput);
  if (refreshSnapshotsBtn) refreshSnapshotsBtn.addEventListener("click", fetchServerSnapshots);
  if (resetSampleDataBtn) resetSampleDataBtn.addEventListener("click", handleResetSampleData);

  // Cover Uploader trigger
  coverUploadBox.addEventListener("click", (e) => {
    if (e.target.closest(".cover-overlay-btns")) return;
    coverFileInput.click();
  });

  coverFileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleCoverFileUpload(e.target.files[0]);
    }
  });

  // Availability Switch (Card)
  availabilityToggleCheckbox.addEventListener("change", (e) => {
    currentFilter.availableOnly = e.target.checked;
    switchLabel.textContent = e.target.checked ? "Available Only" : "All Books";

    updateNavTabsState();
    renderBooks();

    if (e.target.checked) {
      showToast("Showing Available Books only", "inventory_2");
    } else {
      showToast("Showing All Books in library", "apps");
    }
  });

  // Quick Action: "Available Only" button
  filterAvailableBtn.addEventListener("click", () => {
    const nextState = !currentFilter.availableOnly;
    currentFilter.availableOnly = nextState;
    availabilityToggleCheckbox.checked = nextState;
    switchLabel.textContent = nextState ? "Available Only" : "All Books";
    updateNavTabsState();
    renderBooks();
    showToast(nextState ? "Filtered to Available Books" : "Showing All Books");
  });

  // Search Input
  searchInput.addEventListener("input", (e) => {
    currentFilter.search = e.target.value;
    clearSearchBtn.style.display = e.target.value ? "flex" : "none";
    renderBooks();
  });

  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    currentFilter.search = "";
    clearSearchBtn.style.display = "none";
    renderBooks();
  });

  // Reset filter on empty state or open Add Book if empty
  emptyResetBtn.addEventListener("click", () => {
    if (books.length === 0) {
      openAddBookModal();
      return;
    }
    currentFilter.search = "";
    currentFilter.category = "All";
    currentFilter.subCategory = "All";
    currentFilter.availableOnly = false;
    searchInput.value = "";
    clearSearchBtn.style.display = "none";
    availabilityToggleCheckbox.checked = false;
    switchLabel.textContent = "All Books";
    renderCategoryChips();
    renderSubCategoryChips();
    updateNavTabsState();
    renderBooks();
  });

  // Sorting Chips
  sortChips.forEach(chip => {
    chip.addEventListener("click", () => {
      sortChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentFilter.sortBy = chip.getAttribute("data-sort");
      renderBooks();
    });
  });

  // Theme Toggle
  themeToggleBtn.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (isDark) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("gpaylib_theme", "light");
      themeToggleBtn.querySelector(".material-symbols-rounded").textContent = "dark_mode";
      showToast("Light mode activated");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("gpaylib_theme", "dark");
      themeToggleBtn.querySelector(".material-symbols-rounded").textContent = "light_mode";
      showToast("Dark mode activated");
    }
  });

  if (document.documentElement.getAttribute("data-theme") === "dark") {
    themeToggleBtn.querySelector(".material-symbols-rounded").textContent = "light_mode";
  }

  // Bottom Navigation Tabs
  navTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const nav = tab.getAttribute("data-nav");
      handleNavClick(nav);
    });
  });

  // Lock Library Button in Header
  if (lockLibraryBtn) {
    lockLibraryBtn.addEventListener("click", lockLibraryNow);
  }

  // Profile Avatar triggers Security Settings
  if (profileAvatarBtn) {
    profileAvatarBtn.addEventListener("click", openSecurityModal);
  }

  // Keypad Number Buttons
  if (gpayKeypad) {
    gpayKeypad.querySelectorAll(".key-btn[data-key]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const key = e.currentTarget.getAttribute("data-key");
        handlePinDigit(key);
      });
    });
  }

  if (keyResetBtn) keyResetBtn.addEventListener("click", resetPinBuffer);
  if (keyBackspaceBtn) keyBackspaceBtn.addEventListener("click", handlePinBackspace);
  if (forgotPinBtn) forgotPinBtn.addEventListener("click", resetPinToDefault);

  // Security Settings Modal Handlers
  if (closeSecurityModalBtn) closeSecurityModalBtn.addEventListener("click", closeSecurityModal);
  if (closeSecurityBtn2) closeSecurityBtn2.addEventListener("click", closeSecurityModal);
  if (lockEnabledCheckbox) {
    lockEnabledCheckbox.addEventListener("change", (e) => toggleLockEnabled(e.target.checked));
  }
  if (updatePinBtn) updatePinBtn.addEventListener("click", updatePin);
  if (lockNowBtn) lockNowBtn.addEventListener("click", lockLibraryNow);

  // Physical keyboard support for PIN input
  document.addEventListener("keydown", (e) => {
    if (libraryLockScreen && !libraryLockScreen.classList.contains("unlocked")) {
      if (e.key >= "0" && e.key <= "9") {
        handlePinDigit(e.key);
      } else if (e.key === "Backspace") {
        handlePinBackspace();
      } else if (e.key === "Escape") {
        resetPinBuffer();
      }
    }
  });

  // Escape key closes modals
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeBookModal();
      closeFullscreenCover();
      closePrintModal();
      closeCategoryModal();
      closeStatsModal();
      closeSecurityModal();
    }
  });
}

// ==========================================
// Google Pay Security & App Lock Implementation
// ==========================================
function initLockScreen() {
  if (lockEnabledCheckbox) {
    lockEnabledCheckbox.checked = lockEnabled;
  }

  if (!lockEnabled || isUnlocked) {
    libraryLockScreen.classList.add("unlocked");
  } else {
    libraryLockScreen.classList.remove("unlocked");
    resetPinBuffer();
    setTimeout(() => {
      if (pinKeyboardInput) pinKeyboardInput.focus();
    }, 100);
  }
}

function handlePinDigit(digit) {
  if (enteredPinBuffer.length < 4) {
    enteredPinBuffer += digit;
    updatePinDots();

    if (enteredPinBuffer.length === 4) {
      setTimeout(verifyPin, 120);
    }
  }
}

function handlePinBackspace() {
  if (enteredPinBuffer.length > 0) {
    enteredPinBuffer = enteredPinBuffer.slice(0, -1);
    updatePinDots();
  }
}

function resetPinBuffer() {
  enteredPinBuffer = "";
  updatePinDots();
  if (pinKeyboardInput) pinKeyboardInput.value = "";
}

function updatePinDots() {
  pinDots.forEach((dot, idx) => {
    if (idx < enteredPinBuffer.length) {
      dot.classList.add("filled");
    } else {
      dot.classList.remove("filled");
    }
  });
}

function verifyPin() {
  if (enteredPinBuffer === libraryPin) {
    // Successfully Unlocked!
    isUnlocked = true;
    sessionStorage.setItem("gpaylib_unlocked", "true");
    libraryLockScreen.classList.add("unlocked");
    resetPinBuffer();
    showToast("Library Unlocked • Welcome!", "lock_open");
  } else {
    // Incorrect PIN
    pinDotsContainer.classList.add("shake");
    lockMessage.classList.add("error");
    lockMessage.innerHTML = `<span class="material-symbols-rounded" style="font-size: 15px;">error</span> Incorrect PIN. Try again.`;

    setTimeout(() => {
      pinDotsContainer.classList.remove("shake");
      resetPinBuffer();
      lockMessage.classList.remove("error");
      lockMessage.innerHTML = `<span class="material-symbols-rounded" style="font-size: 15px;">info</span> Default PIN is <strong>1234</strong>`;
    }, 600);
  }
}

function lockLibraryNow() {
  isUnlocked = false;
  sessionStorage.removeItem("gpaylib_unlocked");
  resetPinBuffer();
  closeSecurityModal();
  closeBookModal();
  closeFullscreenCover();
  closePrintModal();
  closeCategoryModal();
  closeStatsModal();
  libraryLockScreen.classList.remove("unlocked");
  showToast("Library Locked", "lock");
  setTimeout(() => {
    if (pinKeyboardInput) pinKeyboardInput.focus();
  }, 150);
}

function openSecurityModal() {
  lockEnabledCheckbox.checked = lockEnabled;
  currentPinInput.value = "";
  newPinInput.value = "";
  securitySettingsModalBackdrop.classList.add("open");
}

function closeSecurityModal() {
  securitySettingsModalBackdrop.classList.remove("open");
}

function updatePin() {
  const currentVal = currentPinInput.value.trim();
  const newVal = newPinInput.value.trim();

  if (currentVal !== libraryPin) {
    showToast("Current PIN is incorrect!", "warning");
    return;
  }

  if (!/^\d{4}$/.test(newVal)) {
    showToast("New PIN must be exactly 4 digits (0-9)!", "warning");
    return;
  }

  libraryPin = newVal;
  localStorage.setItem("gpaylib_pin", libraryPin);
  apiUpdateSettings({ pin: libraryPin });
  showToast("PIN updated successfully!");
  closeSecurityModal();
}

function toggleLockEnabled(enabled) {
  lockEnabled = enabled;
  localStorage.setItem("gpaylib_lock_enabled", enabled ? "true" : "false");
  apiUpdateSettings({ lockEnabled: enabled });
  if (!enabled) {
    isUnlocked = true;
    sessionStorage.setItem("gpaylib_unlocked", "true");
    libraryLockScreen.classList.add("unlocked");
    showToast("PIN protection disabled");
  } else {
    showToast("PIN protection enabled on entry");
  }
}

async function resetPinToDefault() {
  const answer = await showCustomPrompt({
    title: "Reset Security PIN",
    message: 'Type "RESET" to restore the default PIN (1234):',
    label: "Confirmation Word",
    placeholder: "Type RESET here",
    icon: "lock_reset",
    confirmText: "Reset PIN",
    danger: true
  });
  if (answer && answer.trim().toUpperCase() === "RESET") {
    libraryPin = "1234";
    localStorage.setItem("gpaylib_pin", "1234");
    apiUpdateSettings({ pin: "1234" });
    resetPinBuffer();
    showToast("PIN has been reset to default: 1234");
  }
}

function updateNavTabsState() {
  navTabs.forEach(t => {
    const nav = t.getAttribute("data-nav");
    if (currentFilter.availableOnly && nav === "available") {
      t.classList.add("active");
    } else if (!currentFilter.availableOnly && nav === "all") {
      t.classList.add("active");
    } else {
      t.classList.remove("active");
    }
  });
}

function handleNavClick(nav) {
  navTabs.forEach(t => t.classList.remove("active"));
  const clicked = Array.from(navTabs).find(t => t.getAttribute("data-nav") === nav);
  if (clicked) clicked.classList.add("active");

  if (nav === "all") {
    currentFilter.availableOnly = false;
    availabilityToggleCheckbox.checked = false;
    switchLabel.textContent = "All Books";
    renderBooks();
  } else if (nav === "chat") {
    openChatSearchModal();
  } else if (nav === "available") {
    currentFilter.availableOnly = true;
    availabilityToggleCheckbox.checked = true;
    switchLabel.textContent = "Available Only";
    renderBooks();
    showToast("Showing Available Books only", "inventory_2");
  } else if (nav === "backup") {
    openBackupModal();
  } else if (nav === "labels") {
    openBatchQrModal();
  } else if (nav === "stats") {
    openStatsModal();
  }
}

// Toast
let toastTimer = null;
function showToast(message, iconName = "check_circle") {
  if (toastTimer) clearTimeout(toastTimer);

  toastMessage.textContent = message;
  toastIcon.textContent = iconName;
  gpayToast.classList.add("show");

  toastTimer = setTimeout(() => {
    gpayToast.classList.remove("show");
  }, 2800);
}

// Escape HTML
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.addEventListener("DOMContentLoaded", initApp);
