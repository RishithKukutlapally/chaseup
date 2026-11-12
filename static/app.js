(() => {
  const CASE_ID = new URLSearchParams(location.search).get("case") || "NG-2026-8812";
  const API = "/api";
  const RM_NAMES = {
    vance: "Alistair Vance",
    jenkins: "Sarah Jenkins",
    chen: "Marcus Chen",
    rostova: "Elena Rostova",
  };
  const STAGE_NAMES = {
    missing_docs: "Chasing missing documents",
    ubo_block: "UBO extraction",
    sanctions_pep: "Sanctions and PEP alerts",
    legal: "Risk & Committee Review",
  };

  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);

  async function request(url, options = {}) {
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.detail || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return result;
  }

  function showMessage(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("text-error", isError);
  }

  function navigateLinks() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest("[data-path]");
      if (!link) return;
      event.preventDefault();
      const destination = link.dataset.path;
      const url = new URL(`/screens/${destination}`, location.origin);
      url.searchParams.set("case", CASE_ID);
      location.href = url.toString();
    });
  }

  function statusChip(status) {
    const styles = {
      overdue: "bg-error-container text-on-error-container",
      requested: "bg-surface-container-high text-on-surface",
      received: "bg-secondary-container text-on-secondary-container",
      waived: "bg-surface-container text-on-surface-variant",
    };
    const labels = {
      overdue: "Overdue",
      requested: "Requested",
      received: "Received",
      waived: "Waived",
    };
    return `<span class="inline-flex items-center gap-space-2xs rounded px-space-xs py-space-2xs font-label-sm text-label-sm ${styles[status] || styles.requested}">${labels[status] || escapeHtml(status)}</span>`;
  }

  function initQueue() {
    const tableBody = document.getElementById("queue-body");
    if (!tableBody) return;
    const search = document.getElementById("caseSearchInput");
    const filters = Object.fromEntries(
      [...document.querySelectorAll("[data-filter]")].map((element) => [element.dataset.filter, element]),
    );
    const params = { status: "all", sort: "oldest", page: 1, page_size: 25 };

    const renderRows = (cases) => {
      tableBody.innerHTML = cases.map((item, index) => {
        const status = item.status === "due_today" ? "Due Today" : item.status === "overdue" ? "Overdue" : "On Track";
        const statusStyle = item.status === "overdue"
          ? "bg-error-container text-on-error-container"
          : item.status === "due_today"
            ? "bg-secondary-container text-on-secondary-container"
            : "bg-surface-container text-on-surface";
        const rowStyle = index === 0 && item.status === "overdue"
          ? "bg-error-container/20 hover:bg-error-container/30"
          : index % 2 ? "bg-surface-container-lowest hover:bg-surface-container-low" : "bg-surface-container-low/40 hover:bg-surface-container-low";
        const missing = item.documents.filter((doc) => ["requested", "overdue"].includes(doc.status));
        const nextFollowUp = item.next_follow_up || "Not scheduled";
        return `<tr tabindex="0" data-case-id="${escapeHtml(item.id)}" class="${rowStyle} transition-colors group">
          <td class="px-space-sm py-space-sm text-center"><input aria-label="Select ${escapeHtml(item.client_name)}" class="row-checkbox w-3.5 h-3.5 rounded bg-surface-container-lowest text-primary" type="checkbox"></td>
          <td class="px-space-md py-space-sm"><div class="flex flex-col min-w-0"><span class="font-label-md text-label-md font-semibold text-on-surface">${escapeHtml(item.client_name)}</span><span class="text-on-surface-variant font-label-sm text-label-sm">${escapeHtml(item.entity_type)}</span></div></td>
          <td class="px-space-sm py-space-sm font-data-mono-md text-data-mono-md">${escapeHtml(item.id)}</td>
          <td class="px-space-sm py-space-sm">${escapeHtml(item.rm_name)}</td>
          <td class="px-space-sm py-space-sm text-center font-data-mono-md text-data-mono-md">${item.days_open}d</td>
          <td class="px-space-md py-space-sm">${escapeHtml(item.stage)}</td>
          <td class="px-space-sm py-space-sm text-center">${missing.length} items</td>
          <td class="px-space-sm py-space-sm font-data-mono-md text-data-mono-md">${item.oldest_item_age}d ${item.status === "overdue" ? "overdue" : "waiting"}</td>
          <td class="px-space-sm py-space-sm">${escapeHtml(nextFollowUp)}</td>
          <td class="px-space-sm py-space-sm"><span class="rounded px-space-xs py-space-2xs font-label-sm text-label-sm ${statusStyle}">${status}</span></td>
          <td class="px-space-md py-space-sm text-right"><a class="rounded bg-surface-container-high px-space-xs py-space-2xs font-label-sm text-label-sm" data-path="case-detail" href="#">View Detail</a></td>
        </tr>`;
      }).join("");
      tableBody.querySelectorAll(".row-checkbox").forEach((checkbox) => {
        checkbox.addEventListener("change", updateBatchSelection);
      });
      tableBody.querySelectorAll("tr[data-case-id]").forEach((row) => {
        row.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            const url = new URL("/screens/case-detail", location.origin);
            url.searchParams.set("case", row.dataset.caseId);
            location.href = url.toString();
          }
        });
      });
      updateBatchSelection();
    };

    const loadQueue = async () => {
      params.search = search?.value.trim() || "";
      if (filters.rm) params.rm = RM_NAMES[filters.rm.value] || "all";
      if (filters.stage) params.stage = STAGE_NAMES[filters.stage.value] || "all";
      if (filters.aging) params.aging = filters.aging.value;
      if (filters["page-size"]) params.page_size = filters["page-size"].value;
      const query = new URLSearchParams(params);
      try {
        const result = await request(`${API}/queue?${query}`);
        const open = document.querySelector('[data-bind="summary-open"]');
        const overdue = document.querySelector('[data-bind="summary-overdue"]');
        const median = document.querySelector('[data-bind="summary-median"]');
        const total = document.querySelector('[data-bind="queue-total"]');
        if (open) open.textContent = result.summary.cases_open;
        if (overdue) overdue.textContent = result.summary.cases_overdue;
        if (median) median.textContent = Number(result.summary.median_days_in_chase_stage).toFixed(1);
        if (total) total.textContent = result.total;
        renderRows(result.cases);
      } catch (error) {
        showMessage(document.getElementById("queue-error"), error.message, true);
      }
    };

    search?.addEventListener("input", loadQueue);
    Object.values(filters).forEach((select) => select.addEventListener("change", loadQueue));
    document.querySelectorAll('[role="tab"]').forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll('[role="tab"]').forEach((other) => other.setAttribute("aria-selected", "false"));
        tab.setAttribute("aria-selected", "true");
        const label = tab.textContent.toLowerCase();
        params.status = label.includes("overdue") ? "overdue" : label.includes("due today") ? "due_today" : label.includes("blocked") ? "blocked" : "all";
        if (label.includes("my assigned")) {
          if (filters.rm) filters.rm.value = "vance";
        }
        loadQueue();
      });
    });
    document.getElementById("queue-sort")?.addEventListener("click", () => {
      params.sort = params.sort === "oldest" ? "newest" : "oldest";
      loadQueue();
    });

    function updateBatchSelection() {
      const selected = tableBody.querySelectorAll(".row-checkbox:checked").length;
      const button = document.getElementById("batchChaseBtn");
      const badge = document.getElementById("batchCountBadge");
      const all = document.getElementById("selectAllCheckbox");
      if (button) button.disabled = selected === 0;
      if (badge) {
        badge.textContent = selected;
        badge.classList.toggle("hidden", selected === 0);
      }
      if (all) {
        const checkboxes = tableBody.querySelectorAll(".row-checkbox");
        all.checked = checkboxes.length > 0 && selected === checkboxes.length;
      }
    }

    document.getElementById("selectAllCheckbox")?.addEventListener("change", (event) => {
      tableBody.querySelectorAll(".row-checkbox").forEach((checkbox) => {
        checkbox.checked = event.target.checked;
      });
      updateBatchSelection();
    });
    loadQueue();
  }

  async function initCaseDetail() {
    const checklist = document.getElementById("case-checklist");
    if (!checklist) return;
    try {
      const item = await request(`${API}/cases/${encodeURIComponent(CASE_ID)}`);
      const title = document.getElementById("case-title");
      if (title) title.textContent = item.client_name;
      const caseId = document.getElementById("case-id");
      if (caseId) caseId.textContent = item.id;

      const groups = new Map();
      item.documents.forEach((doc) => {
        const group = doc.category.split(" ").slice(0, 2).join(" ");
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(doc);
      });
      checklist.innerHTML = [...groups.entries()].map(([group, docs]) => `
        <section class="bg-surface-container-lowest rounded-lg shadow-sm overflow-hidden">
          <div class="bg-surface-container-low px-space-lg py-space-sm flex items-center justify-between">
            <span class="font-label-sm text-label-sm uppercase font-semibold text-on-surface">${escapeHtml(group)}</span>
            <span class="font-data-mono-sm text-data-mono-sm text-on-surface-variant">${docs.filter((doc) => doc.status === "received" || doc.status === "waived").length}/${docs.length} complete</span>
          </div>
          <div class="divide-y divide-surface-container-low">${docs.map((doc) => `
            <article class="p-space-md flex flex-col gap-space-sm">
              <div class="flex flex-wrap items-center justify-between gap-space-sm">
                <div><h3 class="font-body-md text-body-md font-semibold">${escapeHtml(doc.category)}</h3>
                <p class="mt-1 text-xs text-on-surface-variant">Owner: ${escapeHtml(doc.owner)} · Requested: ${escapeHtml(doc.requested_at)} · Due: ${escapeHtml(doc.due_at)} · Round ${doc.chase_round}</p></div>
                ${statusChip(doc.status)}
              </div>
              ${doc.waiver_reason ? `<p class="text-sm text-on-surface-variant">Waiver reason: ${escapeHtml(doc.waiver_reason)}</p>` : ""}
              ${doc.state === "requested" ? `<div class="flex flex-wrap items-center gap-2"><button type="button" class="rounded bg-surface-container px-3 py-1 text-xs" data-doc-action="received" data-document-id="${escapeHtml(doc.id)}">Mark received</button><label class="sr-only" for="waiver-${escapeHtml(doc.id)}">Waiver reason for ${escapeHtml(doc.category)}</label><input id="waiver-${escapeHtml(doc.id)}" class="min-w-48 rounded bg-surface-container-low px-2 py-1 text-xs" placeholder="Reason required to waive"><button type="button" class="rounded bg-surface-container px-3 py-1 text-xs" data-doc-action="waived" data-document-id="${escapeHtml(doc.id)}">Waive</button></div>` : ""}
            </article>`).join("")}
        </section>`).join("");

      const blockedDocs = document.getElementById("blocked-docs");
      if (blockedDocs) {
        const missing = item.documents.filter((doc) => ["requested", "overdue"].includes(doc.status));
        blockedDocs.innerHTML = missing.map((doc) => `<div class="flex items-center gap-space-xs"><span class="text-error">×</span><span class="text-on-surface">${escapeHtml(doc.category)}</span></div>`).join("") || '<span class="text-on-surface">No unresolved prerequisites</span>';
      }
      const timeline = document.getElementById("case-timeline");
      if (timeline) {
        timeline.innerHTML = item.timeline.map((event) => `
          <article class="relative flex items-start gap-space-sm">
            <span class="absolute -left-[27px] top-1 w-3 h-3 rounded-full ${event.event_type === "sent" ? "bg-primary-container" : event.event_type === "waived" ? "bg-error" : "bg-secondary-container"} border-2 border-surface-container-lowest"></span>
            <div class="flex flex-col w-full">
              <div class="flex flex-wrap items-center justify-between gap-2"><strong class="font-data-mono-sm text-data-mono-sm">${escapeHtml(event.event_type.replaceAll("_", " "))}</strong><time class="font-data-mono-sm text-data-mono-sm text-on-surface-variant">${escapeHtml(event.created_at)}</time></div>
              <p class="mt-1 text-sm text-on-surface">${escapeHtml(event.details || event.reason || event.actor)}</p>
            </div>
          </article>`).join("") || '<p class="text-sm text-on-surface-variant">No events recorded.</p>';
      }

      checklist.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-doc-action]");
        if (!button) return;
        const docAction = button.dataset.docAction;
        const payload = { action: docAction, actor: "Ops Analyst" };
        if (docAction === "waived") {
          const reason = document.getElementById(`waiver-${button.dataset.documentId}`)?.value.trim();
          if (!reason) {
            showMessage(document.getElementById("case-action-message"), "Enter a waiver reason before waiving.", true);
            return;
          }
          payload.reason = reason;
        }
        try {
          await request(`${API}/cases/${encodeURIComponent(CASE_ID)}/documents/${encodeURIComponent(button.dataset.documentId)}/events`, {
            method: "POST",
            body: JSON.stringify(payload),
          });
          location.reload();
        } catch (error) {
          showMessage(document.getElementById("case-action-message"), error.message, true);
        }
      });
    } catch (error) {
      checklist.innerHTML = `<p role="alert" class="text-error">${escapeHtml(error.message)}</p>`;
    }
  }

  async function initComposer() {
    const bodyField = document.getElementById("draft-body");
    if (!bodyField) return;
    const message = document.getElementById("composer-message");
    let draft;
    let caseRecord;
    try {
      caseRecord = await request(`${API}/cases/${encodeURIComponent(CASE_ID)}`);
      try {
        draft = await request(`${API}/cases/${encodeURIComponent(CASE_ID)}/drafts/latest`);
      } catch (error) {
        if (error.status !== 404 || !error.message.toLowerCase().includes("no draft")) throw error;
        draft = await request(`${API}/cases/${encodeURIComponent(CASE_ID)}/drafts`, {
          method: "POST",
          body: JSON.stringify({ actor: caseRecord.rm_name }),
        });
      }
      bodyField.value = draft.body;
      document.getElementById("case-title").textContent = caseRecord.client_name;
      document.getElementById("case-id").textContent = caseRecord.id;
      document.getElementById("draft-rm").textContent = caseRecord.rm_name;
      document.getElementById("draft-rm-card").textContent = caseRecord.rm_name;
      document.getElementById("first-notice").textContent = caseRecord.opened_at;
      document.getElementById("days-elapsed").textContent = `${caseRecord.days_open} days`;
      document.getElementById("missing-count").textContent = `${caseRecord.missing_docs} items`;
      const health = await request(`${API}/health`);
      document.getElementById("ai-message").textContent = health.ai_message || "AI drafting is enabled.";
      updateStatus();
    } catch (error) {
      showMessage(message, error.message, true);
      return;
    }

    function updateStatus() {
      const labels = {
        draft: "DRAFT FOR RM REVIEW — UNAPPROVED",
        approved: "APPROVED — NOT SENT",
        scheduled: "APPROVED — SCHEDULED",
        sent: "APPROVED — SENT",
      };
      document.getElementById("draft-status").textContent = labels[draft.status] || "DRAFT FOR RM REVIEW";
    }

    async function saveDraft() {
      if (draft.status !== "draft") throw new Error("Approved drafts cannot be edited.");
      draft = await request(`${API}/drafts/${encodeURIComponent(draft.id)}`, {
        method: "PUT",
        body: JSON.stringify({ actor: caseRecord.rm_name, body: bodyField.value }),
      });
    }

    document.getElementById("edit-body").addEventListener("click", () => {
      bodyField.readOnly = !bodyField.readOnly;
      document.getElementById("edit-body").textContent = bodyField.readOnly ? "Edit Body Text" : "Finish Editing";
      if (!bodyField.readOnly) bodyField.focus();
    });
    document.getElementById("save-draft").addEventListener("click", async () => {
      try {
        await saveDraft();
        showMessage(message, "Draft saved for RM review.");
      } catch (error) {
        showMessage(message, error.message, true);
      }
    });
    document.getElementById("approve-send").addEventListener("click", async () => {
      try {
        await saveDraft();
        draft = await request(`${API}/drafts/${encodeURIComponent(draft.id)}/approve-and-send`, {
          method: "POST",
          body: JSON.stringify({ approved_by: caseRecord.rm_name }),
        });
        updateStatus();
        bodyField.readOnly = true;
        showMessage(message, "Approved and logged as sent to the case timeline.");
      } catch (error) {
        showMessage(message, error.message, true);
      }
    });
    document.getElementById("schedule-draft").addEventListener("click", async () => {
      const value = document.getElementById("schedule-time").value;
      if (!value) {
        showMessage(message, "Choose a future date and time to schedule.", true);
        return;
      }
      const scheduledTime = new Date(value);
      if (Number.isNaN(scheduledTime.getTime()) || scheduledTime <= new Date()) {
        showMessage(message, "The scheduled date and time must be in the future.", true);
        return;
      }
      try {
        await saveDraft();
        draft = await request(`${API}/drafts/${encodeURIComponent(draft.id)}/schedule`, {
          method: "POST",
          body: JSON.stringify({ approved_by: caseRecord.rm_name, scheduled_for: scheduledTime.toISOString() }),
        });
        updateStatus();
        showMessage(message, "Approved and scheduled. The send remains server-side and approval-gated.");
      } catch (error) {
        showMessage(message, error.message, true);
      }
    });
  }

  async function initAnalytics() {
    const cards = document.getElementById("stage-cards");
    const tbody = document.getElementById("chase-rounds-body");
    if (!cards || !tbody) return;
    try {
      const data = await request(`${API}/analytics`);
      [...cards.children].slice(0, data.stages.length).forEach((card, index) => {
        const stage = data.stages[index];
        const title = card.querySelector("p");
        if (title) title.textContent = stage.name;
        const duration = [...card.querySelectorAll("span")].find((span) => /\d+(\.\d+)? Days/.test(span.textContent));
        if (duration) duration.textContent = `${stage.days}.0 Days`;
      });
      const total = data.chase_rounds.reduce((sum, item) => sum + item.cases, 0) || 1;
      tbody.innerHTML = data.chase_rounds.map((item, index) => {
        const percent = Math.round((item.cases / total) * 100);
        const tier = `Round ${item.round}${item.round === 3 ? "+" : ""}`;
        const color = item.round === 3 ? "bg-error" : item.round === 2 ? "bg-outline" : "bg-secondary";
        const rowClass = item.round === 3 ? "bg-error-container/20" : index % 2 ? "bg-surface-container-lowest" : "";
        return `<tr class="${rowClass} hover:bg-surface-container-low/50">
          <td class="py-space-sm px-space-md font-medium"><span class="inline-block w-2 h-2 rounded-full ${color} mr-2"></span>${tier} (synthetic cases)</td>
          <td class="py-space-sm px-space-md font-data-mono-md text-data-mono-md font-semibold">${item.cases} Cases</td>
          <td class="py-space-sm px-space-md"><div class="flex items-center gap-space-xs"><div class="w-16 h-2 bg-surface-container-high rounded overflow-hidden"><div class="h-full ${color}" style="width:${percent}%"></div></div><span class="font-data-mono-sm text-data-mono-sm">${percent}%</span></div></td>
          <td class="py-space-sm px-space-md font-data-mono-md text-data-mono-md">${item.median_days_to_resolution === null ? "—" : `${item.median_days_to_resolution}.0 Days`}</td>
          <td class="py-space-sm px-space-md text-on-surface-variant">Synthetic workflow events</td>
          <td class="py-space-sm px-space-md"><span class="font-label-sm text-label-sm uppercase bg-surface-container px-space-xs py-space-2xs rounded">Review case documents</span></td>
        </tr>`;
      }).join("");
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="6" role="alert" class="p-4 text-error">${escapeHtml(error.message)}</td></tr>`;
    }
  }

  async function initHandoff() {
    const button = document.getElementById("submitHandoffBtn");
    const guidanceField = document.getElementById("analyst-guidance");
    if (!button || !guidanceField) return;
    const toast = document.getElementById("actionToast");
    try {
      const item = await request(`${API}/cases/${encodeURIComponent(CASE_ID)}`);
      const dossierCaseId = document.querySelector("main .font-data-mono-sm.bg-surface-container-high");
      const dossierTitle = document.querySelector("main h3");
      if (dossierTitle) dossierTitle.textContent = item.client_name;
      if (dossierCaseId) dossierCaseId.textContent = item.id;
      const outstanding = item.documents.filter((doc) => ["requested", "overdue"].includes(doc.status));
      button.addEventListener("click", async () => {
        if (!outstanding.length) {
          showMessage(document.getElementById("handoff-message"), "No unresolved documents are available to link.", true);
          return;
        }
        button.disabled = true;
        try {
          const handoff = await request(`${API}/cases/${encodeURIComponent(CASE_ID)}/handoffs`, {
            method: "POST",
            body: JSON.stringify({
              actor: "Dev Patel",
              guidance: guidanceField.value,
              document_ids: outstanding.map((doc) => doc.id),
            }),
          });
          toast.classList.remove("hidden");
          toast.querySelector("span.font-body-sm").textContent = `Linked request ${handoff.id} created for ${handoff.rm_name}.`;
          showMessage(document.getElementById("handoff-message"), "Linked request created and logged to the case timeline.");
        } catch (error) {
          showMessage(document.getElementById("handoff-message"), error.message, true);
        } finally {
          button.disabled = false;
        }
      });
    } catch (error) {
      showMessage(document.getElementById("handoff-message"), error.message, true);
    }
  }

  navigateLinks();
  initQueue();
  initCaseDetail();
  initComposer();
  initAnalytics();
  initHandoff();
})();
