const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { loadApp, addLesson, answerInput, closeAll } = require("./helpers");
test.after(closeAll);
const plain = (x) => JSON.parse(JSON.stringify(x));   // كائنات jsdom من «عالم» آخر؛ نقارن بالقيمة

const INDEX = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("مدة الحصة تُحسب تلقائيًا ولا يوجد حقل «إلى»", async () => {
  const app = await loadApp();
  const { d, t } = app;
  assert.equal(d.getElementById("f-to"), null);
  assert.ok(d.getElementById("f-dur"));
  addLesson(app, { student: "أحمد", date: "2026-09-20", from: "16:00", dur: 90 });
  addLesson(app, { student: "سالم", date: "2026-09-20", from: "18:00", dur: 60 });
  const [a, s] = [t.lessons().find(l => l.student === "أحمد"), t.lessons().find(l => l.student === "سالم")];
  assert.equal(a.to, "17:30");
  assert.equal(s.to, "19:00");
  assert.deepEqual(app.errors, []);
});

test("التعارض: أقل من ساعة بين البدايتين فقط", async () => {
  const app = await loadApp();
  const mk = (id, from) => ({ id, from, to: from, date: "2026-09-20" });
  assert.equal(app.t.clashSet([mk("a", "16:00"), mk("b", "16:59")]).size, 2);
  assert.equal(app.t.clashSet([mk("a", "16:00"), mk("b", "17:00")]).size, 0);
});

test("بحث الطلاب يصفّي القوائم ويحتفظ بالتركيز", async () => {
  const app = await loadApp();
  const { d, t, w } = app;
  addLesson(app, { student: "أحمد", date: "2026-09-20" });
  addLesson(app, { student: "سالم", date: "2026-09-20", from: "19:00" });
  t.setTab("stu"); w.render();
  const q = d.getElementById("q-search");
  q.value = "أحمد"; q.selectionStart = q.selectionEnd = 4; q.oninput();
  const html = d.getElementById("main").innerHTML;
  assert.ok(html.includes("أحمد") && !html.includes("سالم"));
  assert.equal(d.activeElement.id, "q-search");
});

test("الخطة: إعادة ترتيب + حالة ثلاثية + تعديل اسم، والقيم القديمة تُقرأ «مكتمل»", async () => {
  const app = await loadApp();
  const { d, t, w } = app;
  addLesson(app, { student: "أحمد", date: "2026-09-20" });
  t.setTab("prog"); w.render();
  d.querySelector("[data-plan]").click();
  d.getElementById("l-add").value = "درس 1\nدرس 2\nدرس 3";
  d.getElementById("l-addbtn").click();
  const arr = () => t.lib()["chem-10"];
  const [i1, , i3] = arr().slice(-3).map(x => x.id);
  d.querySelector(`[data-up="${i3}"]`).click();
  d.querySelector(`[data-up="${i3}"]`).click();
  assert.equal(arr().slice(-3)[0].id, i3);

  const cyc = () => d.querySelector(`[data-cyclestatus="${i1}"]`);
  assert.equal(cyc().textContent, "لم يبدأ");
  cyc().click(); assert.equal(cyc().textContent, "جاري الشرح");
  const date = t.prog()["أحمد"][i1].date;
  cyc().click(); assert.equal(cyc().textContent, "مكتمل");
  assert.equal(t.prog()["أحمد"][i1].date, date, "التاريخ يبقى عند الانتقال إلى مكتمل");
  cyc().click(); assert.equal(t.prog()["أحمد"][i1], undefined);

  d.querySelector(`[data-pedit="${i1}"]`).click();
  answerInput(app, "عنوان جديد");
  await new Promise(r => setTimeout(r, 0));
  assert.equal(arr().find(x => x.id === i1).t, "عنوان جديد");

  assert.deepEqual(plain(t.entryOf({ x: "2026-01-01" }, "x")), { date: "2026-01-01", status: "done" });
  assert.equal(t.entryOf({}, "x"), null);
});

test("إعادة تسمية الطالب عبر نافذة الإدخال تنقل بياناته", async () => {
  const app = await loadApp();
  const { d, t, w } = app;
  addLesson(app, { student: "ساره", date: "2026-09-20" });
  t.setTab("stu"); w.render();
  d.querySelector("[data-rename]").click();
  assert.equal(d.getElementById("iscrim").hidden, false);
  answerInput(app, "سارة");
  await new Promise(r => setTimeout(r, 0));
  assert.ok(t.lessons().every(l => l.student === "سارة"));
});

test("سجل الدفعات: إضافة وحذف بتأكيد", async () => {
  const app = await loadApp();
  const { d, t, w } = app;
  addLesson(app, { student: "أحمد", date: "2026-09-20" });
  t.setTab("pay"); w.render();
  const card = d.querySelector(".stu-card");
  card.querySelector("[data-newpay]").value = "7.5";
  card.querySelector("[data-addpay]").click();
  assert.equal(t.money().paid["أحمد"], 7.5);
  d.querySelector("[data-delpay]").click();
  assert.equal(d.getElementById("cscrim").hidden, false);
  d.getElementById("c-ok").click();
  assert.equal(t.money().pays.length, 0);
  assert.equal(t.money().paid["أحمد"], 0);
});

test("الاستيراد: دمج أو استبدال", async () => {
  const app = await loadApp();
  const { w, t } = app;
  addLesson(app, { student: "قديم", date: "2026-09-20" });
  const data = { lessons: [{ id: "i1", student: "جديد", grade: "10", subj: "chem", date: "2026-10-01", from: "10:00", to: "11:00", rep: { t: "none", d: [], until: "" }, doneOn: {}, skip: [], stat: {}, ts: 1 }], money: { due: {}, paid: {}, pays: [] } };
  w.doImport(data, false);
  assert.equal(t.lessons().length, 2);
  w.doImport(data, true);
  assert.deepEqual(t.lessons().map(l => l.id), ["i1"]);
});

test("الأرشفة: تُخفي من القوائم، تُرجَع، وحصة جديدة تُرجع الطالب", async () => {
  const app = await loadApp();
  const { d, t, w } = app;
  addLesson(app, { student: "أحمد", date: "2026-09-20" });
  addLesson(app, { student: "سالم", date: "2026-09-20", from: "19:00" });
  t.setTab("stu"); w.render();
  d.querySelector('[data-arch="أحمد"]').click();
  assert.equal(t.archived()["أحمد"], true);
  let html = d.getElementById("main").innerHTML;
  assert.ok(!html.includes('data-arch="أحمد"') && html.includes('data-arch="سالم"'));
  d.getElementById("arch-toggle").click();                      // عرض المؤرشفين
  html = d.getElementById("main").innerHTML;
  assert.ok(html.includes("مؤرشف"));
  d.querySelector('[data-arch="أحمد"]').click();                // إرجاع
  assert.equal(t.archived()["أحمد"], undefined);
  d.querySelector('[data-arch="أحمد"]').click();                // أرشفة ثانية
  t.setTab("cal"); w.render();
  addLesson(app, { student: "أحمد", date: "2026-09-21" });      // حصة جديدة
  assert.equal(t.archived()["أحمد"], undefined);
  assert.ok(JSON.parse(w.backupBlob()).archived !== undefined, "الأرشيف ضمن النسخة الاحتياطية");
});

test("تعبئة ذكية من آخر حصة للطالب", async () => {
  const app = await loadApp();
  const { d } = app;
  addLesson(app, { student: "سلمى", date: "2026-09-20", from: "18:15", dur: 120 });
  d.querySelector("[data-add]").click();
  const inp = d.getElementById("f-student");
  inp.value = "سلمى";
  inp.dispatchEvent(new app.w.Event("change"));
  assert.equal(d.getElementById("f-from").value, "18:15");
  assert.equal(d.querySelector('#f-dur [aria-pressed="true"]').dataset.v, "120");
  assert.equal(d.getElementById("f-hint").hidden, false);
  d.getElementById("f-cancel").click();
});

test("مدى التقويم مرن (بعد 2028 وقبل أقدم حصة)", async () => {
  const app = await loadApp();
  const y = new Date().getFullYear();
  assert.ok(app.t.maxM() >= (y + 3) * 12);
  assert.ok(app.t.maxM() > 2028 * 12 + 11 || y < 2026);
  assert.ok(app.t.minM() <= (y - 2) * 12);
});

test("تغيّر اليوم أثناء فتح التطبيق يُحدِّث التاريخ", async () => {
  const app = await loadApp();
  const real = app.t.today();
  app.t.setToday("2000-01-01");
  app.w.tick();
  assert.equal(app.t.today(), real);
});

test("فحوص ثابتة: .num معزولة اتجاهيًا، ولا prompt() أصلي، وكتلة JS سليمة", () => {
  assert.match(INDEX, /\.num\{[^}]*direction:ltr[^}]*unicode-bidi:isolate/);
  const bad = INDEX.split("\n").filter(l => /\bprompt\(/.test(l) && !l.includes("/*") && !l.includes("//"));
  assert.deepEqual(bad, []);
});
