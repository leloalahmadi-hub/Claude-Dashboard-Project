// server.js
// خادم خلفي بسيط (بدون أي مكتبات خارجية — Node.js فقط) مسؤول عن:
//   1) تقديم ملفات الواجهة (index.html وstyle.css وapp.js وdataService.js وdata.js).
//   2) الاتصال بـ Airtable نيابةً عن الواجهة عبر مسارات /api/...
//
// توكن Airtable وBase ID يُقرآن فقط من process.env (عبر .env.local)،
// ولا يُرسَلان أو يُطبَعان في أي استجابة أو رسالة Console يراها المتصفح.
// المتصفح لا يتحدث إلا مع هذا الخادم على localhost، ولا يعرف عن Airtable شيئًا.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// ===== تحميل .env.local يدويًا (بدون مكتبة dotenv) =====
function loadEnvFile() {
  const envPath = path.join(__dirname, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf-8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) return;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  });
}

loadEnvFile();

const PORT = process.env.PORT || 3000;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const PROJECTS_TABLE = "Projects";

function isConfigured() {
  return Boolean(AIRTABLE_BASE_ID && AIRTABLE_TOKEN);
}

// ===== أدوات Airtable =====
function airtableUrl(suffix = "") {
  return `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(PROJECTS_TABLE)}${suffix}`;
}

function airtableHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    "Content-Type": "application/json"
  };
}

async function airtableListAll() {
  let all = [];
  let offset;

  do {
    const url = new URL(airtableUrl());
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url, { headers: airtableHeaders() });
    if (!res.ok) throw new Error(`Airtable GET failed: ${res.status}`);

    const data = await res.json();
    all = all.concat(data.records);
    offset = data.offset;
  } while (offset);

  return all;
}

async function airtableCreate(fields) {
  const res = await fetch(airtableUrl(), {
    method: "POST",
    headers: airtableHeaders(),
    body: JSON.stringify({ fields })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Airtable create failed: ${res.status} — ${body}`);
  }
  return res.json();
}

async function airtableUpdate(recordId, fields) {
  const res = await fetch(airtableUrl(`/${recordId}`), {
    method: "PATCH",
    headers: airtableHeaders(),
    body: JSON.stringify({ fields })
  });
  if (!res.ok) throw new Error(`Airtable update failed: ${res.status}`);
  return res.json();
}

async function airtableDelete(recordId) {
  const res = await fetch(airtableUrl(`/${recordId}`), {
    method: "DELETE",
    headers: airtableHeaders()
  });
  if (!res.ok) throw new Error(`Airtable delete failed: ${res.status}`);
  return res.json();
}

async function findAirtableRecordId(numericId) {
  const records = await airtableListAll();
  const match = records.find((r) => r.fields.ID === numericId);
  return match ? match.id : null;
}

async function getDistinctFieldValues(fieldName) {
  const records = await airtableListAll();
  const values = new Set();
  records.forEach((r) => {
    const value = r.fields[fieldName];
    if (value) values.add(value);
  });
  return [...values];
}

// ===== تحويل بين شكل Airtable وشكل المشروع الذي تتوقعه الواجهة =====
function recordToProject(record) {
  const f = record.fields;
  return {
    id: typeof f.ID === "number" ? f.ID : null,
    name: f.Name || "",
    description: f.Description || "",
    owner: f.Owner || "",
    department: f.Department || "",
    status: f.Status || "",
    priority: f.Priority || "",
    progress: Math.round((f.Progress || 0) * 100),
    dueDate: f["Due Date"] || ""
  };
}

function projectToFields(project) {
  const fields = {};
  if (project.name !== undefined) fields.Name = project.name;
  if (project.description !== undefined) fields.Description = project.description;
  if (project.owner !== undefined) fields.Owner = project.owner;
  if (project.department !== undefined) fields.Department = project.department;
  if (project.status !== undefined) fields.Status = project.status;
  if (project.priority !== undefined) fields.Priority = project.priority;
  if (project.progress !== undefined) fields.Progress = Number(project.progress) / 100;
  if (project.dueDate !== undefined) fields["Due Date"] = project.dueDate;
  return fields;
}

// ===== أدوات HTTP صغيرة =====
function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(new Error("جسم الطلب ليس JSON صالحًا"));
      }
    });
    req.on("error", reject);
  });
}

// ===== تقديم ملفات الواجهة الثابتة =====
const STATIC_FILES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/style.css": "style.css",
  "/data.js": "data.js",
  "/dataService.js": "dataService.js",
  "/app.js": "app.js"
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8"
};

function serveStatic(req, res, pathname) {
  const fileName = STATIC_FILES[pathname];
  if (!fileName) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("الصفحة غير موجودة");
    return;
  }

  const filePath = path.join(__dirname, fileName);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("تعذّرت قراءة الملف");
      return;
    }
    const ext = path.extname(fileName);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}

// ===== الموجّه (Router) =====
async function handleApiRequest(req, res, pathname) {
  if (!isConfigured()) {
    return sendJson(res, 500, {
      error: "لم تُضبط بيانات الاتصال بعد. أضف AIRTABLE_BASE_ID وAIRTABLE_TOKEN داخل .env.local ثم أعد تشغيل الخادم."
    });
  }

  // GET /api/projects
  if (pathname === "/api/projects" && req.method === "GET") {
    const records = await airtableListAll();
    return sendJson(res, 200, records.map(recordToProject));
  }

  // POST /api/projects
  if (pathname === "/api/projects" && req.method === "POST") {
    const body = await readJsonBody(req);
    const created = await airtableCreate(projectToFields(body));
    return sendJson(res, 201, recordToProject(created));
  }

  const projectMatch = pathname.match(/^\/api\/projects\/(\d+)$/);

  // PUT /api/projects/:id
  if (projectMatch && req.method === "PUT") {
    const numericId = Number(projectMatch[1]);
    const recordId = await findAirtableRecordId(numericId);
    if (!recordId) return sendJson(res, 404, { error: "المشروع غير موجود." });

    const body = await readJsonBody(req);
    const updated = await airtableUpdate(recordId, projectToFields(body));
    return sendJson(res, 200, recordToProject(updated));
  }

  // DELETE /api/projects/:id
  if (projectMatch && req.method === "DELETE") {
    const numericId = Number(projectMatch[1]);
    const recordId = await findAirtableRecordId(numericId);
    if (!recordId) return sendJson(res, 404, { error: "المشروع غير موجود." });

    await airtableDelete(recordId);
    return sendJson(res, 200, { success: true });
  }

  // GET /api/departments — لا يوجد جدول Departments منفصل حاليًا،
  // فنستخرج القيم الفريدة من حقل Department داخل جدول Projects نفسه.
  if (pathname === "/api/departments" && req.method === "GET") {
    const values = await getDistinctFieldValues("Department");
    return sendJson(res, 200, values);
  }

  // POST /api/departments — غير مدعوم فعليًا بعد (راجع الملاحظة في نهاية الرد)
  if (pathname === "/api/departments" && req.method === "POST") {
    return sendJson(res, 501, {
      error:
        "لا يوجد جدول Departments منفصل في Airtable حاليًا. أضف الإدارة مباشرة عبر حقل Department داخل أي مشروع، أو أنشئ جدول Departments مستقلًا وأخبرني لأربطه."
    });
  }

  // GET /api/owners — نفس فكرة الإدارات، تُستخرج من حقل Owner
  if (pathname === "/api/owners" && req.method === "GET") {
    const values = await getDistinctFieldValues("Owner");
    return sendJson(res, 200, values);
  }

  return sendJson(res, 404, { error: "المسار غير موجود." });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname.startsWith("/api/")) {
    handleApiRequest(req, res, pathname).catch((error) => {
      console.error("خطأ أثناء التعامل مع Airtable:", error.message);
      sendJson(res, 500, { error: "حدث خطأ أثناء الاتصال بـ Airtable." });
    });
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`الخادم يعمل على: http://localhost:${PORT}`);
  if (!isConfigured()) {
    console.log("تنبيه: لم تُضف AIRTABLE_BASE_ID وAIRTABLE_TOKEN في .env.local بعد — أضفهما ثم أعد تشغيل الخادم (Ctrl+C ثم npm start).");
  } else {
    console.log("تم العثور على بيانات Airtable في .env.local — الاتصال جاهز.");
  }
});
