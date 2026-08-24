// dataService.localStorage.backup.js
// نسخة احتياطية من dataService.js كما كانت تعمل بالكامل مع localStorage
// (قبل ربطها بخادم Airtable الخلفي). محفوظة هنا فقط كمرجع/نسخة أمان —
// هذا الملف غير مستخدم في index.html حاليًا.
//
// للرجوع إلى النسخة المحلية القديمة: انسخ محتوى هذا الملف والصقه في
// dataService.js من جديد.

const STORAGE_KEY = "dashboard_projects";

function loadInitialProjects() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (error) {
      console.warn("تعذّرت قراءة بيانات localStorage، سيتم استخدام البيانات التجريبية.");
    }
  }
  return [...projectsData];
}

function persist(projects) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

const dataService = {
  _projects: loadInitialProjects(),

  // جلب جميع المشاريع (نسخة، لمنع التعديل المباشر من خارج الملف)
  getAllProjects() {
    return [...this._projects];
  },

  // جلب مشروع واحد عبر المعرّف
  getProjectById(id) {
    return this._projects.find((project) => project.id === id) || null;
  },

  // إضافة مشروع جديد
  addProject(newProject) {
    const nextId = this._projects.length
      ? Math.max(...this._projects.map((p) => p.id)) + 1
      : 1;

    const project = { id: nextId, ...newProject };
    this._projects.push(project);
    persist(this._projects);
    return project;
  },

  // تعديل مشروع موجود عبر المعرّف
  updateProject(id, updatedFields) {
    const project = this._projects.find((p) => p.id === id);
    if (!project) return null;

    Object.assign(project, updatedFields);
    persist(this._projects);
    return project;
  },

  // حذف مشروع عبر المعرّف
  deleteProject(id) {
    const index = this._projects.findIndex((project) => project.id === id);
    if (index === -1) return false;

    this._projects.splice(index, 1);
    persist(this._projects);
    return true;
  },

  // إحصائيات عامة محسوبة من كل المشاريع (بدون تأثر بالفلاتر)
  getStats() {
    const projects = this._projects;
    return {
      total: projects.length,
      active: projects.filter((p) => p.status === "نشط").length,
      completed: projects.filter((p) => p.status === "مكتمل").length,
      late: projects.filter((p) => p.status === "متأخر").length
    };
  },

  // بحث وفلترة مجتمعان (كل الشروط المرسلة تُطبَّق معًا)
  searchAndFilter({ query = "", status = "", priority = "" } = {}) {
    const normalizedQuery = query.trim();

    return this._projects.filter((project) => {
      const matchesQuery =
        !normalizedQuery ||
        project.name.includes(normalizedQuery) ||
        project.owner.includes(normalizedQuery);

      const matchesStatus = !status || project.status === status;
      const matchesPriority = !priority || project.priority === priority;

      return matchesQuery && matchesStatus && matchesPriority;
    });
  }
};
