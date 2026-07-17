(() => {
    const root = document.getElementById("studyPlanRoot");
    const editButton = document.getElementById("editPlanSettings");
    const settingsDialog = document.getElementById("settingsDialog");
    const settingsDialogBody = document.getElementById("settingsDialogBody");
    const taskDialog = document.getElementById("taskDialog");
    const taskDialogBody = document.getElementById("taskDialogBody");
    const toast = document.getElementById("studyPlanToast");
    let plan = null;
    let analysis = null;
    let setupDraft = null;

    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    const titleCase = (value) => String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    const isoDay = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10); };
    const today = () => isoDay(new Date());
    const formatDay = (value) => new Date(value).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    const formatHours = (minutes) => minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;

    async function api(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            credentials: "include",
            headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
        });
        const text = await response.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch {}
        if (response.status === 401) {
            location.replace(`/login?redirect=${encodeURIComponent(location.pathname)}`);
            throw new Error("Please sign in to continue.");
        }
        if (response.status === 403 && data.code === "PREMIUM_REQUIRED") {
            location.reload();
            throw new Error(data.message);
        }
        if (!response.ok) {
            const error = new Error(data.error || data.message || "Request failed.");
            error.status = response.status;
            error.retryAfterSeconds = Number(data.retryAfterSeconds || response.headers.get("Retry-After") || 0);
            throw error;
        }
        return data;
    }

    function showToast(message) {
        toast.textContent = message;
        toast.hidden = false;
        clearTimeout(showToast.timer);
        showToast.timer = setTimeout(() => { toast.hidden = true; }, 3200);
    }

    function loading() {
        root.innerHTML = `<section class="study-plan-loading" aria-busy="true"><div class="loading-orbit" aria-hidden="true"></div><h2>Creating your personalized Study Plan...</h2><ol><li>Analysing your performance</li><li>Identifying weak skills</li><li>Building your weekly schedule</li><li>Preparing daily tasks</li></ol></section>`;
    }

    function errorState(message) {
        root.innerHTML = `<section class="card error-state"><div class="empty-icon">!</div><h2>We could not generate your Study Plan.</h2><p>${escapeHtml(message)}</p><div class="inline-actions"><button class="button button--secondary" id="editAfterError" type="button">Edit Settings</button><button class="button button--primary" id="tryAgain" type="button">Try Again</button></div></section>`;
        document.getElementById("editAfterError")?.addEventListener("click", () => renderSetup(setupDraft || plan?.settings || {}));
        document.getElementById("tryAgain")?.addEventListener("click", () => setupDraft ? submitSettings(setupDraft) : load());
    }

    const bandOptions = () => Array.from({ length: 11 }, (_, index) => (4 + index * .5).toFixed(1)).map((band) => `<option value="${band}">${band}</option>`).join("");
    const choice = (name, value, label, checked = false, type = "radio", description = "") => `<label class="choice ${description ? "choice--description" : ""}"><input type="${type}" name="${name}" value="${value}" ${checked ? "checked" : ""}><span>${description ? `<strong>${escapeHtml(label)}</strong><em>${escapeHtml(description)}</em>` : escapeHtml(label)}</span></label>`;

    function settingsForm(values = {}, compact = false) {
        const estimated = analysis?.estimatedBands?.overall || 0;
        const current = Number(values.currentBand || (estimated >= 4 ? estimated : 6));
        const target = Number(values.targetBand || Math.min(9, current + 1));
        const noExamDate = values.noExamDate !== false && !values.examDate;
        const priorities = values.prioritySkills || [];
        const currentMin = today();
        return `<form id="studyPlanSettingsForm">
            <div class="setup-grid">
                <section class="form-section"><h3>Score goal</h3>
                    <label class="field"><span>Current estimated overall band</span><select name="currentBand">${bandOptions()}</select>${estimated ? `<small>Estimated from your recent IELTSX results. You can change it.</small>` : ""}</label>
                    <label class="field"><span>Target overall band</span><select name="targetBand">${bandOptions()}</select><small class="field-error" id="targetBandError" hidden>Target band must be higher than your current band.</small></label>
                </section>
                <section class="form-section"><h3>Exam timeline</h3>
                    <label class="field"><span>When is your IELTS exam?</span><input type="date" name="examDate" min="${currentMin}" value="${escapeHtml(values.examDate ? isoDay(values.examDate) : "")}" ${noExamDate ? "disabled" : ""}></label>
                    <label class="choice"><input type="checkbox" name="noExamDate" ${noExamDate ? "checked" : ""}><span>I have not booked my exam yet</span></label>
                    <label class="field" data-preparation-period ${noExamDate ? "" : "hidden"}><span>Approximate preparation period</span><select name="preparationPeriod"><option value="2_weeks">2 weeks</option><option value="1_month">1 month</option><option value="2_months">2 months</option><option value="3_months">3 months</option><option value="6_months">6 months</option></select></label>
                </section>
                <section class="form-section"><h3>Available study time</h3>
                    <div class="field"><span>How much time can you study each day?</span><div class="choice-grid">${[[30,"30 minutes"],[60,"1 hour"],[120,"2 hours"],[180,"3 hours"],[240,"4 hours"],[300,"5+ hours"]].map(([value,label]) => choice("dailyMinutes", value, label, Number(values.dailyMinutes || 60) === value)).join("")}</div></div>
                    <div class="field"><span>How many days per week can you study?</span><div class="choice-grid">${[3,4,5,6,7].map((value) => choice("studyDaysPerWeek", value, `${value} days`, Number(values.studyDaysPerWeek || 5) === value)).join("")}</div></div>
                </section>
                <section class="form-section"><h3>Preferred study time</h3><div class="choice-grid choice-grid--four">${["morning","afternoon","evening","flexible"].map((value) => choice("preferredStudyTime", value, titleCase(value), (values.preferredStudyTime || "flexible") === value)).join("")}</div></section>
                <section class="form-section form-section--wide"><h3>Skill priorities</h3><div class="choice-grid choice-grid--four">${["listening","reading","writing","speaking"].map((value) => choice("prioritySkills", value, titleCase(value), priorities.includes(value), "checkbox")).join("")}</div><small>${analysis?.hasEnoughData ? "Weak skills detected from your IELTSX history are preselected when useful. Add any other priorities." : "Select any skills you especially want to improve."}</small></section>
                <section class="form-section form-section--wide"><h3>Study intensity</h3><div class="choice-grid">${[
                    ["balanced","Balanced","Steady progress with a manageable workload."],
                    ["intensive","Intensive","Faster progress with longer and more demanding sessions."],
                    ["light","Light","A lighter plan for users with limited time."]
                ].map(([value,label,description]) => choice("intensity", value, label, (values.intensity || "balanced") === value, "radio", description)).join("")}</div></section>
            </div>
            <div class="${compact ? "inline-actions settings-actions" : "setup-actions"}">${compact ? '<button class="button button--danger settings-delete" type="button" data-delete-plan>Delete Study Plan</button><button class="button button--secondary" type="button" data-close-dialog>Cancel</button>' : ""}<button class="button button--primary" type="submit">${compact ? "Save and Rebalance" : "Generate My Study Plan"}</button></div>
        </form>`;
    }

    function hydrateSettingsForm(form, values = {}) {
        const estimated = analysis?.estimatedBands?.overall || 0;
        form.elements.currentBand.value = Number(values.currentBand || (estimated >= 4 ? estimated : 6)).toFixed(1);
        form.elements.targetBand.value = Number(values.targetBand || Math.min(9, Number(form.elements.currentBand.value) + 1)).toFixed(1);
        form.elements.preparationPeriod.value = values.preparationPeriod || "2_months";
        const toggle = () => {
            const checked = form.elements.noExamDate.checked;
            form.elements.examDate.disabled = checked;
            form.querySelector("[data-preparation-period]").hidden = !checked;
            if (checked) form.elements.examDate.value = "";
        };
        form.elements.noExamDate.addEventListener("change", toggle);
        form.elements.currentBand.addEventListener("change", () => validateTarget(form));
        form.elements.targetBand.addEventListener("change", () => validateTarget(form));
        form.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => settingsDialog.close()));
        toggle();
    }

    function validateTarget(form) {
        const invalid = Number(form.elements.targetBand.value) <= Number(form.elements.currentBand.value);
        form.querySelector("#targetBandError").hidden = !invalid;
        return !invalid;
    }

    function formData(form) {
        const data = new FormData(form);
        return {
            currentBand: Number(data.get("currentBand")), targetBand: Number(data.get("targetBand")), examDate: data.get("examDate") || null,
            noExamDate: form.elements.noExamDate.checked, preparationPeriod: data.get("preparationPeriod") || "", dailyMinutes: Number(data.get("dailyMinutes")),
            studyDaysPerWeek: Number(data.get("studyDaysPerWeek")), preferredStudyTime: data.get("preferredStudyTime"), intensity: data.get("intensity"),
            prioritySkills: data.getAll("prioritySkills")
        };
    }

    function renderSetup(values = {}) {
        editButton.hidden = true;
        const notice = !analysis?.hasEnoughData ? `<p class="data-notice">We need more IELTSX performance data to identify your exact weaknesses. Your first plan will be based on the level and goals you selected.</p>` : "";
        root.innerHTML = `<section class="card setup-shell"><div class="setup-heading"><div class="setup-icon"><img src="/premium-icons/study-plan.png?v=20260717" alt=""></div><div><span class="study-plan-eyebrow">PERSONALIZE YOUR PLAN</span><h2>Create a plan that fits your goal</h2><p>Tell us when and how you can study. IELTSX will combine these settings with your real performance data.</p></div></div>${notice}${settingsForm(values)}</section>`;
        const form = document.getElementById("studyPlanSettingsForm");
        hydrateSettingsForm(form, values);
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            if (!validateTarget(form)) return;
            setupDraft = formData(form);
            submitSettings(setupDraft);
        });
    }

    async function submitSettings(settings) {
        loading();
        try {
            const data = await api("/api/study-plan/generate", { method: "POST", body: JSON.stringify(settings) });
            plan = data.plan;
            renderPlan();
            showToast("Your personalized Study Plan is ready.");
        } catch (error) { errorState(error.message); }
    }

    function allTasks() { return (plan?.weeks || []).flatMap((week) => week.tasks || []); }

    function taskCard(task) {
        const complete = task.status === "completed";
        return `<article class="task-card ${complete ? "is-completed" : ""}">
            <button class="task-check" type="button" data-task-complete="${task.id}" aria-label="${complete ? "Mark pending" : "Mark complete"}">${complete ? "✓" : ""}</button>
            <div class="task-body"><div class="task-title"><strong>${escapeHtml(task.title)}</strong><span class="pill pill--${escapeHtml(task.priority)}">${escapeHtml(task.priority)}</span>${complete ? '<span class="pill pill--completed">completed</span>' : ""}</div><p>${escapeHtml(task.description)}</p><div class="task-meta"><span>${titleCase(task.skill)}</span><span>•</span><span>${task.durationMinutes} min</span></div></div>
            <div class="task-actions">${!complete ? `<a href="${escapeHtml(task.route)}">Start</a>` : ""}${task.status === "missed" ? `<button type="button" data-reschedule="${task.id}">Reschedule</button>` : ""}</div>
        </article>`;
    }

    function renderDay(date, tasks) {
        const total = tasks.reduce((sum, task) => sum + Number(task.durationMinutes || 0), 0);
        const completed = tasks.filter((task) => task.status === "completed").length;
        return `<details class="day-card" ${isoDay(date) === today() ? "open" : ""}><summary><strong>${formatDay(date)}</strong><span>${formatHours(total)} • ${completed}/${tasks.length} complete</span></summary><div class="task-list">${tasks.map(taskCard).join("")}</div></details>`;
    }

    function missedSection(tasks) {
        if (!tasks.length) return "";
        return `<section class="card catch-up-card"><div class="section-heading"><div><h2>Catch-up</h2><p>Missed tasks stay here until you complete, reschedule, or skip them.</p></div></div><div class="catch-up-list">${tasks.map((task) => `<article class="catch-up-item"><strong>${escapeHtml(task.title)}</strong><p>${formatDay(task.originalDate || task.date)} • ${task.durationMinutes} min</p><div class="catch-up-actions"><button data-task-action="complete" data-task-id="${task.id}">Mark complete</button><button data-reschedule="${task.id}">Reschedule</button><button data-skip="${task.id}">Skip</button></div></article>`).join("")}</div></section>`;
    }

    function weeklyReview(week) {
        const checkpoint = week.checkpoint;
        if (!checkpoint) return `<section class="card weekly-review"><span class="study-plan-eyebrow">WEEKLY CHECKPOINT</span><h3>Weekly Review</h3><p>Generate a review when you reach the end of this week. It uses completed tasks and the latest real test results.</p><button class="button button--secondary" type="button" data-checkpoint="${week.weekNumber}">Create Weekly Review</button></section>`;
        return `<section class="card weekly-review"><span class="study-plan-eyebrow">WEEKLY REVIEW</span><h3>Week ${week.weekNumber} checkpoint</h3><div class="weekly-review-grid"><div><span>TASKS COMPLETED</span><strong>${checkpoint.completedTasks}/${checkpoint.totalTasks}</strong></div><div><span>STUDY TIME</span><strong>${formatHours(checkpoint.completedMinutes)}</strong></div><div><span>MAIN WEAKNESS</span><strong>${escapeHtml(checkpoint.mainWeakness)}</strong></div></div><p>${escapeHtml(checkpoint.nextRecommendation)}</p><button class="button button--primary" type="button" data-next-week="${week.weekNumber}">Generate Next Week</button></section>`;
    }

    function renderPlan() {
        if (!plan) return renderSetup();
        editButton.hidden = false;
        const tasks = allTasks();
        const stats = plan.stats || {};
        const currentWeek = plan.weeks?.[plan.weeks.length - 1] || { tasks: [] };
        const visibleTasks = (currentWeek.tasks || []).filter((task) => !["missed", "skipped"].includes(task.status));
        const grouped = Object.entries(visibleTasks.reduce((days, task) => { (days[isoDay(task.date)] ||= []).push(task); return days; }, {})).sort(([a], [b]) => a.localeCompare(b));
        const todayTasks = tasks.filter((task) => isoDay(task.date) === today() && !["skipped", "missed"].includes(task.status));
        const todayTotal = todayTasks.reduce((sum, task) => sum + task.durationMinutes, 0);
        const todayCompleted = todayTasks.filter((task) => task.status === "completed").reduce((sum, task) => sum + task.durationMinutes, 0);
        const firstIncomplete = todayTasks.find((task) => task.status === "pending") || tasks.find((task) => task.status === "pending");
        const missed = tasks.filter((task) => task.status === "missed");
        const allocation = plan.priorities || [];
        const plannedMinutes = (currentWeek.tasks || []).reduce((sum, task) => sum + Number(task.durationMinutes || 0), 0);
        const mockTask = (currentWeek.tasks || []).find((task) => task.skill === "mock");
        root.innerHTML = `${plan.adaptationRecommended ? `<section class="card adapt-card"><strong>Your recent performance has changed. We recommend updating your Study Plan.</strong><p>${escapeHtml(plan.adaptationReason || "The latest IELTSX results can improve your remaining schedule.")}</p><div class="adapt-actions"><button class="button button--primary" data-adapt type="button">Update Plan</button><button class="button button--secondary" data-keep-plan type="button">Keep Current Plan</button></div></section>` : ""}
        ${plan.dataNotice ? `<p class="data-notice">${escapeHtml(plan.dataNotice)}</p>` : ""}
        <div class="plan-layout"><div class="plan-main">
            <section class="card today-card"><div class="today-top"><div><span class="study-plan-eyebrow" style="color:#b9c9ff">TODAY’S PLAN</span><h2>${todayTasks.length ? "Ready when you are" : "No tasks scheduled today"}</h2><p>${escapeHtml(plan.summary)}</p></div>${firstIncomplete ? `<a class="button" href="${escapeHtml(firstIncomplete.route)}">Start Today’s Plan →</a>` : ""}</div><div class="today-stats"><div class="today-stat"><strong>${formatHours(todayTotal)}</strong><span>TOTAL PLANNED</span></div><div class="today-stat"><strong>${formatHours(todayCompleted)}</strong><span>COMPLETED</span></div><div class="today-stat"><strong>${todayTasks.filter((task) => task.status !== "completed").length}</strong><span>REMAINING TASKS</span></div><div class="today-stat"><strong>${stats.streak || 0} days</strong><span>CURRENT STREAK</span></div></div><div class="progress-track"><span style="width:${todayTotal ? Math.round(todayCompleted / todayTotal * 100) : 0}%"></span></div></section>
            <section class="card week-card"><div class="section-heading"><div><span class="study-plan-eyebrow">THIS WEEK</span><h2>Week ${currentWeek.weekNumber || 1}</h2><p>${escapeHtml(currentWeek.objective || "Your weekly IELTS plan")}</p></div><strong>${stats.completionRate || 0}%</strong></div><div class="progress-track"><span style="width:${stats.completionRate || 0}%"></span></div><div class="day-list">${grouped.length ? grouped.map(([date, dayTasks]) => renderDay(date, dayTasks)).join("") : '<p class="data-notice">No remaining tasks are scheduled for this week.</p>'}</div></section>
            ${missedSection(missed)}${weeklyReview(currentWeek)}
        </div><aside class="plan-side">
            <section class="card side-card"><h3>Current estimated level</h3><div class="band-summary">${["listening","reading","writing","speaking"].map((skill) => `<div class="band-box"><span>${skill}</span><strong>${Number(plan.estimatedBands?.[skill] || 0).toFixed(1)}</strong></div>`).join("")}<div class="band-box band-box--overall"><span>Overall → Target ${Number(plan.settings.targetBand).toFixed(1)}</span><strong>${Number(plan.estimatedBands?.overall || plan.settings.currentBand).toFixed(1)}</strong></div></div></section>
            <section class="card side-card"><h3>Main priorities</h3><div class="priority-list">${(plan.weaknesses || []).map((item, index) => `<div class="priority-item"><span class="priority-number">${index + 1}</span><div><strong>${escapeHtml(item.skill)} ${escapeHtml(item.category)}</strong><p>${escapeHtml(item.reason)}</p></div></div>`).join("")}</div></section>
            <section class="card side-card"><h3>Skill allocation</h3><div class="allocation-list">${allocation.map((item) => `<div class="allocation-row"><div class="allocation-label"><span>${escapeHtml(item.skill)}</span><strong>${item.percentage}%</strong></div><div class="mini-track"><span style="width:${item.percentage}%"></span></div></div>`).join("")}</div></section>
            <section class="card side-card"><h3>Progress</h3><div class="stats-list"><div class="stats-row"><span>Days remaining</span><strong>${stats.daysRemaining ?? "—"}</strong></div><div class="stats-row"><span>Completed study hours</span><strong>${formatHours(stats.completedMinutes || 0)}</strong></div><div class="stats-row"><span>Weekly completion</span><strong>${stats.completionRate || 0}%</strong></div><div class="stats-row"><span>Total planned</span><strong>${formatHours(plannedMinutes)}</strong></div><div class="stats-row"><span>Mock checkpoint</span><strong>${mockTask ? formatDay(mockTask.date) : "Not scheduled"}</strong></div></div></section>
        </aside></div>`;
        bindPlanActions();
    }

    async function updateTask(taskId, action, extra = {}) {
        try {
            const data = await api(`/api/study-plan/tasks/${encodeURIComponent(taskId)}`, { method: "PATCH", body: JSON.stringify({ action, ...extra }) });
            plan = data.plan; renderPlan(); showToast("Study Plan task updated.");
        } catch (error) { showToast(error.message); }
    }

    function openTaskDialog(taskId, mode) {
        const task = allTasks().find((item) => item.id === taskId);
        if (!task) return;
        document.getElementById("taskDialogTitle").textContent = mode === "reschedule" ? "Reschedule task" : "Skip task";
        if (mode === "reschedule") {
            taskDialogBody.innerHTML = `<form id="rescheduleForm"><label class="field"><span>Choose a new date</span><input name="date" type="date" min="${today()}" required></label><p class="data-notice">IELTSX will prevent this task from overloading a day beyond your selected availability.</p><div class="inline-actions"><button class="button button--secondary" type="button" data-close-task-dialog>Cancel</button><button class="button button--primary" type="submit">Reschedule</button></div></form>`;
            taskDialogBody.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); taskDialog.close(); updateTask(taskId, "reschedule", { date: new FormData(event.target).get("date") }); });
        } else {
            taskDialogBody.innerHTML = `<form id="skipForm"><label class="field"><span>Why are you skipping this task?</span><select name="reason"><option>Not enough time</option><option>Too difficult</option><option>Already practised elsewhere</option><option>Not relevant</option><option>Other</option></select></label><div class="inline-actions"><button class="button button--secondary" type="button" data-close-task-dialog>Cancel</button><button class="button button--danger" type="submit">Skip Task</button></div></form>`;
            taskDialogBody.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); taskDialog.close(); updateTask(taskId, "skip", { reason: new FormData(event.target).get("reason") }); });
        }
        taskDialogBody.querySelectorAll("[data-close-task-dialog]").forEach((button) => button.addEventListener("click", () => taskDialog.close()));
        taskDialog.showModal();
    }

    function confirmDeletePlan() {
        settingsDialog.close();
        document.getElementById("taskDialogTitle").textContent = "Delete Study Plan?";
        taskDialogBody.innerHTML = `<p class="delete-plan-message">This permanently deletes your Study Plan, settings, weekly schedule, and task history. Your IELTSX test results will not be deleted.</p><div class="inline-actions"><button class="button button--secondary" type="button" data-close-task-dialog>Keep Plan</button><button class="button button--danger" type="button" data-confirm-delete-plan>Delete Study Plan</button></div>`;
        taskDialogBody.querySelector("[data-close-task-dialog]").addEventListener("click", () => taskDialog.close());
        taskDialogBody.querySelector("[data-confirm-delete-plan]").addEventListener("click", deletePlan);
        taskDialog.showModal();
    }

    async function deletePlan(event) {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = "Deleting...";
        try {
            await api("/api/study-plan", { method: "DELETE" });
            taskDialog.close();
            plan = null;
            setupDraft = null;
            renderSetup({
                currentBand: analysis?.estimatedBands?.overall >= 4 ? analysis.estimatedBands.overall : 6,
                prioritySkills: (analysis?.repeatedMistakes || []).slice(0, 2).map((item) => item.skill)
            });
            showToast("Your Study Plan was deleted.");
        } catch (error) {
            button.disabled = false;
            button.textContent = "Delete Study Plan";
            showToast(error.message);
        }
    }

    function bindPlanActions() {
        root.querySelectorAll("[data-task-complete]").forEach((button) => button.addEventListener("click", () => {
            const task = allTasks().find((item) => item.id === button.dataset.taskComplete);
            updateTask(button.dataset.taskComplete, task?.status === "completed" ? "pending" : "complete");
        }));
        root.querySelectorAll("[data-task-action]").forEach((button) => button.addEventListener("click", () => updateTask(button.dataset.taskId, button.dataset.taskAction)));
        root.querySelectorAll("[data-reschedule]").forEach((button) => button.addEventListener("click", () => openTaskDialog(button.dataset.reschedule, "reschedule")));
        root.querySelectorAll("[data-skip]").forEach((button) => button.addEventListener("click", () => openTaskDialog(button.dataset.skip, "skip")));
        root.querySelector("[data-adapt]")?.addEventListener("click", () => adapt(false));
        root.querySelector("[data-keep-plan]")?.addEventListener("click", () => adapt(true));
        root.querySelectorAll("[data-checkpoint]").forEach((button) => button.addEventListener("click", () => checkpoint(button.dataset.checkpoint, false)));
        root.querySelectorAll("[data-next-week]").forEach((button) => button.addEventListener("click", () => checkpoint(button.dataset.nextWeek, true)));
    }

    async function adapt(keepCurrent) {
        loading();
        try { const data = await api("/api/study-plan/adapt", { method: "POST", body: JSON.stringify({ keepCurrent }) }); plan = data.plan; renderPlan(); showToast(keepCurrent ? "Current plan kept." : "Study Plan updated from your latest performance."); }
        catch (error) { errorState(error.message); }
    }

    async function checkpoint(weekNumber, generateNextWeek) {
        try { const data = await api("/api/study-plan/weekly-checkpoint", { method: "POST", body: JSON.stringify({ weekNumber: Number(weekNumber), generateNextWeek }) }); plan = data.plan; renderPlan(); showToast(generateNextWeek ? "Your next week is ready." : "Weekly checkpoint created."); }
        catch (error) { showToast(error.message); }
    }

    function openSettings() {
        settingsDialogBody.innerHTML = settingsForm(plan.settings, true);
        const form = settingsDialogBody.querySelector("form");
        hydrateSettingsForm(form, plan.settings);
        form.querySelector("[data-delete-plan]")?.addEventListener("click", confirmDeletePlan);
        form.addEventListener("submit", async (event) => {
            event.preventDefault(); if (!validateTarget(form)) return;
            const button = form.querySelector("[type=submit]"); button.disabled = true;
            try { const data = await api("/api/study-plan/settings", { method: "PATCH", body: JSON.stringify(formData(form)) }); plan = data.plan; settingsDialog.close(); renderPlan(); showToast(data.message); }
            catch (error) { showToast(error.message); button.disabled = false; }
        });
        settingsDialog.showModal();
    }

    async function load() {
        try {
            const [planData, analysisData] = await Promise.all([api("/api/study-plan"), api("/api/study-plan/analysis")]);
            plan = planData.plan; analysis = analysisData.analysis;
            if (plan) renderPlan(); else renderSetup({ currentBand: analysis.estimatedBands?.overall >= 4 ? analysis.estimatedBands.overall : 6, prioritySkills: (analysis.repeatedMistakes || []).slice(0, 2).map((item) => item.skill) });
        } catch (error) { errorState(error.message); }
    }

    editButton.addEventListener("click", openSettings);
    settingsDialog.querySelector("[data-close-dialog]").addEventListener("click", () => settingsDialog.close());
    taskDialog.querySelector("[data-close-task-dialog]").addEventListener("click", () => taskDialog.close());
    load();
})();
