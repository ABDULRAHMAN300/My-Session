const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, addLesson, answerInput, sleep, closeAll } = require("./helpers");
test.after(closeAll);

const PUSH_WAIT = 2900; // أطول من مهلة التأجيل (2500ms)

test("رفع تلقائي عند الفتح وبعد كل تعديل (debounce) عبر hisas_backup_put", async () => {
  const app = await loadApp();
  await sleep(PUSH_WAIT);
  assert.ok(app.calls.some(c => c.fn === "hisas_backup_put"));
  assert.ok(app.cloud.has(app.t.deviceCode()));
  app.calls.length = 0;
  addLesson(app, { student: "زائر", date: "2026-10-01" });
  assert.equal(app.calls.filter(c => c.fn === "hisas_backup_put").length, 0, "لا رفع فوري");
  await sleep(PUSH_WAIT);
  assert.ok(app.cloud.get(app.t.deviceCode()).lessons.some(l => l.student === "زائر"));
});

test("الحارس: جهاز فارغ بنفس رمز نسخة غير فارغة لا يمسحها", async () => {
  const cloud = new Map();
  const app = await loadApp({ cloud });
  const code = app.t.deviceCode();
  cloud.set(code, { app: "hisas", lessons: [{ id: "x1", student: "قديم" }, { id: "x2", student: "قديم٢" }] });
  app.w.cloudPush();
  await sleep(PUSH_WAIT);
  assert.equal(cloud.get(code).lessons.length, 2, "النسخة السحابية لم تُمسح");
  assert.equal(app.calls.filter(c => c.fn === "hisas_backup_put").length, 0);
  assert.equal(app.d.getElementById("cloudbar").hidden, false);
  // استرجاع من الشريط
  app.d.getElementById("cloudbar-restore").click();
  await sleep(50);
  assert.equal(app.t.lessons().length, 2);
  assert.equal(app.d.getElementById("cloudbar").hidden, true);
});

test("اختيار عبارة موجودة سحابيًا يسأل ولا يكتب فوقها دون موافقة", async () => {
  const cloud = new Map([["عبارتي القديمة", { app: "hisas", lessons: [{ id: "k1", student: "محفوظ" }] }]]);
  const app = await loadApp({ cloud });
  const { d, t, w } = app;
  t.setTab("stats"); w.render();
  d.getElementById("cloud-custom").click();
  answerInput(app, "عبارتي القديمة");
  await sleep(80);
  assert.equal(d.getElementById("cscrim").hidden, false, "ظهر سؤال التأكيد");
  d.getElementById("c-no").click();
  await sleep(PUSH_WAIT);
  assert.equal(cloud.get("عبارتي القديمة").lessons.length, 1, "لم يُكتب فوقها");
  assert.notEqual(t.deviceCode(), "عبارتي القديمة", "الرمز لم يتغيّر");
  // الآن اختيار «الاسترجاع»
  d.getElementById("cloud-custom").click();
  answerInput(app, "عبارتي القديمة");
  await sleep(80);
  d.getElementById("c-ok").click();
  await sleep(80);
  assert.equal(t.lessons()[0].student, "محفوظ");
  assert.equal(t.deviceCode(), "عبارتي القديمة");
});

test("عبارة جديدة غير مستخدمة تُعتمد مباشرة وتُرفع بياناتك إليها", async () => {
  const app = await loadApp();
  const { d, t, w } = app;
  addLesson(app, { student: "أحمد", date: "2026-10-01" });
  t.setTab("stats"); w.render();
  d.getElementById("cloud-custom").click();
  answerInput(app, "قصير");              // قصيرة: تُرفض داخل النافذة
  assert.equal(d.getElementById("imsg").hidden, false);
  answerInput(app, "عبارة جديدة تمامًا");
  await sleep(80);
  assert.equal(t.deviceCode(), "عبارة جديدة تمامًا");
  await sleep(PUSH_WAIT);
  assert.equal(app.cloud.get("عبارة جديدة تمامًا").lessons.length, 1);
});

test("نسخ الأيام السابقة: عرض واسترجاع بتأكيد", async () => {
  const versions = new Map();
  const app = await loadApp({ versions });
  const code = app.t.deviceCode();
  versions.set(code, [
    { day: "2026-10-04", data: { app: "hisas", lessons: [{ id: "a", student: "أ" }, { id: "b", student: "ب" }] } },
    { day: "2026-10-03", data: { app: "hisas", lessons: [{ id: "a", student: "أ" }] } },
  ]);
  const { d, t, w } = app;
  t.setTab("stats"); w.render();
  d.getElementById("cloud-versions-btn").click();
  await sleep(60);
  const btns = d.querySelectorAll("[data-ver]");
  assert.equal(btns.length, 2);
  btns[0].click();
  assert.equal(d.getElementById("cscrim").hidden, false);
  d.getElementById("c-ok").click();
  await sleep(80);
  assert.equal(t.lessons().length, 2);
});

test("انقطاع الشبكة لا يكسر التطبيق", async () => {
  const app = await loadApp({ offline: true });
  addLesson(app, { student: "أحمد", date: "2026-10-01" });
  await sleep(PUSH_WAIT);
  assert.deepEqual(app.errors, []);
  assert.equal(app.t.lessons().length, 1);
});
