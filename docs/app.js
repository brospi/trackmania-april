const PLAYERS = {
  "ffbe6f24-3880-482a-a469-cdbf08eb9372": "Thibault",
  "d0fbaef3-fbce-440f-9c26-5a62694feb62": "Pierre",
};
const SLUG = {
  "ffbe6f24-3880-482a-a469-cdbf08eb9372": "thibault",
  "d0fbaef3-fbce-440f-9c26-5a62694feb62": "pierre",
};
const COLORS = {
  "ffbe6f24-3880-482a-a469-cdbf08eb9372": "#ef4444",
  "d0fbaef3-fbce-440f-9c26-5a62694feb62": "#3b82f6",
};

if (window.Chart) {
  Chart.defaults.color = "#8891a4";
  Chart.defaults.borderColor = "#2a3248";
  Chart.defaults.font.family =
    "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif";
}

async function loadData() {
  const [snapshots, maps] = await Promise.all([
    fetch("data/snapshots.json").then((r) => r.json()),
    fetch("data/maps.json").then((r) => r.json()),
  ]);
  return { snapshots, maps };
}

function fmtTime(ms) {
  if (ms == null) return "—";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  return `${m}:${s.toString().padStart(2, "0")}.${r.toString().padStart(3, "0")}`;
}

function fmtDate(iso) {
  return iso.replace("T", " ").replace(/\+.*$/, "").replace(/:\d\d$/, "");
}

function playerPBs(snapshots) {
  const pb = {};
  for (const s of snapshots) {
    pb[s.map_uid] ??= {};
    for (const [pid, t] of Object.entries(s.times)) {
      if (t != null && (pb[s.map_uid][pid] == null || t < pb[s.map_uid][pid])) {
        pb[s.map_uid][pid] = t;
      }
    }
  }
  return pb;
}

function mapDisplay(uid, name) {
  return name || uid.slice(0, 8);
}

function sortedUids(maps) {
  return Object.keys(maps).sort((a, b) =>
    mapDisplay(a, maps[a]).localeCompare(mapDisplay(b, maps[b]), undefined, {
      numeric: true,
    }),
  );
}

function renderDashboard({ snapshots, maps }) {
  const pb = playerPBs(snapshots);
  const counts = Object.fromEntries(Object.keys(PLAYERS).map((p) => [p, 0]));
  for (const times of Object.values(pb)) {
    for (const pid of Object.keys(PLAYERS)) if (times[pid] != null) counts[pid]++;
  }

  const summary = document.getElementById("summary");
  summary.innerHTML = `
    <div class="stat-card">
      <div class="label">Maps tracked</div>
      <div class="value">${Object.keys(maps).length}</div>
    </div>
    <div class="stat-card">
      <div class="label">Change events</div>
      <div class="value">${snapshots.length}</div>
    </div>
    ${Object.entries(PLAYERS)
      .map(
        ([pid, name]) => `
      <div class="stat-card ${SLUG[pid]}">
        <div class="label">${name} · PBs</div>
        <div class="value">${counts[pid]}</div>
      </div>`,
      )
      .join("")}
  `;

  const recent = snapshots.slice(-10).reverse();
  const head = `
    <thead><tr>
      <th>When</th>
      <th>Map</th>
      ${Object.values(PLAYERS)
        .map((n) => `<th class="time">${n}</th>`)
        .join("")}
    </tr></thead>`;
  const body = recent.length
    ? recent
        .map(
          (s) => `<tr>
            <td class="muted">${fmtDate(s.ts)}</td>
            <td><span class="map-name">${mapDisplay(s.map_uid, maps[s.map_uid])}</span></td>
            ${Object.keys(PLAYERS)
              .map(
                (pid) =>
                  `<td class="time player-${SLUG[pid]}">${fmtTime(s.times[pid])}</td>`,
              )
              .join("")}
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="4"><div class="empty">No changes recorded yet.</div></td></tr>`;
  document.getElementById("recent").innerHTML = head + `<tbody>${body}</tbody>`;
}

function renderMap({ snapshots, maps }) {
  const picker = document.getElementById("map-picker");
  const meta = document.getElementById("map-meta");
  const canvas = document.getElementById("chart");
  const uids = sortedUids(maps);
  picker.innerHTML = uids
    .map(
      (uid) => `<option value="${uid}">${mapDisplay(uid, maps[uid])}</option>`,
    )
    .join("");

  let chart = null;

  function draw(uid) {
    const entries = snapshots.filter((s) => s.map_uid === uid);
    const labels = entries.map((s) => fmtDate(s.ts));
    const datasets = Object.entries(PLAYERS).map(([pid, name]) => ({
      label: name,
      borderColor: COLORS[pid],
      backgroundColor: COLORS[pid] + "33",
      pointBackgroundColor: COLORS[pid],
      pointBorderColor: COLORS[pid],
      pointRadius: 4,
      pointHoverRadius: 6,
      borderWidth: 2.5,
      tension: 0.15,
      data: entries.map((s) => s.times[pid] ?? null),
      spanGaps: true,
    }));

    chart?.destroy();
    chart = new Chart(canvas, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          y: {
            reverse: true,
            ticks: { callback: (v) => fmtTime(v) },
            grid: { color: "rgba(255,255,255,0.04)" },
          },
          x: {
            grid: { display: false },
            ticks: { maxRotation: 0, autoSkipPadding: 20 },
          },
        },
        plugins: {
          legend: {
            labels: { usePointStyle: true, pointStyle: "circle", padding: 16 },
          },
          tooltip: {
            backgroundColor: "#151b2c",
            borderColor: "#2a3248",
            borderWidth: 1,
            padding: 10,
            titleColor: "#e6e9f0",
            bodyColor: "#e6e9f0",
            callbacks: {
              label: (c) =>
                `${c.dataset.label}: ${c.parsed.y == null ? "—" : fmtTime(c.parsed.y)}`,
            },
          },
        },
      },
    });

    const current = entries.length ? entries[entries.length - 1] : null;
    const pb = playerPBs(snapshots)[uid] || {};
    meta.innerHTML = `
      <div class="field"><span class="label">Snapshots</span><span class="value">${entries.length}</span></div>
      <div class="field"><span class="label">Last update</span><span class="value">${current ? fmtDate(current.ts) : "—"}</span></div>
      ${Object.entries(PLAYERS)
        .map(
          ([pid, name]) =>
            `<div class="field"><span class="label">${name} · PB</span><span class="value player-${SLUG[pid]}">${fmtTime(pb[pid])}</span></div>`,
        )
        .join("")}
      <div class="field"><span class="label">UID</span><span class="value uid">${uid}</span></div>
    `;
  }

  picker.addEventListener("change", () => draw(picker.value));
  if (uids.length) draw(uids[0]);
  else
    meta.innerHTML = `<div class="empty">No maps tracked yet.</div>`;
}

function renderLeaderboard({ snapshots, maps }) {
  const pb = playerPBs(snapshots);
  const pids = Object.keys(PLAYERS);
  const head = `
    <thead><tr>
      <th>Map</th>
      ${pids.map((p) => `<th class="time">${PLAYERS[p]}</th>`).join("")}
      <th class="time">Δ</th>
    </tr></thead>`;

  const rows = sortedUids(maps).map((uid) => {
    const t = pids.map((p) => pb[uid]?.[p] ?? null);
    const deltaRaw = t[0] != null && t[1] != null ? Math.abs(t[0] - t[1]) : null;
    const delta = deltaRaw != null ? fmtTime(deltaRaw) : "—";
    const winnerIdx =
      t[0] != null && t[1] != null ? (t[0] < t[1] ? 0 : 1) : -1;
    return `<tr data-name="${(maps[uid] || uid).toLowerCase()}">
      <td><span class="map-name">${mapDisplay(uid, maps[uid])}</span></td>
      ${t
        .map((x, i) => {
          const cls =
            i === winnerIdx
              ? `time winner ${SLUG[pids[i]]}`
              : `time player-${SLUG[pids[i]]}`;
          return `<td class="${cls}">${fmtTime(x)}</td>`;
        })
        .join("")}
      <td class="time muted">${delta}</td>
    </tr>`;
  });

  document.getElementById("leaderboard").innerHTML =
    head + `<tbody>${rows.join("")}</tbody>`;

  const filter = document.getElementById("filter");
  filter?.addEventListener("input", () => {
    const q = filter.value.toLowerCase().trim();
    document.querySelectorAll("#leaderboard tbody tr").forEach((tr) => {
      tr.style.display =
        !q || tr.dataset.name.includes(q) ? "" : "none";
    });
  });
}

const RENDERERS = {
  dashboard: renderDashboard,
  map: renderMap,
  leaderboard: renderLeaderboard,
};

loadData().then((data) => {
  const page = document.body.dataset.page;
  RENDERERS[page]?.(data);
});
