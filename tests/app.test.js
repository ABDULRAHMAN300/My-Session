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

test("مراجعة الاختبار: موعد واحد لا يتكرّر ويُحتسب حصة في العدد والحساب والتقرير", async () => {
  const app = await loadApp();
  const { d, t, w } = app;
  const today = t.today();
  addLesson(app, { student: "أحمد", date: today, from: "10:00", dur: 60 });          // حصة عادية
  d.querySelector("[data-add]").click();
  d.querySelector('#f-kind [data-v="review"]').click();
  assert.equal(d.getElementById("f-rep").closest(".field").hidden, true, "التكرار مخفي للمراجعة");
  assert.equal(d.getElementById("sheettitle").textContent, "مراجعة اختبار جديدة");
  d.getElementById("f-student").value = "أحمد";
  d.getElementById("f-date").value = today;
  d.getElementById("f-from").value = "13:00";
  d.getElementById("f-save").click();
  const rev = t.lessons().find(l => l.kind === "review");
  assert.ok(rev && rev.rep.t === "none" && rev.student === "أحمد");

  d.querySelectorAll("[data-toggle]").forEach(b => b.click());                        // نفّذ الاثنتين
  assert.equal(t.lessons().filter(l => l.done).length, 2);
  t.setTab("pay"); w.render();
  const cnt = d.querySelector(".stu-card .cnt").textContent;
  assert.ok(cnt.includes("2") && cnt.includes("منها 1 مراجعة"), cnt);
  assert.equal(w.doneSplit("أحمد").rev, 1);
  t.setTab("stu"); w.render();
  assert.ok(d.querySelector(".stu-h .cnt").textContent.includes("منها 1 مراجعة"));
  t.setTab("stats"); w.render();
  assert.ok(d.querySelector(".tile .k").textContent.includes("منها 1 مراجعة"));
  assert.deepEqual(app.errors, []);
});

test("مراجعة الاختبار: لا يُعرض خيار النوع عند تعديل سلسلة متكرّرة (حتى لا تُحذف مواعيدها بصمت)", async () => {
  const app = await loadApp();
  const { d, t } = app;
  d.querySelector("[data-add]").click();
  d.getElementById("f-student").value = "سالم";
  d.getElementById("f-date").value = t.today();
  d.querySelector('#f-rep [data-v="weekly"]').click();
  d.getElementById("f-save").click();
  assert.equal(t.lessons()[0].rep.t, "weekly");
  d.querySelector("[data-edit]").click();
  assert.equal(d.getElementById("f-kind").closest(".field").hidden, true);
  d.getElementById("f-cancel").click();
  // حصة عادية غير متكرّرة: النوع متاح، والتحويل إلى مراجعة يحفظ kind دون المساس بالموعد
  addLesson(app, { student: "ليلى", date: t.today(), from: "20:00" });
  d.querySelector('[data-edit]:not([data-edit^="' + t.lessons()[0].id + '"])').click();
  assert.equal(d.getElementById("f-kind").closest(".field").hidden, false);
  d.querySelector('#f-kind [data-v="review"]').click();
  assert.equal(d.getElementById("sheettitle").textContent, "تعديل مراجعة");
  d.getElementById("f-save").click();
  assert.equal(t.lessons().find(l => l.student === "ليلى").kind, "review");
  assert.equal(t.lessons().length, 2);
});

test("زر «+ موعد مراجعة اختبار» في بطاقة الطالب يفتح النموذج جاهزًا من آخر حصة له", async () => {
  const app = await loadApp();
  const { d, t, w } = app;
  addLesson(app, { student: "سلمى", date: t.today(), from: "17:15", dur: 120 });
  t.setTab("stu"); w.render();
  d.querySelector('[data-rev="سلمى"]').click();
  assert.equal(d.getElementById("scrim").hidden, false);
  assert.equal(d.getElementById("f-student").value, "سلمى");
  assert.equal(d.querySelector('#f-kind [aria-pressed="true"]').dataset.v, "review");
  assert.equal(d.getElementById("f-from").value, "17:15");
  assert.equal(d.querySelector('#f-dur [aria-pressed="true"]').dataset.v, "120");
  d.getElementById("f-save").click();
  const rev = t.lessons().filter(l => l.kind === "review");
  assert.equal(rev.length, 1);
  assert.equal(rev[0].student, "سلمى");
  assert.ok(d.getElementById("main").innerHTML.includes("مراجعة اختبار"), "بطاقة الطالب تُظهر المراجعة القادمة");
  // الطالب المؤرشف لا يحمل الزر
  d.querySelector('[data-arch="سلمى"]').click();
  assert.equal(d.querySelector('[data-rev="سلمى"]'), null);
});

test("التراجع بعد الحذف: يعيد الحصة، ويسقط الزر عند أي تعديل لاحق", async () => {
  const app = await loadApp();
  const { d, t } = app;
  const bar = () => d.getElementById("undobar");
  assert.equal(bar().hidden, true);
  addLesson(app, { student: "ليلى", date: t.today() });
  d.querySelector("[data-edit]").click();
  d.getElementById("f-del").click();
  d.getElementById("c-ok").click();
  assert.equal(t.lessons().length, 0);
  assert.equal(bar().hidden, false);
  assert.ok(bar().textContent.includes("حُذفت الحصة"));
  d.getElementById("undo-btn").click();
  assert.equal(t.lessons().length, 1);
  assert.equal(t.lessons()[0].student, "ليلى");
  assert.equal(bar().hidden, true);

  // حذف ثم تعديل آخر قبل الضغط: يسقط الزر ولا يمكن إلغاء تعديل أحدث بالخطأ
  d.querySelector("[data-edit]").click();
  d.getElementById("f-del").click();
  d.getElementById("c-ok").click();
  assert.equal(bar().hidden, false);
  addLesson(app, { student: "جديد", date: t.today(), from: "21:00" });
  assert.equal(bar().hidden, true);
  assert.equal(t.lessons().length, 1);
  assert.deepEqual(app.errors, []);
});

test("التراجع يشمل الدفعات وحذف درس من الخطة والاستبدال الكامل", async () => {
  const app = await loadApp();
  const { d, t, w } = app;
  addLesson(app, { student: "أحمد", date: t.today() });

  // دفعة
  t.setTab("pay"); w.render();
  const card = d.querySelector(".stu-card");
  card.querySelector("[data-newpay]").value = "7.5";
  card.querySelector("[data-addpay]").click();
  d.querySelector("[data-delpay]").click();
  d.getElementById("c-ok").click();
  assert.equal(t.money().pays.length, 0);
  d.getElementById("undo-btn").click();
  assert.equal(t.money().pays.length, 1);
  assert.equal(t.money().paid["أحمد"], 7.5);

  // درس من الخطة (والخطة مفتوحة): يعود الدرس وحالته ويُعاد رسم النافذة
  t.setTab("prog"); w.render();
  d.querySelector("[data-plan]").click();
  d.getElementById("l-add").value = "درس تجريبي";
  d.getElementById("l-addbtn").click();
  const item = t.lib()["chem-10"].slice(-1)[0];
  d.querySelector(`[data-cyclestatus="${item.id}"]`).click();                // جاري الشرح
  assert.ok(t.prog()["أحمد"][item.id]);
  d.querySelector(`[data-pdel="${item.id}"]`).click();
  assert.equal(t.lib()["chem-10"].some(x => x.id === item.id), false);
  assert.equal(t.prog()["أحمد"][item.id], undefined);
  d.getElementById("undo-btn").click();
  assert.equal(t.lib()["chem-10"].some(x => x.id === item.id), true);
  assert.ok(t.prog()["أحمد"][item.id]);
  assert.ok(d.querySelector(`[data-pdel="${item.id}"]`), "قائمة الخطة المفتوحة أُعيد رسمها");
  d.getElementById("l-close").click();

  // الاسترجاع السحابي (بلا علامة undoable) لا يعرض «تراجع»: قد يكتب فوق نسخة جهاز آخر
  const cur = JSON.parse(w.backupBlob());
  w.doImport(cur, true);
  assert.equal(d.getElementById("undobar").hidden, true);
  w.doImport(cur, false);                                                   // الدمج لا يعرض «تراجع» أيضًا
  assert.equal(d.getElementById("undobar").hidden, true);
  w.doImport({ lessons: [], money: { due: {}, paid: {}, pays: [] } }, true, true);   // استيراد ملف بالاستبدال
  assert.equal(t.lessons().length, 0);
  assert.ok(d.getElementById("undobar").textContent.includes("استُبدلت"));
  d.getElementById("undo-btn").click();
  assert.equal(t.lessons().length, 1);
  assert.equal(t.money().paid["أحمد"], 7.5);
  assert.deepEqual(app.errors, []);
});

test("فحوص ثابتة: .num معزولة اتجاهيًا، ولا prompt() أصلي، وكتلة JS سليمة", () => {
  assert.match(INDEX, /\.num\{[^}]*direction:ltr[^}]*unicode-bidi:isolate/);
  const bad = INDEX.split("\n").filter(l => /\bprompt\(/.test(l) && !l.includes("/*") && !l.includes("//"));
  assert.deepEqual(bad, []);
});

test("مراجعة بمبلغ على الحساب: تُضاف إلى المستحق بعد تنفيذها فقط، وتبقى حصة في العدد", async () => {
  const app = await loadApp();
  const { d, t, w } = app;
  const today = t.today();
  d.querySelector("[data-add]").click();
  d.querySelector('#f-kind [data-v="review"]').click();
  assert.equal(d.getElementById("f-bill-field").hidden, false);
  assert.equal(d.getElementById("f-fee").hidden, true, "حقل المبلغ مخفي ما دام الاحتساب «ضمن الحصص»");
  d.querySelector('#f-bill [data-v="fee"]').click();
  assert.equal(d.getElementById("f-fee").hidden, false);
  d.getElementById("f-student").value = "ليلى";
  d.getElementById("f-date").value = today;
  d.getElementById("f-from").value = "13:00";
  d.getElementById("f-save").click();                                                  // بلا مبلغ: يرفض
  assert.equal(t.lessons().length, 0);
  assert.equal(d.getElementById("f-msg").hidden, false);
  d.getElementById("f-fee").value = "7.5";
  d.getElementById("f-save").click();
  const rev = t.lessons().find(l => l.student === "ليلى");
  assert.equal(rev.kind, "review");
  assert.equal(rev.bill, "fee");
  assert.equal(rev.fee, 7.5);

  t.setTab("pay"); w.render();
  assert.ok(!d.querySelector(".stu-card").textContent.includes("من مراجعات اختبار"), "غير منفَّذة: لا تدخل الحساب");
  t.setTab("cal"); w.render();
  d.querySelectorAll("[data-toggle]").forEach(b => b.click());                        // نفّذها
  t.setTab("pay"); w.render();
  const card = d.querySelector(".stu-card").textContent;
  assert.ok(card.includes("من مراجعات اختبار"), card);
  assert.ok(d.querySelector(".tile .v").textContent.includes("7.5"), d.querySelector(".tile .v").textContent);
  assert.equal(w.doneSplit("ليلى").rev, 1);
  assert.deepEqual(app.errors, []);
});

test("قفل التطبيق: تفعيل برمز، قفل، رمز خاطئ، فتح، تغيير وإيقاف", async () => {
  const app = await loadApp();
  const { d, t, w } = app;
  const key = (k) => d.querySelector(`#lk-pad [data-k="${k}"]`).click();
  const pin = (s) => [...s].forEach(key);
  const open = () => !d.getElementById("lock").hidden;
  assert.equal(open(), false, "بلا رمز: لا قفل");
  t.setTab("stats"); w.render();
  d.getElementById("pin-on").click();
  pin("1234");                                                  // الرمز
  pin("1111");                                                  // تأكيد مختلف: يبقى في الخطوة
  assert.ok(d.getElementById("lk-msg").textContent.includes("غير متطابقين"));
  pin("1234");
  assert.equal(open(), false);
  assert.ok(d.getElementById("pin-off"), "صار القفل مفعّلًا");
  const raw = d.defaultView.localStorage.getItem("hisas_pin_v1");
  assert.ok(raw && !raw.includes("1234"), "الرمز لا يُخزَّن نصًّا");

  d.getElementById("pin-now").click();
  assert.equal(open(), true);
  assert.equal(d.getElementById("main").closest("[inert]") !== null, true, "المحتوى خلف القفل معطّل");
  pin("0000");
  assert.equal(open(), true);
  assert.ok(d.getElementById("lk-msg").textContent.includes("غير صحيح"));
  pin("1234");
  assert.equal(open(), false);
  assert.equal(d.querySelectorAll("[inert]").length, 0);

  d.getElementById("pin-off").click();                          // الإيقاف يطلب الرمز أولًا
  assert.equal(open(), true);
  pin("1234");
  assert.ok(d.getElementById("pin-on"), "عاد القفل مُوقَفًا");
  assert.equal(d.defaultView.localStorage.getItem("hisas_pin_v1"), null);
  assert.deepEqual(app.errors, []);
});

test("مراجعة في يوم فيه حصة لنفس الطالب: تحلّ محلّها بلا تعارض، وحصة طالب آخر لا تُمسّ، و«تراجع» يعيدها", async () => {
  const app = await loadApp();
  const { d, t, w } = app;
  const today = t.today();
  const addReview = (student, from) => {
    d.querySelector("[data-add]").click();
    d.querySelector('#f-kind [data-v="review"]').click();
    d.getElementById("f-student").value = student;
    d.getElementById("f-date").value = today;
    d.getElementById("f-from").value = from;
    d.getElementById("f-save").click();
  };
  addLesson(app, { student: "أحمد", date: today, from: "16:00" });
  addLesson(app, { student: "سالم", date: today, from: "19:00" });
  addReview("أحمد", "16:30");                                   // كانا سيتعارضان لو بقيت الحصتان
  let ls = t.lessons();
  assert.equal(ls.filter(l => l.student === "أحمد").length, 1, "حصة أحمد العادية حُذفت");
  assert.equal(ls.find(l => l.student === "أحمد").kind, "review");
  assert.ok(ls.find(l => l.student === "سالم"), "حصة طالب آخر لم تُمسّ");
  assert.equal(t.clashSet(w.lessonsOn(today)).size, 0);
  d.getElementById("undo-btn").click();
  ls = t.lessons();
  assert.equal(ls.filter(l => l.student === "أحمد").length, 1);
  assert.equal(ls.find(l => l.student === "أحمد").kind || "normal", "normal", "التراجع أعاد الحصة العادية");
  assert.deepEqual(app.errors, []);
});

test("مراجعة فوق حصة متكرّرة: يُتخطّى ذلك اليوم فقط وتبقى السلسلة", async () => {
  const app = await loadApp();
  const { d, t, w } = app;
  const today = t.today();
  d.querySelector("[data-add]").click();
  d.getElementById("f-student").value = "ليلى";
  d.getElementById("f-date").value = today;
  d.getElementById("f-from").value = "16:00";
  d.querySelector('#f-rep [data-v="daily"]').click();
  d.getElementById("f-save").click();
  d.querySelector("[data-add]").click();
  d.querySelector('#f-kind [data-v="review"]').click();
  d.getElementById("f-student").value = "ليلى";
  d.getElementById("f-date").value = today;
  d.getElementById("f-from").value = "16:00";
  d.getElementById("f-save").click();
  const series = t.lessons().find(l => l.rep && l.rep.t === "daily");
  assert.ok(series, "السلسلة باقية");
  assert.deepEqual(plain(series.skip), [today]);
  const on = w.lessonsOn(today).filter(l => l.student === "ليلى");
  assert.equal(on.length, 1);
  assert.equal(on[0].kind, "review");
  assert.deepEqual(app.errors, []);
});

/* ===== تعديل وقت حصة متكرّرة: لهذا اليوم فقط أو لكل المواعيد ===== */
const dayAfter = (ds, n) => { const [y, m, d] = ds.split("-").map(Number); const x = new Date(y, m - 1, d + n); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
function addDaily(app, student, from = "16:00") {
  const { d, t } = app;
  d.querySelector("[data-add]").click();
  d.getElementById("f-student").value = student;
  d.getElementById("f-date").value = t.today();
  d.getElementById("f-from").value = from;
  d.querySelector('#f-rep [data-v="daily"]').click();
  d.getElementById("f-save").click();
}
function editTimeToday(app, newFrom) {
  const { d } = app;
  d.querySelector("[data-edit]").click();
  d.getElementById("f-from").value = newFrom;
  d.getElementById("f-save").click();
}

test("حصة متكرّرة: تغيير الوقت «لهذا اليوم فقط» لا يمسّ السلسلة ولا بقية الأيام", async () => {
  const app = await loadApp();
  const { d, t, w } = app;
  const today = t.today(), tomorrow = dayAfter(today, 1);
  addDaily(app, "ليلى");
  editTimeToday(app, "18:00");
  assert.equal(d.getElementById("cscrim").hidden, false, "يُسأل المستخدم عن نطاق التغيير");
  assert.equal(d.getElementById("c-ok").textContent, "هذا اليوم فقط");
  d.getElementById("c-ok").click();
  const s = t.lessons()[0];
  assert.equal(s.from, "16:00", "وقت السلسلة كما هو");
  assert.equal(s.to, "17:30");
  assert.deepEqual(plain(s.ov[today]), { from: "18:00", to: "19:30" });
  assert.equal(w.lessonsOn(today)[0].from, "18:00", "اليوم المعدَّل بوقته الجديد");
  assert.equal(w.lessonsOn(tomorrow)[0].from, "16:00", "الغد بوقت السلسلة");
  assert.ok(d.getElementById("main").innerHTML.includes("وقت خاص بهذا اليوم"), "شارة توضح أن الوقت خاص بهذا اليوم");
  assert.deepEqual(app.errors, []);
});

test("حصة متكرّرة: تغيير الوقت «لكل المواعيد» يغيّر السلسلة كلها", async () => {
  const app = await loadApp();
  const { d, t, w } = app;
  const today = t.today(), tomorrow = dayAfter(today, 1);
  addDaily(app, "ليلى");
  editTimeToday(app, "18:00");
  d.getElementById("c-ok2").click();
  const s = t.lessons()[0];
  assert.equal(s.from, "18:00");
  assert.equal(s.to, "19:30");
  assert.deepEqual(plain(s.ov), {});
  assert.equal(w.lessonsOn(tomorrow)[0].from, "18:00");
  assert.deepEqual(app.errors, []);
});

test("حصة متكرّرة: إلغاء سؤال النطاق يُبقي النموذج مفتوحًا ولا يحفظ شيئًا", async () => {
  const app = await loadApp();
  const { d, t } = app;
  addDaily(app, "ليلى");
  editTimeToday(app, "18:00");
  d.getElementById("c-no").click();
  assert.equal(d.getElementById("scrim").hidden, false, "نموذج التعديل ما زال مفتوحًا");
  assert.equal(d.getElementById("f-from").value, "18:00", "ما كتبته محفوظ في النموذج");
  assert.equal(t.lessons()[0].from, "16:00");
  assert.deepEqual(plain(t.lessons()[0].ov), {});
  assert.deepEqual(app.errors, []);
});

test("حصة متكرّرة: تعديل الملاحظة فقط في يوم بوقت خاص لا يكتب وقت اليوم فوق السلسلة", async () => {
  const app = await loadApp();
  const { d, t, w } = app;
  const today = t.today(), tomorrow = dayAfter(today, 1);
  addDaily(app, "ليلى");
  editTimeToday(app, "18:00");
  d.getElementById("c-ok").click();
  d.querySelector("[data-edit]").click();
  assert.equal(d.getElementById("f-from").value, "18:00", "النموذج يُملأ بوقت هذا اليوم الفعلي");
  d.getElementById("f-note").value = "ملاحظة";
  d.getElementById("f-save").click();
  assert.equal(d.getElementById("cscrim").hidden, true, "لا سؤال لأن الوقت لم يتغيّر");
  const s = t.lessons()[0];
  assert.equal(s.from, "16:00", "وقت السلسلة لم يتغيّر");
  assert.equal(s.note, "ملاحظة");
  assert.equal(w.lessonsOn(today)[0].from, "18:00");
  assert.equal(w.lessonsOn(tomorrow)[0].from, "16:00");
  assert.deepEqual(app.errors, []);
});

test("حصة متكرّرة: إرجاع الوقت إلى وقت السلسلة «لهذا اليوم» يزيل الوقت الخاص", async () => {
  const app = await loadApp();
  const { d, t, w } = app;
  const today = t.today();
  addDaily(app, "ليلى");
  editTimeToday(app, "18:00");
  d.getElementById("c-ok").click();
  editTimeToday(app, "16:00");
  d.getElementById("c-ok").click();
  assert.deepEqual(plain(t.lessons()[0].ov), {});
  assert.equal(w.lessonsOn(today)[0].from, "16:00");
  assert.deepEqual(app.errors, []);
});

test("حصة غير متكرّرة: تغيير الوقت يُحفظ مباشرة دون سؤال", async () => {
  const app = await loadApp();
  const { d, t } = app;
  addLesson(app, { student: "سالم", date: t.today(), from: "16:00" });
  editTimeToday(app, "19:00");
  assert.equal(d.getElementById("cscrim").hidden, true);
  assert.equal(t.lessons()[0].from, "19:00");
  assert.deepEqual(app.errors, []);
});

test("التعارض: الحصة الملغاة أو المؤجَّلة لا تُعارض حصة وُضعت في وقتها", async () => {
  const app = await loadApp();
  const mk = (id, from, st) => ({ id, from, to: from, date: "2026-09-20", _st: st || null });
  assert.equal(app.t.clashSet([mk("a", "16:00", "c"), mk("b", "16:00")]).size, 0, "ملغاة");
  assert.equal(app.t.clashSet([mk("a", "16:00", "p"), mk("b", "16:30")]).size, 0, "مؤجَّلة");
  assert.equal(app.t.clashSet([mk("a", "16:00"), mk("b", "16:30")]).size, 2, "حصتان فعليتان ما زالتا متعارضتين");
});

test("التعارض في الواجهة: إلغاء حصة ثم إضافة أخرى في وقتها لا يُظهر «تعارض»", async () => {
  const app = await loadApp();
  const { d, t, w } = app;
  const today = t.today();
  addLesson(app, { student: "أحمد", date: today, from: "16:00" });
  addLesson(app, { student: "سالم", date: today, from: "16:00" });
  assert.ok(d.getElementById("main").innerHTML.includes("تعارض"), "قبل الإلغاء: تعارض");
  const ls = t.lessons(), i = ls.findIndex(l => l.student === "أحمد");
  ls[i] = Object.assign({}, ls[i], { stat: { [today]: "c" } });
  w.render();
  const html = d.getElementById("main").innerHTML;
  assert.ok(!html.includes('class="pill clash"'), "لا شارة تعارض");
  assert.ok(!html.includes("موعدان متداخلان"), "لا تحذير تداخل");
  assert.deepEqual(app.errors, []);
});
