// dataService.js
// الملف الوحيد المسؤول عن التعامل مع بيانات المشاريع.
// أي جزء آخر من المشروع (مثل app.js) يجب أن يتعامل مع المشاريع
// عبر الدوال هنا فقط.
//
// لم يعد هذا الملف يتصل بـ localStorage أو Airtable مباشرة — بدل ذلك
// يتصل بخادم خلفي محلي بسيط (server.js) عبر مسارات /api/...، وهذا
// الخادم هو من يحمل توكن Airtable ويتصل به. المتصفح لا يرى التوكن أبدًا.
//
// كل الدوال هنا تحافظ على نفس الأسماء والشكل الذي اعتاد عليه app.js
// تمامًا (بدون تغيير أي استدعاء في app.js)، عبر الاحتفاظ بنسخة محلية
// في الذاكرة (_projects) تُحدَّث فور وصول الرد من الخادم.

const API_BASE = "/api";

const dataService = {
  _projects: [],

  // تحميل أولي غير متزامن (لأن أي اتصال بخادم حقيقي يستغرق وقتًا،
  // على عكس localStorage الفوري). بعد اكتماله يُعاد رسم اللوحة تلقائيًا
  // إن كانت دالة refreshDashboard معرّفة بالفعل في app.js.
  _initialLoad: (async () => {
    try {
      const res = await fetch(`${API_BASE}/projects`);
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || `فشل تحميل المشاريع (HTTP ${res.status})`);
      }
      dataService._projects = await res.json();
    } catch (error) {
      console.error("تعذّر تحميل المشاريع من الخادم:", error.message);
    }
    if (typeof refreshDashboard === "function") refreshDashboard();
  })(),

  // جلب جميع المشاريع (نسخة، لمنع التعديل المباشر من خارج الملف)
  getAllProjects() {
    return [...this._projects];
  },

  // جلب مشروع واحد عبر المعرّف
  getProjectById(id) {
    return this._projects.find((project) => project.id === id) || null;
  },

  // إضافة مشروع جديد — تحديث فوري محليًا (تفاؤلي)، ثم حفظ في الخلفية
  addProject(newProject) {
    const tempProject = { id: null, ...newProject };
    this._projects.push(tempProject);

    fetch(`${API_BASE}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newProject)
    })
      .then((res) => {
        if (!res.ok) throw new Error(`فشلت إضافة المشروع (HTTP ${res.status})`);
        return res.json();
      })
      .then((saved) => {
        Object.assign(tempProject, saved);
        if (typeof refreshDashboard === "function") refreshDashboard();
      })
      .catch((error) => console.error("تعذّر حفظ المشروع في الخادم:", error.message));

    return tempProject;
  },

  // تعديل مشروع موجود — تحديث فوري محليًا، ثم حفظ في الخلفية
  updateProject(id, updatedFields) {
    const project = this._projects.find((p) => p.id === id);
    if (!project) return null;

    Object.assign(project, updatedFields);

    fetch(`${API_BASE}/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedFields)
    }).catch((error) => console.error("تعذّر تحديث المشروع في الخادم:", error.message));

    return project;
  },

  // حذف مشروع — تحديث فوري محليًا، ثم حذف في الخلفية
  deleteProject(id) {
    const index = this._projects.findIndex((project) => project.id === id);
    if (index === -1) return false;

    this._projects.splice(index, 1);

    fetch(`${API_BASE}/projects/${id}`, { method: "DELETE" }).catch((error) =>
      console.error("تعذّر حذف المشروع من الخادم:", error.message)
    );

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
  },

  // ===== جاهزة للاستخدام المستقبلي — app.js لا يستدعيها بعد =====
  // (راجع ملاحظة "الإدارات والمسؤولون" في نهاية الرد)

  async getAllDepartments() {
    const res = await fetch(`${API_BASE}/departments`);
    if (!res.ok) throw new Error("فشل تحميل الإدارات من الخادم");
    return res.json();
  },

  async getAllOwners() {
    const res = await fetch(`${API_BASE}/owners`);
    if (!res.ok) throw new Error("فشل تحميل المسؤولين من الخادم");
    return res.json();
  },

  async addDepartment(name) {
    const res = await fetch(`${API_BASE}/departments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || "فشلت إضافة الإدارة");
    }
    return res.json();
  }
};
