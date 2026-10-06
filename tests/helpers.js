/* أدوات الاختبار: تحميل التطبيق الحقيقي (index.html) داخل jsdom مع خادم سحابي وهمي في الذاكرة. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const open = [];            // كل النوافذ المفتوحة — تُغلق عند انتهاء الاختبارات كي لا تُبقي العملية حيّة (مؤقّتات التطبيق)
function closeAll() { while (open.length) { try { open.pop().close(); } catch (e) {} } }

/** يبني نسخة اختبار من الصفحة: يضمّن lib-default.js ويضيف خطّافًا يكشف الحالة الداخلية (let/const لا تظهر على window). */
function buildHtml() {
  let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const lib = fs.readFileSync(path.join(ROOT, "lib-default.js"), "utf8");
  html = html.replace('<script src="./lib-default.js"></script>', "<script>" + lib + "</script>");
  const hook = `<script>window.__t = {
    lessons:()=>lessons, money:()=>money, prog:()=>prog, lib:()=>lib, archived:()=>archived,
    today:()=>TODAY, setToday:v=>{TODAY=v;}, setTab:t=>{state.tab=t;},
    entryOf:(pr,id)=>entryOf(pr,id), progStat:n=>progStat(n),
    deviceCode:()=>deviceCode(), codeSaveNeeded:()=>codeSaveNeeded(), clashSet:l=>clashSet(l),
    minM:()=>minM(), maxM:()=>maxM()
  };</script></body>`;
  return html.replace("</body>", hook);
}

/** ينشئ تطبيقًا جديدًا. cloud = خادم وهمي (Map) يحاكي دوال Supabase. */
async function loadApp({ cloud = new Map(), versions = new Map(), offline = false } = {}) {
  const calls = [];
  const dom = new JSDOM(buildHtml(), {
    runScripts: "dangerously",
    url: "https://example.test/",
    pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
      w.HTMLElement.prototype.scrollIntoView = function () {};
      w.scrollTo = function () {};
      w.navigator.clipboard = { writeText: async () => {} };
      w.__shares = [];
      w.navigator.share = async (d) => { w.__shares.push(d); };
      w.fetch = async (url, opts) => {
        const fn = url.split("/rpc/")[1];
        const body = JSON.parse(opts.body);
        calls.push({ fn, body });
        if (offline) throw new Error("offline");
        const ok = (v) => ({ ok: true, text: async () => (v === undefined ? "" : JSON.stringify(v)) });
        if (fn === "hisas_backup_get") return ok(cloud.has(body.p_code) ? cloud.get(body.p_code) : null);
        if (fn === "hisas_backup_put" || fn === "hisas_backup_set") { cloud.set(body.p_code, body.p_data); return ok(); }
        if (fn === "hisas_backup_versions_list") {
          const list = (versions.get(body.p_code) || []).map(v => ({ day: v.day, lessons: (v.data.lessons || []).length }));
          return ok(list);
        }
        if (fn === "hisas_backup_version_get") {
          const v = (versions.get(body.p_code) || []).find(x => x.day === body.p_day);
          return ok(v ? v.data : null);
        }
        return { ok: false, status: 404, text: async () => "" };
      };
    },
  });
  const w = dom.window;
  open.push(w);
  const errors = [];
  w.onerror = (m) => errors.push(String(m));
  await waitFor(() => w.document.readyState === "complete" && w.__t, 5000);
  return { w, d: w.document, t: w.__t, calls, cloud, versions, errors, close: () => w.close() };
}

function waitFor(cond, ms = 3000) {
  return new Promise((res, rej) => {
    const t0 = Date.now();
    (function poll() {
      if (cond()) return res();
      if (Date.now() - t0 > ms) return rej(new Error("waitFor timeout"));
      setTimeout(poll, 15);
    })();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** يضيف حصة عبر النموذج الحقيقي (نفس ما يفعله المستخدم). */
function addLesson(app, { student, date, from = "16:00", dur }) {
  const { d } = app;
  d.querySelector("[data-add]").click();
  d.getElementById("f-student").value = student;
  d.getElementById("f-date").value = date;
  d.getElementById("f-from").value = from;
  if (dur) d.querySelector(`#f-dur [data-v="${dur}"]`).click();
  d.getElementById("f-save").click();
}

/** يجيب نافذة إدخال النص (askInput) بقيمة معيّنة، أو يُلغيها إن كانت null. */
function answerInput(app, value) {
  const { d } = app;
  if (value === null) { d.getElementById("i-no").click(); return; }
  d.getElementById("iinput").value = value;
  d.getElementById("i-ok").click();
}

module.exports = { loadApp, addLesson, answerInput, sleep, waitFor, closeAll };
