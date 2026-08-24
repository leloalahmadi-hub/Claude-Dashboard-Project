// app.js
// نقطة الدخول الرئيسية للواجهة.
// كل تعامل مع البيانات يمر عبر dataService.js فقط — هذا الملف لا يعرف
// شيئًا عن data.js أو localStorage، ولا يصل إليهما مباشرة أبدًا.

const STATUSES = ["نشط", "مكتمل", "متأخر", "قيد التخطيط"];
const PRIORITIES = ["عالية", "متوسطة", "منخفضة"];
const DEFAULT_DEPARTMENTS = ["إدارة التقنية", "إدارة التسويق", "إدارة العمليات", "إدارة الموارد البشرية"];
const DEPARTMENT_COLORS = ["#6366f1", "#f59e0b", "#22c55e", "#3b82f6", "#ef4444", "#14b8a6", "#a855f7"];
const CUSTOM_DEPARTMENTS_KEY = "dashboard_custom_departments";
const THEME_KEY = "dashboard_theme";

const NEAR_DEADLINE_DAYS = 7;
const ATTENTION_DAYS = 14;
const ATTENTION_PROGRESS_THRESHOLD = 40;

const STATUS_COLOR_MAP = {
  "نشط": "var(--color-active)",
  "مكتمل": "var(--color-completed)",
  "متأخر": "var(--color-late)",
  "قيد التخطيط": "var(--color-planning)"
};

const PRIORITY_COLOR_MAP = {
  "عالية": "var(--color-priority-high)",
  "متوسطة": "var(--color-priority-medium)",
  "منخفضة": "var(--color-priority-low)"
};

const VIEW_TITLES = {
  overview: "نظرة عامة",
  projects: "المشاريع",
  managers: "المسؤولون",
  departments: "الإدارات",
  analytics: "التحليلات"
};

// ===== حالة الواجهة الحالية =====
let editingProjectId = null; // null = وضع الإضافة، رقم = وضع التعديل
let pendingDeleteId = null;
let selectedManager = null;

function loadCustomDepartments() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_DEPARTMENTS_KEY)) || [];
  } catch (error) {
    return [];
  }
}

function saveCustomDepartments(list) {
  localStorage.setItem(CUSTOM_DEPARTMENTS_KEY, JSON.stringify(list));
}

let customDepartments = loadCustomDepartments();
let departmentsFromServer = []; // تُملأ لاحقًا من Airtable عند بدء التشغيل

async function loadServerDepartments() {
  try {
    departmentsFromServer = await dataService.getAllDepartments();
  } catch (error) {
    console.error("تعذّر تحميل الإدارات من الخادم:", error.message);
  }
  populateDepartmentSelect();
  renderDepartments();
  renderOverview();
  renderAnalytics();
}

function getAllDepartments() {
  // دمج الإدارات الافتراضية + المضافة يدويًا محليًا + الحقيقية من Airtable
  const merged = new Set([...DEFAULT_DEPARTMENTS, ...customDepartments, ...departmentsFromServer]);
  return [...merged];
}

function getDepartmentColorMap() {
  const map = {};
  getAllDepartments().forEach((dept, i) => {
    map[dept] = DEPARTMENT_COLORS[i % DEPARTMENT_COLORS.length];
  });
  return map;
}

// ===== عناصر DOM المستخدمة بكثرة =====
const projectsContainer = document.getElementById("projects-container");
const emptyState = document.getElementById("empty-state");

const searchInput = document.getElementById("search-input");
const statusFilter = document.getElementById("status-filter");
const priorityFilter = document.getElementById("priority-filter");
const resetFiltersBtn = document.getElementById("reset-filters-btn");

const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");
const projectForm = document.getElementById("project-form");
const addProjectBtn = document.getElementById("add-project-btn");
const closeModalBtn = document.getElementById("close-modal-btn");
const cancelModalBtn = document.getElementById("cancel-modal-btn");

const confirmOverlay = document.getElementById("confirm-overlay");
const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
const cancelDeleteBtn = document.getElementById("cancel-delete-btn");

const toastContainer = document.getElementById("toast-container");
const managersContainer = document.getElementById("managers-container");
const departmentsContainer = document.getElementById("departments-container");
const addDepartmentForm = document.getElementById("add-department-form");
const newDepartmentInput = document.getElementById("new-department-input");

const themeToggleBtn = document.getElementById("theme-toggle-btn");
const themeToggleIcon = document.getElementById("theme-toggle-icon");

const refreshBtn = document.getElementById("refresh-btn");
const notifBtn = document.getElementById("notif-btn");
const notifBadge = document.getElementById("notif-badge");
const notifDropdown = document.getElementById("notif-dropdown");
const topbarTitle = document.getElementById("topbar-title");
const topbarDate = document.getElementById("topbar-date");

// ===== دوال مساعدة للعرض =====
function getStatusClass(status) {
  const map = {
    "نشط": "status-active",
    "مكتمل": "status-completed",
    "متأخر": "status-late",
    "قيد التخطيط": "status-planning"
  };
  return map[status] || "";
}

function getPriorityClass(priority) {
  const map = {
    "عالية": "priority-high",
    "متوسطة": "priority-medium",
    "منخفضة": "priority-low"
  };
  return map[priority] || "";
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat("ar", {
    year: "numeric",
    month: "long",
    day: "numeric",
    calendar: "gregory"
  }).format(date);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function getInitials(name) {
  const parts = (name || "").trim().split(/\s+/);
  const first = parts[0] ? parts[0][0] : "";
  const second = parts[1] ? parts[1][0] : "";
  return (first + second) || "؟";
}

const ICON_OWNER = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const ICON_CALENDAR = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const ICON_DEPARTMENT = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="4" y="9" width="16" height="11" rx="1.5" stroke="currentColor" stroke-width="2"/><path d="M9 9V6a3 3 0 0 1 3-3v0a3 3 0 0 1 3 3v3" stroke="currentColor" stroke-width="2"/></svg>`;
const ICON_DEPARTMENT_LG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="4" y="9" width="16" height="11" rx="1.5" stroke="currentColor" stroke-width="2"/><path d="M9 9V6a3 3 0 0 1 3-3v0a3 3 0 0 1 3 3v3" stroke="currentColor" stroke-width="2"/></svg>`;
const ICON_SUN = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.5" stroke="currentColor" stroke-width="2"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const ICON_MOON = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
const ICON_REFRESH = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 12a8 8 0 0 1 14-5.2M20 12a8 8 0 0 1-14 5.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18 4v4h-4M6 20v-4h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_BELL = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const ICON_ALERT_LATE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const ICON_ALERT_ATTENTION = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3 2 20h20L12 3Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const ICON_ALERT_NEAR = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_ALL_GOOD = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M8 12.5l2.5 2.5L16 9.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_EMPTY = `<svg width="44" height="44" viewBox="0 0 24 24" fill="none"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 13.5l2 2 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"/></svg>`;
const ICON_TOAST_SUCCESS = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M8 12.5l2.5 2.5L16 9.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_TOAST_DANGER = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

// ===== التنقل بين الأقسام =====
function switchView(view) {
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("hidden", section.id !== `view-${view}`);
  });
  topbarTitle.textContent = VIEW_TITLES[view] || "";
}

function renderTopbarDate() {
  topbarDate.textContent = new Intl.DateTimeFormat("ar", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    calendar: "gregory"
  }).format(new Date());
}

// ===== تصنيف حالة المواعيد (متأخر / يحتاج متابعة / قريب من التسليم) =====
function getDaysUntilDue(dueDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

function classifyProjectAlert(project) {
  if (project.status === "مكتمل") return null;

  const daysUntilDue = getDaysUntilDue(project.dueDate);

  if (project.status === "متأخر") {
    return { type: "late", label: "متأخر", daysUntilDue };
  }

  if (daysUntilDue <= ATTENTION_DAYS && project.progress < ATTENTION_PROGRESS_THRESHOLD) {
    return { type: "attention", label: "يحتاج متابعة", daysUntilDue };
  }

  if (daysUntilDue >= 0 && daysUntilDue <= NEAR_DEADLINE_DAYS) {
    return { type: "near", label: "قريب من التسليم", daysUntilDue };
  }

  return null;
}

function computeQuickAlerts() {
  return dataService
    .getAllProjects()
    .map((project) => ({ project, alert: classifyProjectAlert(project) }))
    .filter((item) => item.alert !== null)
    .sort((a, b) => a.alert.daysUntilDue - b.alert.daysUntilDue)
    .slice(0, 6);
}

function createAlertItem(item) {
  const { project, alert } = item;
  const iconMap = { late: ICON_ALERT_LATE, attention: ICON_ALERT_ATTENTION, near: ICON_ALERT_NEAR };
  const daysText =
    alert.daysUntilDue < 0
      ? `متأخر ${Math.abs(alert.daysUntilDue)} يوم`
      : alert.daysUntilDue === 0
      ? "اليوم"
      : `خلال ${alert.daysUntilDue} يوم`;

  return `
    <div class="alert-item alert-item--${alert.type}">
      <span class="alert-item__icon">${iconMap[alert.type]}</span>
      <div class="alert-item__body">
        <span class="alert-item__name">${escapeHtml(project.name)}</span>
        <span class="alert-item__meta">${alert.label} · ${daysText}</span>
      </div>
    </div>
  `;
}

function renderAlertsInto(containerId, alerts) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = alerts.length
    ? alerts.map(createAlertItem).join("")
    : `
      <div class="all-good">
        <span class="all-good__icon">${ICON_ALL_GOOD}</span>
        <p>لا توجد تنبيهات حاليًا</p>
        <span>كل المشاريع على المسار الصحيح.</span>
      </div>
    `;
}

function renderQuickAlerts() {
  const alerts = computeQuickAlerts();
  renderAlertsInto("quick-alerts-container", alerts);
  renderAlertsInto("notif-list", alerts);

  if (alerts.length > 0) {
    notifBadge.textContent = alerts.length;
    notifBadge.classList.remove("hidden");
  } else {
    notifBadge.classList.add("hidden");
  }
}

// ===== الإحصائيات =====
function renderStats() {
  const stats = dataService.getStats();
  const pct = (n) => (stats.total ? Math.round((n / stats.total) * 100) : 0);

  document.getElementById("stat-total").textContent = stats.total;
  document.getElementById("stat-active").textContent = stats.active;
  document.getElementById("stat-completed").textContent = stats.completed;
  document.getElementById("stat-late").textContent = stats.late;

  document.getElementById("stat-total-sub").textContent = "جميع المشاريع المسجلة";
  document.getElementById("stat-active-sub").textContent = `${pct(stats.active)}% من الإجمالي`;
  document.getElementById("stat-completed-sub").textContent = `${pct(stats.completed)}% من الإجمالي`;
  document.getElementById("stat-late-sub").textContent = stats.late > 0 ? "يتطلب متابعة عاجلة" : "لا يوجد تأخير حاليًا";

  document.getElementById("stat-active-bar").style.width = `${pct(stats.active)}%`;
  document.getElementById("stat-completed-bar").style.width = `${pct(stats.completed)}%`;
  document.getElementById("stat-late-bar").style.width = `${pct(stats.late)}%`;
}

// ===== عنصر مشروع مختصر (يُستخدم في نظرة عامة وقسم المسؤولون) =====
function createMiniProjectItem(project) {
  const alert = classifyProjectAlert(project);
  const alertBadge =
    alert && alert.type !== "late" ? `<span class="badge badge-alert-${alert.type}">${alert.label}</span>` : "";

  return `
    <div class="mini-item">
      <div class="mini-item__top">
        <span class="mini-item__name">${escapeHtml(project.name)}</span>
        <span class="badge ${getStatusClass(project.status)}">${project.status}</span>
      </div>
      <div class="mini-item__meta">
        <span class="badge ${getPriorityClass(project.priority)}">${project.priority}</span>
        <span class="mini-item__date">${ICON_CALENDAR} ${formatDate(project.dueDate)}</span>
        ${alertBadge}
      </div>
      <div class="progress">
        <div class="progress__bar" style="width: ${project.progress}%;"></div>
      </div>
      <span class="progress__label">${project.progress}% مكتمل</span>
    </div>
  `;
}

// ===== بطاقة مشروع كاملة (قسم المشاريع) =====
function createProjectCard(project) {
  const alert = classifyProjectAlert(project);
  const alertBadge =
    alert && alert.type !== "late" ? `<span class="badge badge-alert-${alert.type}">${alert.label}</span>` : "";

  return `
    <article class="project-card" data-id="${project.id}">
      <div class="project-card__top">
        <h3 class="project-card__name">${escapeHtml(project.name)}</h3>
        <span class="badge ${getPriorityClass(project.priority)}">${project.priority}</span>
      </div>

      ${project.description ? `<p class="project-card__desc">${escapeHtml(project.description)}</p>` : ""}

      <div class="project-card__meta">
        <span class="badge ${getStatusClass(project.status)}">${project.status}</span>
        ${alertBadge}
        <span class="project-card__owner">${ICON_OWNER} ${escapeHtml(project.owner)}</span>
        <span class="project-card__dept">${ICON_DEPARTMENT} ${escapeHtml(project.department || "")}</span>
        <span class="project-card__date">${ICON_CALENDAR} ${formatDate(project.dueDate)}</span>
      </div>

      <div class="progress">
        <div class="progress__bar" style="width: ${project.progress}%;"></div>
      </div>
      <span class="progress__label">${project.progress}% مكتمل</span>

      <div class="project-card__actions">
        <button type="button" class="icon-btn" data-action="edit" data-id="${project.id}" aria-label="تعديل">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
          تعديل
        </button>
        <button type="button" class="icon-btn icon-btn--danger" data-action="delete" data-id="${project.id}" aria-label="حذف">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-8 0v13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          حذف
        </button>
      </div>
    </article>
  `;
}

function getCurrentFilters() {
  return {
    query: searchInput.value,
    status: statusFilter.value,
    priority: priorityFilter.value
  };
}

function renderProjects() {
  const projects = dataService.searchAndFilter(getCurrentFilters());

  if (projects.length === 0) {
    projectsContainer.innerHTML = "";
    emptyState.classList.remove("hidden");
  } else {
    emptyState.classList.add("hidden");
    projectsContainer.innerHTML = projects.map(createProjectCard).join("");
  }
}

// ===== توزيعات قابلة لإعادة الاستخدام (نظرة عامة + التحليلات) =====
function computeStatusCounts() {
  const counts = {};
  STATUSES.forEach((status) => (counts[status] = 0));
  dataService.getAllProjects().forEach((project) => {
    counts[project.status] = (counts[project.status] || 0) + 1;
  });
  return counts;
}

function computePriorityCounts() {
  const counts = {};
  PRIORITIES.forEach((priority) => (counts[priority] = 0));
  dataService.getAllProjects().forEach((project) => {
    counts[project.priority] = (counts[project.priority] || 0) + 1;
  });
  return counts;
}

function computeDepartmentCounts() {
  const counts = {};
  getAllDepartments().forEach((department) => (counts[department] = 0));
  dataService.getAllProjects().forEach((project) => {
    counts[project.department] = (counts[project.department] || 0) + 1;
  });
  return counts;
}

function renderDistribution(containerId, counts, colorMap = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0) || 1;

  container.innerHTML = Object.entries(counts)
    .map(([label, count]) => {
      const fill = colorMap[label] ? `background: ${colorMap[label]};` : `background: var(--gradient-primary);`;
      return `
        <div class="distribution-row">
          <div class="distribution-row__top">
            <span>${escapeHtml(label)}</span>
            <span>${count}</span>
          </div>
          <div class="distribution-bar">
            <div class="distribution-bar__fill" style="width: ${(count / total) * 100}%; ${fill}"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderStatusDistribution(containerId) {
  renderDistribution(containerId, computeStatusCounts(), STATUS_COLOR_MAP);
}

function renderPriorityDistribution(containerId) {
  renderDistribution(containerId, computePriorityCounts(), PRIORITY_COLOR_MAP);
}

function renderDepartmentDistribution(containerId) {
  renderDistribution(containerId, computeDepartmentCounts(), getDepartmentColorMap());
}

// ===== قسم نظرة عامة =====
function renderLatestProjects() {
  const latest = [...dataService.getAllProjects()].sort((a, b) => b.id - a.id).slice(0, 4);

  const container = document.getElementById("latest-projects-container");
  container.innerHTML = latest.length
    ? latest.map(createMiniProjectItem).join("")
    : `<p class="empty-hint">لا توجد مشاريع بعد.</p>`;
}

function renderOverview() {
  renderLatestProjects();
  renderStatusDistribution("status-distribution");
  renderDepartmentDistribution("department-distribution");
}

// ===== قسم التحليلات =====
function renderAnalytics() {
  const projects = dataService.getAllProjects();
  const stats = dataService.getStats();

  const avgProgress = projects.length
    ? Math.round(projects.reduce((sum, p) => sum + p.progress, 0) / projects.length)
    : 0;

  const nearCount = projects.filter((p) => {
    const alert = classifyProjectAlert(p);
    return alert && alert.type !== "late";
  }).length;

  document.getElementById("analytics-avg-progress").textContent = `${avgProgress}%`;
  document.getElementById("analytics-late-count").textContent = stats.late;
  document.getElementById("analytics-near-count").textContent = nearCount;

  renderStatusDistribution("analytics-status-distribution");
  renderPriorityDistribution("analytics-priority-distribution");
  renderDepartmentDistribution("analytics-department-distribution");
}

// ===== قسم الإدارات =====
function computeDepartmentStats() {
  const projects = dataService.getAllProjects();

  return getAllDepartments().map((department) => {
    const deptProjects = projects.filter((p) => p.department === department);
    const managers = new Set(deptProjects.map((p) => p.owner));

    return {
      name: department,
      totalProjects: deptProjects.length,
      totalManagers: managers.size,
      active: deptProjects.filter((p) => p.status === "نشط").length,
      completed: deptProjects.filter((p) => p.status === "مكتمل").length,
      late: deptProjects.filter((p) => p.status === "متأخر").length,
      avgProgress: deptProjects.length
        ? Math.round(deptProjects.reduce((sum, p) => sum + p.progress, 0) / deptProjects.length)
        : 0
    };
  });
}

function createDepartmentCard(department, index) {
  const color = DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length];
  return `
    <div class="department-card">
      <div class="department-card__header">
        <span class="department-card__name">${escapeHtml(department.name)}</span>
        <span class="department-card__icon" style="background-color: ${color};">${ICON_DEPARTMENT_LG}</span>
      </div>

      <div class="department-card__stats">
        <div class="dept-stat-box">
          <span class="dept-stat-box__label">المسؤولون</span>
          <span class="dept-stat-box__value">${department.totalManagers}</span>
        </div>
        <div class="dept-stat-box">
          <span class="dept-stat-box__label">المشاريع</span>
          <span class="dept-stat-box__value">${department.totalProjects}</span>
        </div>
        <div class="dept-stat-box">
          <span class="dept-stat-box__label">متوسط الإنجاز</span>
          <span class="dept-stat-box__value">${department.avgProgress}%</span>
        </div>
      </div>

      <div class="department-card__badges">
        <span class="badge status-active">${department.active} نشط</span>
        <span class="badge status-completed">${department.completed} مكتمل</span>
        <span class="badge status-late">${department.late} متأخر</span>
      </div>
    </div>
  `;
}

function renderDepartments() {
  const stats = computeDepartmentStats();
  departmentsContainer.innerHTML = stats.map(createDepartmentCard).join("");
}

function populateDepartmentSelect() {
  const select = document.getElementById("field-department");
  const currentValue = select.value;
  const departments = getAllDepartments();

  select.innerHTML = departments
    .map((dept) => `<option value="${escapeHtml(dept)}">${escapeHtml(dept)}</option>`)
    .join("");

  if (currentValue && departments.includes(currentValue)) {
    select.value = currentValue;
  }
}

function handleAddDepartment(event) {
  event.preventDefault();

  const errorEl = document.getElementById("error-department");
  const name = newDepartmentInput.value.trim();
  errorEl.textContent = "";

  if (!name) {
    errorEl.textContent = "يرجى إدخال اسم الإدارة.";
    return;
  }

  if (getAllDepartments().includes(name)) {
    errorEl.textContent = "هذه الإدارة موجودة بالفعل.";
    return;
  }

  customDepartments.push(name);
  saveCustomDepartments(customDepartments);
  newDepartmentInput.value = "";

  populateDepartmentSelect();
  renderDepartments();
  renderOverview();
  renderAnalytics();
  showToast("تمت إضافة الإدارة بنجاح.");
}

// ===== الوضع الداكن / الفاتح =====
function getPreferredTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const isDark = theme === "dark";
  themeToggleIcon.innerHTML = isDark ? ICON_SUN : ICON_MOON;
  themeToggleBtn.setAttribute("aria-label", isDark ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن");
  themeToggleBtn.setAttribute("title", isDark ? "الوضع الفاتح" : "الوضع الداكن");
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

// ===== قسم المسؤولون =====
function computeManagerStats() {
  const managersMap = new Map();

  dataService.getAllProjects().forEach((project) => {
    if (!managersMap.has(project.owner)) {
      managersMap.set(project.owner, {
        name: project.owner,
        total: 0,
        active: 0,
        completed: 0,
        late: 0,
        progressSum: 0
      });
    }

    const manager = managersMap.get(project.owner);
    manager.total += 1;
    manager.progressSum += project.progress;
    if (project.status === "نشط") manager.active += 1;
    if (project.status === "مكتمل") manager.completed += 1;
    if (project.status === "متأخر") manager.late += 1;
  });

  return [...managersMap.values()]
    .map((manager) => ({
      ...manager,
      avgProgress: Math.round(manager.progressSum / manager.total)
    }))
    .sort((a, b) => b.total - a.total);
}

function createManagerCard(manager, index) {
  const isActive = manager.name === selectedManager;
  const color = DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length];

  return `
    <button type="button" class="manager-card ${isActive ? "manager-card--active" : ""}" data-owner="${escapeHtml(manager.name)}">
      <div class="manager-card__header">
        <span class="avatar" style="background-color: ${color};">${escapeHtml(getInitials(manager.name))}</span>
        <span class="manager-card__name">${escapeHtml(manager.name)}</span>
      </div>

      <div class="manager-card__stats">
        <div class="dept-stat-box">
          <span class="dept-stat-box__label">المشاريع</span>
          <span class="dept-stat-box__value">${manager.total}</span>
        </div>
        <div class="dept-stat-box">
          <span class="dept-stat-box__label">متوسط الإنجاز</span>
          <span class="dept-stat-box__value">${manager.avgProgress}%</span>
        </div>
      </div>

      <div class="manager-card__badges">
        <span class="badge status-active">${manager.active} نشط</span>
        <span class="badge status-completed">${manager.completed} مكتمل</span>
        <span class="badge status-late">${manager.late} متأخر</span>
      </div>
    </button>
  `;
}

function renderManagerProjects() {
  const title = document.getElementById("manager-projects-title");
  const container = document.getElementById("manager-projects-container");

  if (!selectedManager) {
    title.textContent = "اختر مسؤولًا لعرض مشاريعه";
    container.innerHTML = `<p class="empty-hint">اختر بطاقة مسؤول من الأعلى لعرض تفاصيل مشاريعه هنا.</p>`;
    return;
  }

  title.textContent = `مشاريع ${selectedManager}`;
  const projects = dataService.getAllProjects().filter((p) => p.owner === selectedManager);
  container.innerHTML = projects.length
    ? projects.map(createMiniProjectItem).join("")
    : `<p class="empty-hint">لا توجد مشاريع لهذا المسؤول حاليًا.</p>`;
}

function renderManagers() {
  const managers = computeManagerStats();
  managersContainer.innerHTML = managers.map(createManagerCard).join("");
  renderManagerProjects();
}

// ===== تحديث شامل بعد أي تغيير في البيانات =====
function refreshDashboard() {
  renderStats();
  renderProjects();
  renderOverview();
  renderManagers();
  renderDepartments();
  renderAnalytics();
  renderQuickAlerts();
}

// ===== التنبيهات (Toast) =====
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  const icon = type === "danger" ? ICON_TOAST_DANGER : ICON_TOAST_SUCCESS;
  toast.innerHTML = `<span class="toast__icon">${icon}</span><span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => toast.classList.add("toast--visible"), 10);
  setTimeout(() => {
    toast.classList.remove("toast--visible");
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

// ===== نافذة الإضافة/التعديل =====
function openAddModal() {
  editingProjectId = null;
  modalTitle.textContent = "إضافة مشروع جديد";
  populateDepartmentSelect();
  projectForm.reset();
  document.getElementById("field-progress").value = 0;
  clearFormErrors();
  modalOverlay.classList.remove("hidden");
  document.getElementById("field-name").focus();
}

function openEditModal(id) {
  const project = dataService.getProjectById(id);
  if (!project) return;

  editingProjectId = id;
  modalTitle.textContent = "تعديل المشروع";

  document.getElementById("field-name").value = project.name;
  document.getElementById("field-owner").value = project.owner;
  document.getElementById("field-description").value = project.description || "";
  document.getElementById("field-status").value = project.status;
  document.getElementById("field-priority").value = project.priority;
  populateDepartmentSelect();
  document.getElementById("field-department").value = project.department || DEFAULT_DEPARTMENTS[0];
  document.getElementById("field-progress").value = project.progress;
  document.getElementById("field-dueDate").value = project.dueDate;

  clearFormErrors();
  modalOverlay.classList.remove("hidden");
  document.getElementById("field-name").focus();
}

function closeModal() {
  modalOverlay.classList.add("hidden");
  editingProjectId = null;
}

function clearFormErrors() {
  document.querySelectorAll(".form-error").forEach((el) => (el.textContent = ""));
}

function validateForm(data) {
  let isValid = true;
  clearFormErrors();

  if (!data.name.trim()) {
    document.getElementById("error-name").textContent = "اسم المشروع مطلوب.";
    isValid = false;
  }

  if (!data.owner.trim()) {
    document.getElementById("error-owner").textContent = "اسم المسؤول مطلوب.";
    isValid = false;
  }

  if (Number.isNaN(data.progress) || data.progress < 0 || data.progress > 100) {
    document.getElementById("error-progress").textContent = "نسبة الإنجاز يجب أن تكون بين 0 و100.";
    isValid = false;
  }

  if (!data.dueDate) {
    document.getElementById("error-dueDate").textContent = "تاريخ التسليم مطلوب.";
    isValid = false;
  }

  return isValid;
}

function handleFormSubmit(event) {
  event.preventDefault();

  const data = {
    name: document.getElementById("field-name").value,
    owner: document.getElementById("field-owner").value,
    description: document.getElementById("field-description").value,
    status: document.getElementById("field-status").value,
    priority: document.getElementById("field-priority").value,
    department: document.getElementById("field-department").value,
    progress: Number(document.getElementById("field-progress").value),
    dueDate: document.getElementById("field-dueDate").value
  };

  if (!validateForm(data)) return;

  if (editingProjectId === null) {
    dataService.addProject(data);
    showToast("تمت إضافة المشروع بنجاح.");
  } else {
    dataService.updateProject(editingProjectId, data);
    showToast("تم تحديث المشروع بنجاح.");
  }

  closeModal();
  refreshDashboard();
}

// ===== حذف مشروع =====
function openDeleteConfirm(id) {
  pendingDeleteId = id;
  confirmOverlay.classList.remove("hidden");
}

function closeDeleteConfirm() {
  pendingDeleteId = null;
  confirmOverlay.classList.add("hidden");
}

function handleConfirmDelete() {
  if (pendingDeleteId === null) return;
  dataService.deleteProject(pendingDeleteId);
  showToast("تم حذف المشروع.", "danger");
  closeDeleteConfirm();
  refreshDashboard();
}

// ===== ربط الأحداث =====
function bindEvents() {
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  addProjectBtn.addEventListener("click", () => {
    switchView("projects");
    openAddModal();
  });

  closeModalBtn.addEventListener("click", closeModal);
  cancelModalBtn.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  projectForm.addEventListener("submit", handleFormSubmit);

  cancelDeleteBtn.addEventListener("click", closeDeleteConfirm);
  confirmDeleteBtn.addEventListener("click", handleConfirmDelete);
  confirmOverlay.addEventListener("click", (e) => {
    if (e.target === confirmOverlay) closeDeleteConfirm();
  });

  projectsContainer.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const id = Number(btn.dataset.id);
    if (btn.dataset.action === "edit") openEditModal(id);
    if (btn.dataset.action === "delete") openDeleteConfirm(id);
  });

  managersContainer.addEventListener("click", (e) => {
    const card = e.target.closest(".manager-card");
    if (!card) return;

    const owner = card.dataset.owner;
    selectedManager = selectedManager === owner ? null : owner;
    renderManagers();
  });

  searchInput.addEventListener("input", renderProjects);
  statusFilter.addEventListener("change", renderProjects);
  priorityFilter.addEventListener("change", renderProjects);

  resetFiltersBtn.addEventListener("click", () => {
    searchInput.value = "";
    statusFilter.value = "";
    priorityFilter.value = "";
    renderProjects();
  });

  addDepartmentForm.addEventListener("submit", handleAddDepartment);
  themeToggleBtn.addEventListener("click", toggleTheme);

  refreshBtn.addEventListener("click", () => {
    refreshDashboard();
    showToast("تم تحديث البيانات.");
  });

  notifBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    notifDropdown.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!notifDropdown.classList.contains("hidden") && !notifDropdown.contains(e.target) && e.target !== notifBtn) {
      notifDropdown.classList.add("hidden");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!modalOverlay.classList.contains("hidden")) closeModal();
    if (!confirmOverlay.classList.contains("hidden")) closeDeleteConfirm();
    if (!notifDropdown.classList.contains("hidden")) notifDropdown.classList.add("hidden");
  });
}

// ===== تهيئة الصفحة =====
function initDashboard() {
  applyTheme(getPreferredTheme());
  renderTopbarDate();
  populateDepartmentSelect();
  bindEvents();
  refreshDashboard();
  loadServerDepartments(); // جديد
}

document.addEventListener("DOMContentLoaded", initDashboard);
