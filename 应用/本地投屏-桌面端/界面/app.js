import {
  ControlClient,
  VideoSession,
  wallProfileFromSize,
  wallProfileSticky,
  mapPointerCoords,
  createPointerMoveScheduler,
} from "./player.js";

const $ = (id) => document.getElementById(id);
const STORE_KEY = "desktop-local.fleet.v2";

function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (raw && Array.isArray(raw.devices)) {
      return {
        devices: raw.devices.map((d) => ({
          ...d,
          alias: typeof d.alias === "string" ? d.alias : "",
          remark: typeof d.remark === "string" ? d.remark : "",
          phoneName: typeof d.phoneName === "string" ? d.phoneName : "",
        })),
        prefs: {
          lowUsage: raw.prefs?.lowUsage === true,
          zoom: Number(raw.prefs?.zoom) || 274,
          orientation: raw.prefs?.orientation === "portrait" ? "portrait" : "landscape",
          tab: raw.prefs?.tab === "online" ? "online" : "all",
          statusFilter: raw.prefs?.statusFilter || "all",
          sortMode: raw.prefs?.sortMode || "manual",
          devicePanelCollapsed: raw.prefs?.devicePanelCollapsed === true,
          openWindows: Array.isArray(raw.prefs?.openWindows)
            ? raw.prefs.openWindows
                .filter((w) => w && w.ip)
                .map((w) => ({
                  ip: String(w.ip),
                  port: Number(w.port) || 11019,
                  name: String(w.name || w.ip),
                  deviceId: String(w.deviceId || ""),
                  mode: w.mode === "portrait" ? "portrait" : "landscape",
                }))
            : [],
        },
      };
    }
  } catch {}
  return {
    devices: [],
    prefs: {
      lowUsage: false,
      zoom: 320,
      orientation: "landscape",
      tab: "all",
      statusFilter: "all",
      sortMode: "manual",
      devicePanelCollapsed: false,
      openWindows: [],
    },
  };
}

function saveStore() {
  localStorage.setItem(
    STORE_KEY,
    JSON.stringify({
      devices: state.devices.map(({ id, name, ip, port, order, deviceId, alias, remark, phoneName }) => ({
        id,
        name,
        ip,
        port,
        order,
        deviceId,
        alias: alias || "",
        remark: remark || "",
        phoneName: phoneName || "",
      })),
      prefs: {
        ...state.prefs,
        openWindows: Array.isArray(state.prefs.openWindows) ? state.prefs.openWindows : [],
      },
    })
  );
}

function displayName(device) {
  const alias = String(device?.alias || "").trim();
  if (alias) return alias;
  return device?.phoneName || device?.name || device?.ip || "设备";
}

function applyDisplayName(device) {
  device.name = displayName(device);
}

function uid() {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function shortId(deviceId, fallback) {
  const s = String(deviceId || fallback || "");
  return s.length <= 8 ? s || "—" : s.slice(0, 8);
}

function padOrder(n) {
  return String(Math.max(1, n | 0)).padStart(3, "0");
}

const state = {
  ...loadStore(),
  online: new Map(), // id -> { info, rtt, baseWs }
  selected: new Set(),
  sessions: new Map(), // id -> VideoSession
  preview: null,
};

document.documentElement.style.setProperty("--card-width", `${state.prefs.zoom}px`);
$("tile-zoom").value = String(state.prefs.zoom);
$("zoom-value").textContent = String(state.prefs.zoom);
$("low-usage").checked = state.prefs.lowUsage;
$("status-filter").value = state.prefs.statusFilter;
$("sort-mode").value = state.prefs.sortMode;
$("health").textContent = "本地就绪";
$("health").classList.add("ready");

function syncDevicePanelCollapsed() {
  const collapsed = state.prefs.devicePanelCollapsed === true;
  const panel = $("device-panel");
  const toggle = $("device-panel-toggle");
  if (!panel || !toggle) return;
  panel.hidden = collapsed;
  toggle.setAttribute("aria-expanded", String(!collapsed));
  const label = collapsed ? "展开设备列表" : "收起设备列表";
  toggle.setAttribute("aria-label", label);
  toggle.title = label;
}

syncDevicePanelCollapsed();

function setMessage(text, show = !!text) {
  const el = $("message");
  el.hidden = !show;
  el.textContent = text || "";
}

function updateModeStatus() {
  const low = state.prefs.lowUsage;
  const z = state.prefs.zoom;
  if (low) {
    $("mode-status").textContent = z < 280 ? "低占用 · 384px · 15 fps" : "低占用 · 512px · 15 fps";
  } else {
    const dim = z < 220 ? 384 : z < 300 ? 512 : 768;
    const fps = z < 220 ? 15 : 20;
    $("mode-status").textContent = `墙模式 · ${dim}px · ${fps} fps`;
  }
}

function sortDeviceList(list) {
  const mode = state.prefs.sortMode;
  list.sort((a, b) => {
    if (mode === "name") return displayName(a).localeCompare(displayName(b), "zh");
    if (mode === "id") return String(a.deviceId || a.id).localeCompare(String(b.deviceId || b.id));
    if (mode === "ip") return String(a.ip).localeCompare(String(b.ip));
    if (mode === "online") {
      const ao = state.online.has(a.id) ? 0 : 1;
      const bo = state.online.has(b.id) ? 0 : 1;
      if (ao !== bo) return ao - bo;
    }
    return (a.order || 0) - (b.order || 0);
  });
  return list;
}

/** 侧栏列表：可按「在线」筛选 */
function filteredDevices() {
  let list = [...state.devices];
  const q = ($("search").value || "").trim().toLowerCase();
  if (q) {
    list = list.filter((d) =>
      [d.name, d.ip, d.deviceId, d.id].some((v) => String(v || "").toLowerCase().includes(q))
    );
  }
  if (state.prefs.statusFilter === "online") list = list.filter((d) => state.online.has(d.id));
  if (state.prefs.statusFilter === "offline") list = list.filter((d) => !state.online.has(d.id));
  if (state.prefs.tab === "online") list = list.filter((d) => state.online.has(d.id));
  return sortDeviceList(list);
}

/** 设备墙：始终保留已添加设备（重启后不会因「在线」页签空窗） */
function wallDevices() {
  let list = [...state.devices];
  const q = ($("search").value || "").trim().toLowerCase();
  if (q) {
    list = list.filter((d) =>
      [d.name, d.ip, d.deviceId, d.id].some((v) => String(v || "").toLowerCase().includes(q))
    );
  }
  return sortDeviceList(list);
}

function updateSelectionUi() {
  const n = state.selected.size;
  $("selected-count").hidden = n === 0;
  $("selected-count").textContent = n ? `已选 ${n}` : "";
  $("clear-selection").hidden = n === 0;
  $("delete-selected").hidden = n === 0;
  $("delete-selected").disabled = n === 0;
  const batchBtn = $("batch-actions");
  if (batchBtn) {
    batchBtn.hidden = false;
    batchBtn.disabled = n === 0;
  }
  const visible = filteredDevices();
  $("select-all").checked = visible.length > 0 && visible.every((d) => state.selected.has(d.id));
}

function renderRows() {
  const rows = $("device-rows");
  const list = filteredDevices();
  rows.replaceChildren();
  for (const d of list) {
    const online = state.online.has(d.id);
    const row = document.createElement("div");
    row.className = `device-row${state.selected.has(d.id) ? " selected" : ""}`;
    row.role = "listitem";
    row.dataset.id = d.id;
    row.innerHTML = `
      <label class="row-check"><input class="row-select" type="checkbox" ${state.selected.has(d.id) ? "checked" : ""} aria-label="选择设备"></label>
      <div class="row-identity">
        <input class="row-order" type="number" min="1" max="1000" value="${d.order}" aria-label="序号">
        <span class="row-id" title="${d.deviceId || d.id}">${shortId(d.deviceId, d.id)}</span>
      </div>
      <span class="row-name" data-remark="${remarkAttr(d.remark)}">${escapeHtml(displayName(d))}</span>
      <span class="row-state${online ? " online" : ""}">${online ? "在线" : "离线"}</span>
    `;
    row.querySelector(".row-select").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSelect(d.id, e.currentTarget.checked);
      renderAll();
    });
    row.querySelector(".row-order").addEventListener("change", (e) => {
      d.order = Math.max(1, Number(e.target.value) || 1);
      saveStore();
      renderAll();
    });
    // 官方：单击勾选，双击打开独立大窗口，右键菜单
    row.addEventListener("click", (e) => {
      if (e.target.closest("input,label")) return;
      toggleSelect(d.id, !state.selected.has(d.id));
      renderAll();
    });
    row.addEventListener("dblclick", (e) => {
      if (e.target.closest("input,label")) return;
      e.preventDefault();
      openDeviceWindow(d);
    });
    row.addEventListener("contextmenu", (e) => showDeviceContextMenu(e, d.id));
    rows.appendChild(row);
  }
  $("count").textContent = String(state.devices.length);
  $("online-count").textContent = String([...state.online.keys()].filter((id) => state.devices.some((d) => d.id === id)).length);
  updateSelectionUi();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function remarkAttr(s) {
  return escapeHtml(String(s || "").replace(/\s+/g, " ").trim());
}

function createTile(d) {
  const online = state.online.has(d.id);
  const tile = document.createElement("article");
  tile.className = `device-tile${state.selected.has(d.id) ? " selected" : ""}`;
  tile.dataset.id = d.id;
  tile.tabIndex = 0;
  tile.innerHTML = `
    <button class="tile-select" type="button" aria-label="选择设备"><img src="./icons/check.svg" alt=""></button>
    <span class="tile-state${online ? " online" : ""}">${online ? "在线" : "离线"}</span>
    <div class="tile-screen">
      <canvas></canvas>
      <div class="tile-placeholder"><img src="./icons/smartphone.svg" alt=""><span>${online ? "连接中" : "离线"}</span></div>
    </div>
    <div class="tile-heading">
      <span class="tile-number">${padOrder(d.order)}</span>
      <span class="tile-name" data-remark="${remarkAttr(d.remark)}">${escapeHtml(displayName(d))}</span>
      <button class="tile-open" type="button" title="独立窗口" aria-label="独立窗口"><img src="./icons/expand.svg" alt=""></button>
    </div>
  `;
  tile.querySelector(".tile-select").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSelect(d.id, !state.selected.has(d.id));
    renderAll();
  });
  tile.querySelector(".tile-open").addEventListener("click", (e) => {
    e.stopPropagation();
    openDeviceWindow(d);
  });
  // 官方：单击勾选；双击 / 展开按钮 → 独立设备大窗口；右键菜单
  tile.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    toggleSelect(d.id, !state.selected.has(d.id));
    renderAll();
  });
  tile.addEventListener("dblclick", (e) => {
    if (e.target.closest("button")) return;
    e.preventDefault();
    openDeviceWindow(d);
  });
  tile.addEventListener("contextmenu", (e) => showDeviceContextMenu(e, d.id));
  return tile;
}

function updateTile(tile, d) {
  const online = state.online.has(d.id);
  tile.classList.toggle("selected", state.selected.has(d.id));
  const stateEl = tile.querySelector(".tile-state");
  stateEl.textContent = online ? "在线" : "离线";
  stateEl.classList.toggle("online", online);
  tile.querySelector(".tile-number").textContent = padOrder(d.order);
  const nameEl = tile.querySelector(".tile-name");
  nameEl.textContent = displayName(d);
  nameEl.dataset.remark = d.remark || "";
  const placeholder = tile.querySelector(".tile-placeholder");
  if (!online) {
    state.sessions.get(d.id)?.close();
    state.sessions.delete(d.id);
    placeholder.hidden = false;
    placeholder.querySelector("span").textContent = "离线";
  }
}

function renderWall() {
  const host = $("devices");
  const empty = $("empty");
  const list = wallDevices();
  host.dataset.presentation = state.prefs.orientation;
  host.style.setProperty("--card-width", `${state.prefs.zoom}px`);
  document.documentElement.style.setProperty("--card-width", `${state.prefs.zoom}px`);

  for (const btn of $("wall-orientation").querySelectorAll(".orientation-button")) {
    const on = btn.dataset.wallMode === state.prefs.orientation;
    btn.classList.toggle("selected", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
  for (const btn of document.querySelectorAll("#tab-all, #tab-online")) {
    btn.classList.toggle("selected", (btn.id === "tab-online") === (state.prefs.tab === "online"));
  }

  const keep = new Set(list.map((d) => d.id));
  const existing = new Map([...host.children].map((el) => [el.dataset.id, el]));
  for (const [id, tile] of existing) {
    if (!keep.has(id)) {
      state.sessions.get(id)?.close();
      state.sessions.delete(id);
      tile.remove();
    }
  }

  empty.hidden = list.length > 0;
  for (const d of list) {
    let tile = existing.get(d.id);
    if (!tile) {
      tile = createTile(d);
      host.appendChild(tile);
    } else {
      updateTile(tile, d);
      host.appendChild(tile);
    }
    if (state.online.has(d.id) && state.preview?.deviceId !== d.id) ensureTileSession(d, tile);
  }

  const onlineN = [...state.online.keys()].filter((id) => list.some((d) => d.id === id)).length;
  $("summary").textContent =
    list.length === 0
      ? "暂无设备 · 请搜索并「添加」后才会保存"
      : `已保存 ${list.length} 台 · 在线 ${onlineN} 台`;
  updateModeStatus();
}

function ensureTileSession(device, tile) {
  const canvas = tile.querySelector("canvas");
  const placeholder = tile.querySelector(".tile-placeholder");
  const online = state.online.get(device.id);
  if (!online) return;

  let session = state.sessions.get(device.id);
  if (session) {
    // move canvas binding if DOM rebuilt
    if (session.canvas !== canvas) {
      session.close();
      state.sessions.delete(device.id);
      session = null;
    } else {
      // 墙方向切换时必须更新 presentation，否则竖屏仍按横屏旋图画
      session.setPresentation?.(state.prefs.orientation);
      return;
    }
  }

  session = new VideoSession({
    canvas,
    getProfile: (sticky) => {
      if (device.wallOverride) return { ...device.wallOverride, stageSize: state.prefs.zoom };
      const screen = tile.querySelector(".tile-screen");
      const w = screen?.clientWidth || state.prefs.zoom;
      return wallProfileSticky(w, state.prefs.lowUsage, sticky);
    },
    presentation: state.prefs.orientation,
    onFirstFrame: () => {
      placeholder.hidden = true;
    },
    onStatus: (t) => {
      if (!placeholder.hidden) placeholder.querySelector("span").textContent = t;
    },
    onError: () => {},
  });
  state.sessions.set(device.id, session);
  session.open(online.baseWs).catch(() => {
    placeholder.querySelector("span").textContent = "画面失败";
  });
}

function renderAll() {
  renderRows();
  renderWall();
}

function toggleSelect(id, on) {
  if (on) state.selected.add(id);
  else state.selected.delete(id);
  updateSelectionUi();
}

async function probeDevice(device) {
  const t0 = performance.now();
  const body = await window.desktopLocal.probeInfo(device.ip, device.port);
  const rtt = Math.round(performance.now() - t0);
  if (!body.ok) {
    state.online.delete(device.id);
    return { ok: false, error: body.error, rtt };
  }
  const info = body.info || {};
  device.phoneName = info.name || device.phoneName || "";
  device.deviceId = info.deviceId || device.deviceId || "";
  applyDisplayName(device);
  state.online.set(device.id, {
    info,
    rtt,
    baseWs: `ws://${body.ip}:${body.port}`,
    ip: body.ip,
    port: body.port,
  });
  saveStore();
  return { ok: true, rtt, info };
}

async function refreshAll({ quiet = false } = {}) {
  if (!quiet) setMessage("正在探测设备…", true);
  $("health").textContent = "正在探测";
  $("health").classList.remove("ready");
  await Promise.all(
    state.devices.map(async (d) => {
      try {
        await probeDevice(d);
      } catch {
        state.online.delete(d.id);
      }
    })
  );
  for (const [id, session] of state.sessions) {
    if (!state.online.has(id)) {
      session.close();
      state.sessions.delete(id);
    }
  }
  $("health").textContent = "本地就绪";
  $("health").classList.add("ready");
  setMessage("", false);
  renderAll();
  // restart streams for online
  renderWall();
}

function deviceKey(d) {
  return `${d.ip}:${d.port || 11019}`;
}

function isSavedDevice(item) {
  return state.devices.some((d) => d.ip === item.ip && Number(d.port) === Number(item.port || 11019));
}

function setManagementStatus(text, isError = false) {
  const status = $("management-status");
  status.hidden = !text;
  status.classList.toggle("error", !!isError);
  status.textContent = text || "";
}

function openAddDialog() {
  setManagementStatus("");
  $("management").showModal();
  $("phone-ip").focus();
}

/** 官方 discovery-dialog：网卡选择 / 进度条 / 勾选批量添加 */
const discovery = {
  devices: [],
  selected: new Set(),
  running: false,
  adding: false,
  stopProgress: null,

  async open() {
    if (!$("discovery-dialog").open) $("discovery-dialog").showModal();
    $("scan-result").textContent = "";
    $("scan-result").classList.remove("error");
    try {
      const status = await window.desktopLocal.scanLanStatus();
      this.applyIdle(status);
    } catch (e) {
      $("scan-status").textContent = e.message || String(e);
    }
    this.render();
  },

  applyIdle(status = {}) {
    const ifaces = Array.isArray(status.interfaces) ? status.interfaces : [];
    const sel = $("scan-network");
    const prev = sel.value;
    sel.replaceChildren();
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "当前连接网络";
    sel.append(blank);
    for (const a of ifaces) {
      const opt = document.createElement("option");
      opt.value = a.address;
      opt.textContent = a.label || `${a.address}${a.cidr ? ` · ${a.cidr}` : ""}`;
      sel.append(opt);
    }
    if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
    $("scan-segment-field").hidden = true;
    if (!this.running) {
      $("scan-progress").value = 0;
      $("scan-range").textContent = "";
      $("scan-status").textContent = "点击开始搜索发现设备。";
    }
  },

  apply(status = {}) {
    this.running = status.running === true;
    if (Array.isArray(status.devices)) this.devices = status.devices;
    if (Array.isArray(status.interfaces) && !this.running) this.applyIdle(status);

    const total = Math.max(0, Number(status.total) || 0);
    const scanned = Math.max(0, Number(status.scanned) || 0);
    const empty = !this.running && !total && !scanned && !this.devices.length;
    $("scan-progress").value = empty
      ? 0
      : this.running
        ? Math.max(0, Math.min(100, Number(status.progress) || (total ? (scanned * 100) / total : 0)))
        : 100;
    $("scan-range").textContent = status.range || status.segments?.range || status.subnet || "";
    if (status.error) {
      $("scan-status").textContent = status.error;
    } else if (empty) {
      $("scan-status").textContent = "点击开始搜索发现设备。";
    } else if (this.running) {
      $("scan-status").textContent = `已检查 ${scanned} / ${total} 个地址，发现 ${this.devices.length} 台设备`;
    } else if (this.devices.length) {
      $("scan-status").textContent = `搜索完成，发现 ${this.devices.length} 台设备`;
    } else {
      $("scan-status").textContent = "未发现设备，请确认手机服务已开启。";
    }
    this.render();
  },

  render() {
    const host = $("discoveries");
    host.replaceChildren();
    if (!this.devices.length) {
      const empty = document.createElement("div");
      empty.className = "discovery-empty";
      empty.textContent = this.running ? "正在搜索，请稍候…" : "搜索结果将显示在这里";
      host.append(empty);
    } else {
      for (const item of this.devices) {
        const key = deviceKey(item);
        const saved = isSavedDevice(item);
        const row = document.createElement("div");
        row.className = "discovery";
        const label = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = this.selected.has(key);
        cb.disabled = this.adding || saved || this.running;
        cb.setAttribute("aria-label", `选择设备 ${item.name || item.ip}`);
        cb.addEventListener("change", () => {
          if (cb.checked) this.selected.add(key);
          else this.selected.delete(key);
          this.updateButtons();
        });
        label.append(cb);
        const name = document.createElement("span");
        name.textContent = item.name || "手机基座";
        const addr = document.createElement("code");
        addr.textContent = key;
        const st = document.createElement("span");
        st.className = `scan-device-state ${saved ? "saved" : "online"}`;
        st.textContent = saved ? "已添加" : "在线";
        row.append(label, name, addr, st);
        host.append(row);
      }
    }
    this.updateButtons();
  },

  updateButtons() {
    const unsaved = this.devices.filter((d) => !isSavedDevice(d));
    const picked = unsaved.filter((d) => this.selected.has(deviceKey(d)));
    $("scan-select-all").checked = unsaved.length > 0 && picked.length === unsaved.length;
    $("scan-select-all").indeterminate = picked.length > 0 && picked.length < unsaved.length;
    $("scan-select-all").disabled = this.adding || this.running || !unsaved.length;
    $("scan-add-all").disabled = this.adding || this.running || !unsaved.length;
    $("scan-add-selected").disabled = this.adding || this.running || !picked.length;
    $("scan-add-selected").textContent = `添加选中${picked.length ? `（${picked.length}）` : ""}`;
    $("scan-start").disabled = this.running || this.adding;
    $("scan-network").disabled = this.running || this.adding;
    $("scan-stop").hidden = !this.running;
    $("scan").disabled = this.running;
  },

  async start() {
    if (this.running || this.adding || !window.desktopLocal?.scanLan) return;
    this.running = true;
    this.devices = [];
    this.selected.clear();
    $("scan-result").textContent = "";
    $("scan-result").classList.remove("error");
    $("scan-status").textContent = "正在搜索设备…";
    this.render();
    this.stopProgress = window.desktopLocal.onScanProgress?.((status) => this.apply(status));
    try {
      const result = await window.desktopLocal.scanLan({
        port: 11019,
        interfaceAddress: $("scan-network").value || "",
      });
      if (!result.ok) {
        this.running = false;
        $("scan-status").textContent = result.error || "搜索失败";
        this.render();
        return;
      }
      this.apply({ ...result, running: false });
    } catch (e) {
      this.running = false;
      $("scan-status").textContent = e.message || String(e);
      this.render();
    } finally {
      this.stopProgress?.();
      this.stopProgress = null;
      this.running = false;
      this.updateButtons();
    }
  },

  async stop() {
    if (!this.running) return;
    $("scan-stop").disabled = true;
    try {
      await window.desktopLocal.cancelScanLan();
      $("scan-status").textContent = `搜索已停止，保留已发现的 ${this.devices.length} 台设备。`;
    } catch (e) {
      $("scan-status").textContent = e.message || String(e);
    } finally {
      $("scan-stop").disabled = false;
    }
  },

  async addList(list) {
    if (this.adding || this.running || !list.length) return;
    this.adding = true;
    this.render();
    $("scan-result").classList.remove("error");
    $("scan-result").textContent = "正在验证并添加设备…";
    let added = 0;
    let existed = 0;
    let failed = 0;
    const errors = [];
    for (const item of list) {
      if (isSavedDevice(item)) {
        existed++;
        continue;
      }
      const ok = await addDevice(item.ip, item.port || 11019, { quiet: true, keepOpen: true });
      if (ok) added++;
      else {
        failed++;
        errors.push(`${item.ip}:${item.port || 11019}`);
      }
    }
    this.selected.clear();
    this.adding = false;
    this.render();
    $("scan-result").textContent = [
      `成功添加 ${added} 台 · 已存在 ${existed} 台 · 连接失败 ${failed} 台`,
      ...errors.map((e) => `失败：${e}`),
    ].join("\n");
    if (failed) $("scan-result").classList.add("error");
  },
};

async function addDevice(ip, port, { quiet = false, keepOpen = false } = {}) {
  if (!quiet) setManagementStatus("正在连接…");
  const existing = state.devices.find((d) => d.ip === ip && Number(d.port) === Number(port));
  const device =
    existing ||
    ({
      id: uid(),
      name: ip,
      ip,
      port: Number(port) || 11019,
      order: state.devices.length + 1,
      deviceId: "",
      alias: "",
      remark: "",
      phoneName: "",
    });
  const result = await probeDevice(device);
  if (!result.ok) {
    if (!quiet) setManagementStatus(result.error || "添加失败", true);
    return false;
  }
  if (!existing) state.devices.push(device);
  saveStore();
  if (!quiet) setManagementStatus(`已添加 ${device.name}`);
  renderAll();
  if (!keepOpen && !quiet) setTimeout(() => $("management").close(), 400);
  return true;
}

function openDeleteDialog() {
  const list = state.devices.filter((d) => state.selected.has(d.id));
  $("delete-device-count").textContent = `本次将删除 ${list.length} 台设备`;
  $("confirm-delete-devices").textContent = `删除 ${list.length} 台设备`;
  const ul = $("delete-device-list");
  ul.replaceChildren();
  for (const d of list) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${escapeHtml(displayName(d))}</strong><span>${escapeHtml(d.ip)}:${d.port}</span>`;
    ul.appendChild(li);
  }
  $("delete-devices-dialog").showModal();
}

function confirmDelete() {
  const ids = new Set(state.selected);
  for (const id of ids) {
    state.sessions.get(id)?.close();
    state.sessions.delete(id);
    state.online.delete(id);
  }
  state.devices = state.devices.filter((d) => !ids.has(d.id));
  state.selected.clear();
  saveStore();
  $("delete-devices-dialog").close();
  renderAll();
}

function rememberOpenWindow(device, open) {
  const ip = String(device.ip || "");
  const port = Number(device.port) || 11019;
  if (!ip) return;
  const mode = state.prefs.orientation === "portrait" ? "portrait" : "landscape";
  const next = (state.prefs.openWindows || []).filter(
    (w) => !(w.ip === ip && Number(w.port) === port)
  );
  if (open) {
    next.push({
      ip,
      port,
      name: displayName(device),
      deviceId: String(device.deviceId || ""),
      mode,
    });
  }
  state.prefs.openWindows = next;
  saveStore();
}

function openDeviceWindow(device) {
  const mode = state.prefs.orientation === "portrait" ? "portrait" : "landscape";
  rememberOpenWindow(device, true);
  window.desktopLocal?.openDeviceWindow?.({
    id: device.id,
    ip: device.ip,
    port: device.port,
    name: displayName(device),
    deviceId: device.deviceId,
    // 与官方一致：跟设备墙横/竖屏偏好打开独立窗
    mode,
  });
}

function restoreOpenWindows() {
  const list = Array.isArray(state.prefs.openWindows) ? [...state.prefs.openWindows] : [];
  for (const w of list) {
    const saved = state.devices.find((d) => d.ip === w.ip && Number(d.port) === Number(w.port || 11019));
    window.desktopLocal?.openDeviceWindow?.({
      id: saved?.id,
      ip: w.ip,
      port: w.port || 11019,
      name: saved ? displayName(saved) : w.name || w.ip,
      deviceId: saved?.deviceId || w.deviceId || "",
      mode: w.mode === "portrait" ? "portrait" : state.prefs.orientation === "portrait" ? "portrait" : "landscape",
    });
  }
}

function suspendTile(deviceId) {
  const session = state.sessions.get(deviceId);
  if (!session) return;
  session.close();
  state.sessions.delete(deviceId);
}

let contextDeviceId = null;

function hideDeviceContextMenu() {
  const menu = $("device-context-menu");
  if (menu) menu.hidden = true;
}

function showDeviceContextMenu(ev, deviceId) {
  const device = state.devices.find((d) => d.id === deviceId);
  if (!device) return;
  ev.preventDefault();
  ev.stopPropagation();
  contextDeviceId = deviceId;
  const menu = $("device-context-menu");
  menu.hidden = false;
  const left = Math.max(8, Math.min((window.innerWidth || 1024) - 210, ev.clientX));
  const top = Math.max(8, Math.min((window.innerHeight || 768) - 100, ev.clientY));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  $("device-menu-preview").focus();
}

function openMetadataDialog(deviceId) {
  const device = state.devices.find((d) => d.id === deviceId);
  if (!device) return;
  contextDeviceId = deviceId;
  $("device-metadata-number").textContent = padOrder(device.order);
  $("device-alias").value = device.alias || "";
  $("device-remark").value = device.remark || "";
  $("device-metadata-id").textContent = device.deviceId || device.id || "—";
  $("device-metadata-address").textContent = `${device.ip}:${device.port}`;
  $("device-metadata-status").textContent = "";
  $("device-metadata-status").classList.remove("error");
  $("device-metadata-dialog").showModal();
  $("device-alias").focus();
}

async function openPreview(deviceId) {
  const device = state.devices.find((d) => d.id === deviceId);
  if (!device) return;
  closePreviewSession();
  suspendTile(device.id);

  const dlg = $("device-preview");
  const article = dlg.querySelector(".preview-device");
  article.dataset.deviceId = device.id;
  article.classList.remove("is-landscape");
  dlg.querySelector(".preview-number").textContent = padOrder(device.order);
  dlg.querySelector(".preview-name").textContent = displayName(device);
  const statusEl = dlg.querySelector(".preview-status");
  statusEl.textContent = state.online.has(device.id) ? "在线" : "离线";
  statusEl.classList.toggle("online", state.online.has(device.id));
  $("preview-device-id").textContent = device.deviceId || device.id;
  $("preview-address").textContent = `${device.ip}:${device.port}`;
  $("device-order").value = String(device.order);
  $("preview-resolution").textContent = "—";
  $("preview-fps").textContent = "—";
  $("preview-rtt").textContent = "—";
  $("preview-placeholder").hidden = false;
  $("preview-control").disabled = true;
  $("preview-home").disabled = true;
  dlg.querySelector(".control-status").textContent = "等待画面后可开启控制";
  dlg.querySelector(".preview-stream-state").textContent = "正在连接画面";
  setPreviewOrientation("portrait");
  dlg.showModal();

  let online = state.online.get(device.id);
  if (!online) {
    const r = await probeDevice(device);
    if (!r.ok) {
      dlg.querySelector(".preview-stream-state").textContent = r.error || "离线";
      renderAll();
      return;
    }
    online = state.online.get(device.id);
    renderAll();
  }

  $("preview-rtt").textContent = online.rtt != null ? `${online.rtt} ms` : "—";
  const canvas = $("preview-canvas");
  const controlBtn = $("preview-control");
  let controlling = false;
  let control = null;
  let fpsTimer = null;
  let lastFrames = 0;

  const session = new VideoSession({
    canvas,
    getProfile: () => {
      const w = canvas.parentElement?.clientWidth || state.prefs.zoom || 320;
      return wallProfileFromSize(w, state.prefs.lowUsage);
    },
    onFrameTs: (ts) => control?.setFrameTs(ts),
    onFirstFrame: () => {
      $("preview-placeholder").hidden = true;
      controlBtn.disabled = false;
      dlg.querySelector(".preview-stream-state").textContent = "画面已连接";
      dlg.querySelector(".control-status").textContent = "可开启控制";
      const g = online.info;
      const w = g.width || g.geometry?.width;
      const h = g.height || g.geometry?.height;
      if (w && h) $("preview-resolution").textContent = `${w}×${h}`;
    },
    onStatus: (t) => {
      dlg.querySelector(".preview-stream-state").textContent = t;
    },
    onError: (e) => {
      dlg.querySelector(".preview-stream-state").textContent = e;
    },
  });

  fpsTimer = setInterval(() => {
    const n = session.player.frames;
    $("preview-fps").textContent = `${Math.max(0, n - lastFrames)} fps`;
    lastFrames = n;
    if (session.player.canvas.width && session.player.canvas.height) {
      $("preview-resolution").textContent = `${session.player.canvas.width}×${session.player.canvas.height}`;
    }
  }, 1000);

  const bindPointer = () => {
    const point = (ev, clamp) => {
      const fw = control?.geometry?.width || canvas.width;
      const fh = control?.geometry?.height || canvas.height;
      // 预览窗仅在用户点旋转菜单时 CSS rotate；横竖切换只改壳比例，不做 De 旋转变换
      const rot = ((Number(dlg.querySelector(".phone-shell")?.dataset.rotation || 0) % 360) + 360) % 360;
      return mapPointerCoords(
        canvas.getBoundingClientRect(),
        fw,
        fh,
        ev.clientX,
        ev.clientY,
        clamp,
        rot
      );
    };
    let pid = null;
    const moves = createPointerMoveScheduler((x, y) => control?.pointer?.("move", x, y));
    canvas.onpointerdown = (ev) => {
      if (!controlling || !control?.ready) return;
      const pt = point(ev, false);
      if (!pt) return;
      moves.clear();
      canvas.setPointerCapture(ev.pointerId);
      pid = ev.pointerId;
      control.pointer("down", pt.x, pt.y);
      ev.preventDefault();
    };
    canvas.onpointermove = (ev) => {
      if (pid !== ev.pointerId) return;
      const pt = point(ev, true);
      if (!pt) return;
      moves.move(pt.x, pt.y);
      ev.preventDefault();
    };
    const up = (ev) => {
      if (pid !== ev.pointerId) return;
      const pt = point(ev, true);
      moves.flush();
      if (pt) control.pointer("up", pt.x, pt.y);
      else moves.clear();
      pid = null;
    };
    canvas.onpointerup = up;
    canvas.onpointercancel = up;
  };

  controlBtn.onclick = async () => {
    if (controlling) {
      controlling = false;
      control?.close();
      control = null;
      canvas.classList.remove("touch-control");
      controlBtn.querySelector("span").textContent = "开始控制";
      dlg.querySelector(".control-status").textContent = "控制已关闭";
      dlg.querySelector(".control-status").classList.remove("controlling");
      $("preview-home").disabled = true;
      return;
    }
    controlBtn.disabled = true;
    try {
      control = new ControlClient({
        url: `${online.baseWs}/control`,
        onReady: () => {
          dlg.querySelector(".control-status").textContent = "控制中";
          dlg.querySelector(".control-status").classList.add("controlling");
        },
        onError: (e) => {
          dlg.querySelector(".control-status").textContent = String(e);
        },
      });
      await control.connect();
      controlling = true;
      canvas.classList.add("touch-control");
      controlBtn.querySelector("span").textContent = "结束控制";
      $("preview-home").disabled = false;
      bindPointer();
    } catch (e) {
      dlg.querySelector(".control-status").textContent = e.message || String(e);
    } finally {
      controlBtn.disabled = false;
    }
  };

  $("preview-home").onclick = () => control?.home();

  state.preview = {
    deviceId: device.id,
    session,
    control: () => control,
    cleanup: () => {
      clearInterval(fpsTimer);
      control?.close();
      session.close();
      canvas.classList.remove("touch-control");
      canvas.onpointerdown = null;
      canvas.onpointermove = null;
      canvas.onpointerup = null;
      canvas.onpointercancel = null;
    },
  };

  try {
    await session.open(online.baseWs);
  } catch (e) {
    dlg.querySelector(".preview-stream-state").textContent = e.message || String(e);
  }
}

function closePreviewSession() {
  const id = state.preview?.deviceId;
  state.preview?.cleanup?.();
  state.preview = null;
  if (id) {
    // 预览关闭后恢复墙卡流
    const tile = $("devices").querySelector(`[data-id="${id}"]`);
    const device = state.devices.find((d) => d.id === id);
    if (tile && device && state.online.has(id)) ensureTileSession(device, tile);
  }
}

function setPreviewOrientation(mode) {
  const article = $("device-preview").querySelector(".preview-device");
  const shell = article.querySelector(".phone-shell");
  article.classList.toggle("is-landscape", mode === "landscape");
  shell.dataset.presentation = mode;
  shell.dataset.orientation = mode;
  for (const btn of article.querySelectorAll(".preview-tools .orientation-button")) {
    const on = btn.dataset.orientation === mode;
    btn.classList.toggle("selected", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

// —— events ——
$("open-add").onclick = openAddDialog;
$("add-device-action").onclick = openAddDialog;
$("empty-add").onclick = openAddDialog;
$("refresh-devices").onclick = () => refreshAll();
$("device-panel-toggle").onclick = () => {
  state.prefs.devicePanelCollapsed = !state.prefs.devicePanelCollapsed;
  saveStore();
  syncDevicePanelCollapsed();
};
$("scan").onclick = () => discovery.open();
$("scan-start").onclick = () => discovery.start();
$("scan-stop").onclick = () => discovery.stop();
$("scan-select-all").onchange = () => {
  const on = $("scan-select-all").checked;
  for (const item of discovery.devices) {
    if (isSavedDevice(item)) continue;
    const key = deviceKey(item);
    if (on) discovery.selected.add(key);
    else discovery.selected.delete(key);
  }
  discovery.render();
};
$("scan-add-selected").onclick = () => {
  const list = discovery.devices.filter((d) => discovery.selected.has(deviceKey(d)) && !isSavedDevice(d));
  discovery.addList(list);
};
$("scan-add-all").onclick = () => {
  discovery.addList(discovery.devices.filter((d) => !isSavedDevice(d)));
};

for (const dlg of document.querySelectorAll("dialog")) {
  dlg.querySelectorAll(".close-dialog").forEach((btn) => {
    btn.addEventListener("click", () => dlg.close());
  });
}

$("connection-info").onclick = () => $("connection-dialog").showModal();
$("add-form").onsubmit = async (e) => {
  e.preventDefault();
  await addDevice($("phone-ip").value.trim(), $("phone-port").value.trim());
};

$("low-usage").onchange = () => {
  state.prefs.lowUsage = $("low-usage").checked;
  saveStore();
  updateModeStatus();
  for (const [id, session] of state.sessions) {
    if (!state.online.has(id)) continue;
    session.applyProfile(wallProfileSticky(state.prefs.zoom, state.prefs.lowUsage, session.streamProfile));
  }
};

$("tile-zoom").oninput = () => {
  const z = Number($("tile-zoom").value) || 274;
  state.prefs.zoom = z;
  $("zoom-value").textContent = String(z);
  document.documentElement.style.setProperty("--card-width", `${z}px`);
  $("devices").style.setProperty("--card-width", `${z}px`);
};
$("tile-zoom").onchange = () => {
  saveStore();
  for (const [id, session] of state.sessions) {
    if (!state.online.has(id)) continue;
    session.applyProfile(wallProfileSticky(state.prefs.zoom, state.prefs.lowUsage, session.streamProfile));
  }
};

$("wall-orientation").onclick = (e) => {
  const btn = e.target.closest("[data-wall-mode]");
  if (!btn) return;
  state.prefs.orientation = btn.dataset.wallMode;
  saveStore();
  for (const session of state.sessions.values()) {
    session.setPresentation?.(state.prefs.orientation);
  }
  renderWall();
};

$("tab-all").onclick = () => {
  state.prefs.tab = "all";
  saveStore();
  renderAll();
};
$("tab-online").onclick = () => {
  state.prefs.tab = "online";
  saveStore();
  renderAll();
};

$("status-filter").onchange = () => {
  state.prefs.statusFilter = $("status-filter").value;
  saveStore();
  renderAll();
};
$("sort-mode").onchange = () => {
  state.prefs.sortMode = $("sort-mode").value;
  saveStore();
  renderAll();
};
$("search").oninput = () => renderAll();

$("select-all").onchange = () => {
  const on = $("select-all").checked;
  for (const d of filteredDevices()) toggleSelect(d.id, on);
  renderAll();
};
$("clear-selection").onclick = () => {
  state.selected.clear();
  renderAll();
};
$("delete-selected").onclick = openDeleteDialog;
$("cancel-delete-devices").onclick = () => $("delete-devices-dialog").close();
$("confirm-delete-devices").onclick = confirmDelete;

$("device-menu-preview").onclick = () => {
  const id = contextDeviceId;
  hideDeviceContextMenu();
  if (id) openPreview(id);
};
$("device-menu-edit").onclick = () => {
  const id = contextDeviceId;
  hideDeviceContextMenu();
  if (id) openMetadataDialog(id);
};
document.addEventListener("pointerdown", (e) => {
  const menu = $("device-context-menu");
  if (!menu || menu.hidden) return;
  if (!menu.contains(e.target)) hideDeviceContextMenu();
});
$("device-context-menu").addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    hideDeviceContextMenu();
  }
});
$("device-metadata-reload").onclick = () => {
  const device = state.devices.find((d) => d.id === contextDeviceId);
  if (!device) return;
  $("device-alias").value = "";
  $("device-metadata-status").textContent = device.phoneName
    ? `将使用手机名称「${device.phoneName}」`
    : "将使用手机默认名称（保存后生效）";
  $("device-metadata-status").classList.remove("error");
};
$("device-metadata-form").onsubmit = (e) => {
  e.preventDefault();
  const device = state.devices.find((d) => d.id === contextDeviceId);
  if (!device) return;
  device.alias = $("device-alias").value.trim();
  device.remark = $("device-remark").value.trim();
  applyDisplayName(device);
  saveStore();
  renderAll();
  $("device-metadata-status").textContent = "已保存到本机";
  $("device-metadata-status").classList.remove("error");
  setTimeout(() => $("device-metadata-dialog").close(), 280);
};

/** 官方批量操作：重连 / 方向 / 墙画质 / 主控同步点击 */
const batch = {
  targets: [],
  sourceId: null,
  session: null,
  controls: new Map(),
  running: false,
  busy: false,
  pointerId: null,

  selectedDevices() {
    return state.devices.filter((d) => state.selected.has(d.id)).slice(0, 20);
  },

  renderDeviceStatus() {
    const host = $("batch-device-status");
    host.replaceChildren();
    for (const id of this.targets) {
      const d = state.devices.find((x) => x.id === id);
      const span = document.createElement("span");
      const online = state.online.has(id);
      const ctrl = this.controls.get(id);
      let label = d ? displayName(d) : id;
      if (this.running) {
        if (id === this.sourceId) label += " · 主控";
        if (ctrl?.ready) {
          span.classList.add("online");
          label += " · 控制就绪";
        } else if (ctrl) {
          span.classList.add("error");
          label += " · 控制中";
        } else if (!online) {
          span.classList.add("error");
          label += " · 离线";
        }
      } else if (online) {
        span.classList.add("online");
        label += " · 在线";
      } else {
        label += " · 离线";
      }
      span.textContent = label;
      host.appendChild(span);
    }
  },

  stop() {
    this.running = false;
    this.pointerId = null;
    const canvas = $("batch-canvas");
    canvas.onpointerdown = null;
    canvas.onpointermove = null;
    canvas.onpointerup = null;
    canvas.onpointercancel = null;
    this.session?.close();
    this.session = null;
    for (const c of this.controls.values()) c.close();
    this.controls.clear();
    this.sourceId = null;
    $("batch-canvas-stage").hidden = true;
    $("batch-start").disabled = this.targets.length < 1;
    $("batch-stop").disabled = true;
    $("batch-home").disabled = true;
    $("batch-state-badge").textContent = "未启动";
    $("batch-state-badge").classList.remove("active");
    $("batch-status").textContent = "同步未启动";
    for (const id of this.targets) {
      const d = state.devices.find((x) => x.id === id);
      const tile = $("devices").querySelector(`[data-id="${id}"]`);
      if (d && tile && state.online.has(id) && state.preview?.deviceId !== id) ensureTileSession(d, tile);
    }
    this.renderDeviceStatus();
  },

  open() {
    this.stop();
    this.targets = this.selectedDevices().map((d) => d.id);
    if (!this.targets.length) return;
    $("batch-selection-count").textContent = `已选择 ${this.targets.length} 台设备`;
    $("batch-operation-status").textContent = "";
    $("batch-orientation").value = state.prefs.orientation;
    const source = $("batch-source");
    source.replaceChildren();
    for (const id of this.targets) {
      const d = state.devices.find((x) => x.id === id);
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = `${d ? displayName(d) : id}${state.online.has(id) ? "" : "（离线）"}`;
      source.appendChild(opt);
    }
    $("batch-start").disabled = this.targets.length < 1;
    this.renderDeviceStatus();
    $("batch-dialog").showModal();
  },

  bindPointer(canvas) {
    const point = (ev, clamp) =>
      mapPointerCoords(
        canvas.getBoundingClientRect(),
        canvas.width,
        canvas.height,
        ev.clientX,
        ev.clientY,
        clamp,
        0
      );
    const fanout = (action, x, y) => {
      for (const c of this.controls.values()) {
        if (c.ready) c.pointer(action, x, y);
      }
    };
    this._batchMoves?.clear?.();
    this._batchMoves = createPointerMoveScheduler((x, y) => fanout("move", x, y));
    canvas.onpointerdown = (ev) => {
      if (!this.running) return;
      const pt = point(ev, false);
      if (!pt) return;
      this._batchMoves.clear();
      canvas.setPointerCapture(ev.pointerId);
      this.pointerId = ev.pointerId;
      fanout("down", pt.x, pt.y);
      ev.preventDefault();
    };
    canvas.onpointermove = (ev) => {
      if (this.pointerId !== ev.pointerId) return;
      const pt = point(ev, true);
      if (!pt) return;
      this._batchMoves.move(pt.x, pt.y);
      ev.preventDefault();
    };
    const up = (ev) => {
      if (this.pointerId !== ev.pointerId) return;
      const pt = point(ev, true);
      this._batchMoves.flush();
      if (pt) fanout("up", pt.x, pt.y);
      else this._batchMoves.clear();
      this.pointerId = null;
    };
    canvas.onpointerup = up;
    canvas.onpointercancel = up;
  },

  async start() {
    if (this.busy || this.running) return;
    const sourceId = $("batch-source").value;
    if (!this.targets.includes(sourceId)) {
      $("batch-status").textContent = "请选择主控设备";
      return;
    }
    const online = state.online.get(sourceId);
    if (!online) {
      $("batch-status").textContent = "主控设备离线，请先重新连接";
      return;
    }
    this.busy = true;
    $("batch-start").disabled = true;
    $("batch-status").textContent = "正在连接批量控制…";
    try {
      for (const id of this.targets) suspendTile(id);
      this.sourceId = sourceId;
      this.running = true;
      const canvas = $("batch-canvas");
      $("batch-canvas-stage").hidden = false;
      this.session = new VideoSession({
        canvas,
        getProfile: () => ({ profile: "foreground" }),
        presentation: state.prefs.orientation,
        onFrameTs: (ts) => {
          for (const c of this.controls.values()) c.setFrameTs(ts);
        },
        onFirstFrame: () => {
          $("batch-status").textContent = "主控画面已连接 · 可同步点击";
        },
        onStatus: (t) => {
          if (this.running) $("batch-status").textContent = t;
        },
        onError: (e) => {
          if (this.running) $("batch-status").textContent = String(e);
        },
      });
      await this.session.open(online.baseWs);

      for (const id of this.targets) {
        const info = state.online.get(id);
        if (!info) continue;
        const control = new ControlClient({
          url: `${info.baseWs}/control`,
          onReady: () => this.renderDeviceStatus(),
          onError: () => this.renderDeviceStatus(),
        });
        this.controls.set(id, control);
        try {
          await control.connect();
        } catch {
          /* status chip shows not ready */
        }
      }
      this.bindPointer(canvas);
      $("batch-stop").disabled = false;
      $("batch-home").disabled = false;
      $("batch-state-badge").textContent = "同步中";
      $("batch-state-badge").classList.add("active");
      $("batch-status").textContent = "批量同步已启动";
      this.renderDeviceStatus();
    } catch (e) {
      $("batch-status").textContent = e.message || String(e);
      this.stop();
    } finally {
      this.busy = false;
      $("batch-start").disabled = this.running || this.targets.length < 1;
    }
  },
};

$("batch-actions").onclick = () => batch.open();
$("batch-dialog").addEventListener("close", () => batch.stop());
$("batch-stop").onclick = () => batch.stop();
$("batch-home").onclick = () => {
  for (const c of batch.controls.values()) c.home();
};
$("batch-start").onclick = () => batch.start();
$("batch-reconnect").onclick = async () => {
  batch.stop();
  $("batch-operation-status").textContent = "正在重新连接…";
  const ids = new Set(batch.targets);
  await Promise.all(
    state.devices
      .filter((d) => ids.has(d.id))
      .map(async (d) => {
        try {
          await probeDevice(d);
        } catch {
          state.online.delete(d.id);
        }
      })
  );
  renderAll();
  batch.renderDeviceStatus();
  $("batch-operation-status").textContent = "已刷新选中设备状态并重新连接画面。";
};
$("batch-apply-orientation").onclick = () => {
  batch.stop();
  const mode = $("batch-orientation").value === "portrait" ? "portrait" : "landscape";
  state.prefs.orientation = mode;
  saveStore();
  for (const session of state.sessions.values()) {
    session.player?.setPresentation?.(mode);
  }
  renderAll();
  $("batch-operation-status").textContent = `已设置设备墙显示为${mode === "portrait" ? "竖屏" : "横屏"}（新开独立窗会跟随）。`;
};
$("batch-apply-video").onclick = async () => {
  const fps = Number($("batch-frame-rate").value);
  const bitrate = Number($("batch-bitrate").value);
  if (!Number.isInteger(bitrate) || bitrate < 1 || bitrate > 20) {
    $("batch-operation-status").textContent = "码率请输入 1–20 的整数。";
    return;
  }
  batch.stop();
  $("batch-apply-video").disabled = true;
  const frameRate = fps >= 20 ? 20 : 15;
  const maxDimension = bitrate >= 8 ? 768 : bitrate >= 4 ? 512 : 384;
  let ok = 0;
  for (const id of batch.targets) {
    const d = state.devices.find((x) => x.id === id);
    if (!d) continue;
    d.wallOverride = { profile: "wall", maxDimension, frameRate, lowUsage: false };
    // 对齐官方：下发 /api/video-settings（默认档）+ 墙流 WS query
    try {
      await fetch(`http://${d.ip}:${d.port || 11019}/api/video-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frameRate,
          bitrateMbps: bitrate,
          maxDimension,
          profile: "wall",
        }),
      });
    } catch {
      /* 旧包无路由时仍靠 wall query */
    }
    const session = state.sessions.get(id);
    const tile = $("devices").querySelector(`[data-id="${id}"]`);
    if (session && state.online.has(id)) {
      await session.applyProfile(d.wallOverride);
    } else if (tile && state.online.has(id)) {
      ensureTileSession(d, tile);
    }
    ok += 1;
    $("batch-operation-status").textContent = `正在应用画质 ${ok} / ${batch.targets.length}`;
  }
  $("batch-apply-video").disabled = false;
  $("batch-operation-status").textContent =
    `已对 ${ok} 台应用设备墙画质（${maxDimension}p · ${frameRate} fps · ${bitrate}Mbps）。`;
};

$("close-preview").onclick = () => {
  closePreviewSession();
  $("device-preview").close();
};
$("device-preview").addEventListener("close", () => closePreviewSession());

$("device-preview").querySelector(".preview-tools").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-orientation]");
  if (!btn) return;
  setPreviewOrientation(btn.dataset.orientation);
});

$("rotate-preview").onclick = (e) => {
  e.stopPropagation();
  const menu = $("rotation-preview-menu");
  menu.hidden = !menu.hidden;
  $("rotate-preview").setAttribute("aria-expanded", menu.hidden ? "false" : "true");
};
$("rotation-preview-menu").onclick = (e) => {
  const item = e.target.closest("[data-rotation]");
  if (!item) return;
  const shell = $("device-preview").querySelector(".phone-shell");
  const canvas = $("preview-canvas");
  const v = item.dataset.rotation;
  let deg = 0;
  if (v === "90") deg = 90;
  else if (v === "-90") deg = 270;
  else if (v === "180") deg = 180;
  canvas.style.transform = deg ? `translate(-50%, -50%) rotate(${deg}deg)` : "translate(-50%, -50%)";
  $("rotation-preview-menu").querySelector(".rotation-menu-status").textContent = `当前 ${deg}°`;
  shell.dataset.rotation = String(deg);
  $("rotation-preview-menu").hidden = true;
};

$("save-device-order").onclick = () => {
  const id = state.preview?.deviceId;
  const d = state.devices.find((x) => x.id === id);
  if (!d) return;
  d.order = Math.max(1, Number($("device-order").value) || 1);
  saveStore();
  renderAll();
  $("device-preview").querySelector(".preview-number").textContent = padOrder(d.order);
};

$("copy-device-id").onclick = async () => {
  const text = $("preview-device-id").textContent || "";
  try {
    await navigator.clipboard.writeText(text);
  } catch {}
};

$("preview-remove").onclick = () => {
  const id = state.preview?.deviceId;
  if (!id) return;
  state.selected.clear();
  state.selected.add(id);
  closePreviewSession();
  $("device-preview").close();
  openDeleteDialog();
};

$("preview-open-window").onclick = () => {
  const id = state.preview?.deviceId;
  const d = state.devices.find((x) => x.id === id);
  if (d) openDeviceWindow(d);
};

$("wall-scroll").addEventListener(
  "wheel",
  (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -12 : 12;
    const next = Math.min(420, Math.max(96, state.prefs.zoom + delta));
    state.prefs.zoom = next;
    $("tile-zoom").value = String(next);
    $("zoom-value").textContent = String(next);
    document.documentElement.style.setProperty("--card-width", `${next}px`);
    saveStore();
  },
  { passive: false }
);

window.desktopLocal?.onDeviceWindowClosed?.((payload) => {
  const ip = String(payload?.ip || "");
  const port = Number(payload?.port) || 11019;
  if (!ip) return;
  rememberOpenWindow({ ip, port }, false);
});

updateModeStatus();
renderAll();
refreshAll({ quiet: true }).then(() => restoreOpenWindows());
