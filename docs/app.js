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
const PID_T = "ffbe6f24-3880-482a-a469-cdbf08eb9372";
const PID_P = "d0fbaef3-fbce-440f-9c26-5a62694feb62";

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

function mapName(entry, uid) {
  if (entry && typeof entry === "object" && entry.name) return entry.name;
  if (typeof entry === "string" && entry) return entry;
  return uid.slice(0, 8);
}

function medalOf(ms, map) {
  if (ms == null || !map) return null;
  if (map.authorScore != null && ms <= map.authorScore) return "author";
  if (map.goldScore != null && ms <= map.goldScore) return "gold";
  if (map.silverScore != null && ms <= map.silverScore) return "silver";
  if (map.bronzeScore != null && ms <= map.bronzeScore) return "bronze";
  return "none";
}

function medalDot(medal) {
  if (!medal) return "";
  return `<span class="medal-dot ${medal}" title="${medal}"></span>`;
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

function computeLeads(pb, uids) {
  let t = 0, p = 0, tied = 0, compared = 0;
  for (const uid of uids) {
    const x = pb[uid] || {};
    const tt = x[PID_T], pp = x[PID_P];
    if (tt == null || pp == null) continue;
    compared++;
    if (tt < pp) t++;
    else if (pp < tt) p++;
    else tied++;
  }
  return { t, p, tied, compared, total: uids.length };
}

function medalCounts(pb, uids, maps) {
  const counts = {
    [PID_T]: { author: 0, gold: 0, silver: 0, bronze: 0 },
    [PID_P]: { author: 0, gold: 0, silver: 0, bronze: 0 },
  };
  for (const uid of uids) {
    const times = pb[uid] || {};
    for (const pid of [PID_T, PID_P]) {
      const med = medalOf(times[pid], maps[uid]);
      if (med && med !== "none") counts[pid][med]++;
    }
  }
  return counts;
}

function parseCampaign(name) {
  const m = /^(.+?)\s*-\s*(\d+)$/.exec(name || "");
  if (!m) return { campaign: "Other", index: null };
  return { campaign: m[1].trim(), index: parseInt(m[2], 10) };
}

function groupByCampaign(maps) {
  const groups = {};
  for (const [uid, entry] of Object.entries(maps)) {
    const { campaign, index } = parseCampaign(mapName(entry, uid));
    groups[campaign] ??= { name: campaign, uids: [] };
    groups[campaign].uids.push({ uid, index });
  }
  for (const g of Object.values(groups)) {
    g.uids.sort((a, b) => {
      if (a.index != null && b.index != null) return a.index - b.index;
      return 0;
    });
  }
  return groups;
}

function sortedUids(maps) {
  return Object.keys(maps).sort((a, b) =>
    mapName(maps[a], a).localeCompare(mapName(maps[b], b), undefined, {
      numeric: true,
    }),
  );
}

function h2hBar(lead, compact = false) {
  const total = lead.t + lead.tied + lead.p || 1;
  const tPct = (lead.t / total) * 100;
  const tiedPct = (lead.tied / total) * 100;
  const pPct = (lead.p / total) * 100;
  const label = compact
    ? ""
    : `<div class="legend"><span class="t">Thibault ${lead.t}</span><span>Tied ${lead.tied}</span><span class="p">Pierre ${lead.p}</span></div>`;
  if (compact) {
    return `
      <div class="h2h">
        <div class="seg thibault" style="flex: ${tPct || 0.001}">${lead.t ? `Thibault · ${lead.t}` : ""}</div>
        <div class="seg tied" style="flex: ${tiedPct || 0.001}">${lead.tied ? `Tied · ${lead.tied}` : ""}</div>
        <div class="seg pierre" style="flex: ${pPct || 0.001}">${lead.p ? `Pierre · ${lead.p}` : ""}</div>
      </div>`;
  }
  return `
    <div class="h2h">
      <div class="seg thibault" style="flex: ${tPct || 0.001}">${lead.t ? `Thibault · ${lead.t}` : ""}</div>
      <div class="seg tied" style="flex: ${tiedPct || 0.001}">${lead.tied ? `Tied · ${lead.tied}` : ""}</div>
      <div class="seg pierre" style="flex: ${pPct || 0.001}">${lead.p ? `Pierre · ${lead.p}` : ""}</div>
    </div>`;
}

function winnerPid(times) {
  const t = times[PID_T];
  const p = times[PID_P];
  if (t == null || p == null) return null;
  if (t < p) return PID_T;
  if (p < t) return PID_P;
  return null;
}

function medalsBar(counts, pid) {
  const c = counts[pid];
  return `
    <div class="medals-bar">
      <span class="medal-chip"><span class="medal-dot author"></span>${c.author}</span>
      <span class="medal-chip"><span class="medal-dot gold"></span>${c.gold}</span>
      <span class="medal-chip"><span class="medal-dot silver"></span>${c.silver}</span>
      <span class="medal-chip"><span class="medal-dot bronze"></span>${c.bronze}</span>
    </div>`;
}

function renderDashboard({ snapshots, maps }) {
  const pb = playerPBs(snapshots);
  const uids = Object.keys(maps);
  const lead = computeLeads(pb, uids);
  const medals = medalCounts(pb, uids, maps);
  const counts = { [PID_T]: 0, [PID_P]: 0 };
  for (const t of Object.values(pb)) {
    for (const pid of [PID_T, PID_P]) if (t[pid] != null) counts[pid]++;
  }

  document.getElementById("summary").innerHTML = `
    <div class="stat-card">
      <div class="label">Maps tracked</div>
      <div class="value">${uids.length}</div>
    </div>
    <div class="stat-card">
      <div class="label">Change events</div>
      <div class="value">${snapshots.length}</div>
    </div>
    <div class="stat-card thibault">
      <div class="label">Thibault · PBs</div>
      <div class="value">${counts[PID_T]}</div>
      ${medalsBar(medals, PID_T)}
    </div>
    <div class="stat-card pierre">
      <div class="label">Pierre · PBs</div>
      <div class="value">${counts[PID_P]}</div>
      ${medalsBar(medals, PID_P)}
    </div>
  `;

  const h2hHost = document.getElementById("h2h");
  if (h2hHost) h2hHost.innerHTML = h2hBar(lead);

  const recent = snapshots.slice(-10).reverse();
  const head = `
    <thead><tr>
      <th>When</th>
      <th>Map</th>
      ${[PID_T, PID_P].map((p) => `<th class="time">${PLAYERS[p]}</th>`).join("")}
    </tr></thead>`;
  const body = recent.length
    ? recent
        .map((s) => {
          const w = winnerPid(s.times);
          return `<tr>
            <td class="muted">${fmtDate(s.ts)}</td>
            <td><span class="map-name">${mapName(maps[s.map_uid], s.map_uid)}</span></td>
            ${[PID_T, PID_P]
              .map((pid) => {
                const cls =
                  pid === w
                    ? `time winner ${SLUG[pid]}`
                    : `time player-${SLUG[pid]}`;
                return `<td class="${cls}">${medalDot(medalOf(s.times[pid], maps[s.map_uid]))}${fmtTime(s.times[pid])}</td>`;
              })
              .join("")}
          </tr>`;
        })
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
      (uid) =>
        `<option value="${uid}">${mapName(maps[uid], uid)}</option>`,
    )
    .join("");

  let chart = null;

  function draw(uid) {
    const entries = snapshots.filter((s) => s.map_uid === uid);
    const labels = entries.map((s) => fmtDate(s.ts));
    const datasets = [PID_T, PID_P].map((pid) => ({
      label: PLAYERS[pid],
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

    const map = maps[uid] || {};
    const current = entries.length ? entries[entries.length - 1] : null;
    const pb = playerPBs(snapshots)[uid] || {};
    const winner = winnerPid(pb);
    const threshold = (kind, score) =>
      score != null
        ? `<span class="medal-chip"><span class="medal-dot ${kind}"></span>${fmtTime(score)}</span>`
        : "";

    meta.innerHTML = `
      <div class="field"><span class="label">Snapshots</span><span class="value">${entries.length}</span></div>
      <div class="field"><span class="label">Last update</span><span class="value">${current ? fmtDate(current.ts) : "—"}</span></div>
      ${[PID_T, PID_P]
        .map((pid) => {
          const cls =
            pid === winner
              ? `value player-${SLUG[pid]} winner ${SLUG[pid]}`
              : `value player-${SLUG[pid]}`;
          return `<div class="field"><span class="label">${PLAYERS[pid]} · PB</span><span class="${cls}">${medalDot(medalOf(pb[pid], map))}${fmtTime(pb[pid])}</span></div>`;
        })
        .join("")}
      <div class="field" style="flex: 1">
        <span class="label">Medal thresholds</span>
        <span class="value">
          <div class="medals-bar">
            ${threshold("author", map.authorScore)}
            ${threshold("gold", map.goldScore)}
            ${threshold("silver", map.silverScore)}
            ${threshold("bronze", map.bronzeScore)}
          </div>
        </span>
      </div>
      <div class="field"><span class="label">UID</span><span class="value uid">${uid}</span></div>
    `;
  }

  picker.addEventListener("change", () => draw(picker.value));
  if (uids.length) draw(uids[0]);
  else meta.innerHTML = `<div class="empty">No maps tracked yet.</div>`;
}

function renderLeaderboardInto(hostId, snapshots, maps, uids, { filterable = true } = {}) {
  const pb = playerPBs(snapshots);
  const lead = computeLeads(pb, uids);
  const host = document.getElementById(hostId);

  const h2h = document.getElementById("h2h");
  if (h2h) h2h.innerHTML = h2hBar(lead);

  const head = `
    <thead><tr>
      <th>Map</th>
      ${[PID_T, PID_P].map((p) => `<th class="time">${PLAYERS[p]}</th>`).join("")}
      <th class="time">Δ</th>
    </tr></thead>`;

  const rows = uids.map((uid) => {
    const map = maps[uid] || {};
    const t = [PID_T, PID_P].map((pid) => (pb[uid] || {})[pid] ?? null);
    const deltaRaw = t[0] != null && t[1] != null ? Math.abs(t[0] - t[1]) : null;
    const delta = deltaRaw != null ? fmtTime(deltaRaw) : "—";
    const winnerIdx = t[0] != null && t[1] != null ? (t[0] < t[1] ? 0 : 1) : -1;
    const pids = [PID_T, PID_P];
    return `<tr data-name="${(mapName(map, uid) || uid).toLowerCase()}">
      <td><span class="map-name">${mapName(map, uid)}</span></td>
      ${t
        .map((x, i) => {
          const cls =
            i === winnerIdx
              ? `time winner ${SLUG[pids[i]]}`
              : `time player-${SLUG[pids[i]]}`;
          return `<td class="${cls}">${medalDot(medalOf(x, map))}${fmtTime(x)}</td>`;
        })
        .join("")}
      <td class="time muted">${delta}</td>
    </tr>`;
  });

  host.innerHTML = head + `<tbody>${rows.join("")}</tbody>`;

  if (filterable) {
    const filter = document.getElementById("filter");
    filter?.addEventListener("input", () => {
      const q = filter.value.toLowerCase().trim();
      host.querySelectorAll("tbody tr").forEach((tr) => {
        tr.style.display = !q || tr.dataset.name.includes(q) ? "" : "none";
      });
    });
  }
}

function renderLeaderboard({ snapshots, maps }) {
  renderLeaderboardInto("leaderboard", snapshots, maps, sortedUids(maps));
}

function renderCampaigns({ snapshots, maps }) {
  const pb = playerPBs(snapshots);
  const groups = groupByCampaign(maps);
  const sorted = Object.values(groups).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );

  const host = document.getElementById("campaigns");
  host.innerHTML = sorted
    .map((g) => {
      const uids = g.uids.map((x) => x.uid);
      const lead = computeLeads(pb, uids);
      const total = lead.t + lead.tied + lead.p || 1;
      const tPct = (lead.t / total) * 100;
      const tiedPct = (lead.tied / total) * 100;
      const pPct = (lead.p / total) * 100;
      return `
        <a class="campaign-card" href="campaign.html?name=${encodeURIComponent(g.name)}">
          <div class="name">${g.name}</div>
          <div class="count">${uids.length} map${uids.length === 1 ? "" : "s"} · ${lead.compared} head-to-head</div>
          <div class="bar">
            <span class="t" style="width:${tPct}%"></span>
            <span class="tied" style="width:${tiedPct}%"></span>
            <span class="p" style="width:${pPct}%"></span>
          </div>
          <div class="legend">
            <span class="t">Thibault ${lead.t}</span>
            <span>Tied ${lead.tied}</span>
            <span class="p">Pierre ${lead.p}</span>
          </div>
        </a>`;
    })
    .join("");
}

function renderCampaignDetail({ snapshots, maps }) {
  const params = new URLSearchParams(location.search);
  const name = params.get("name") || "Other";
  const groups = groupByCampaign(maps);
  const group = groups[name];
  document.getElementById("campaign-name").textContent = name;

  if (!group) {
    document.getElementById("leaderboard").innerHTML =
      `<tbody><tr><td><div class="empty">Campaign "${name}" not found.</div></td></tr></tbody>`;
    return;
  }

  const uids = group.uids.map((x) => x.uid);
  renderLeaderboardInto("leaderboard", snapshots, maps, uids, {
    filterable: false,
  });

  const pb = playerPBs(snapshots);
  const medals = medalCounts(pb, uids, maps);
  document.getElementById("campaign-medals").innerHTML = `
    <div class="field"><span class="label">Maps</span><span class="value">${uids.length}</span></div>
    <div class="field"><span class="label">Thibault medals</span><span class="value">${medalsBar(medals, PID_T)}</span></div>
    <div class="field"><span class="label">Pierre medals</span><span class="value">${medalsBar(medals, PID_P)}</span></div>
  `;
}

const RENDERERS = {
  dashboard: renderDashboard,
  map: renderMap,
  leaderboard: renderLeaderboard,
  campaigns: renderCampaigns,
  campaign: renderCampaignDetail,
};

loadData().then((data) => {
  const page = document.body.dataset.page;
  RENDERERS[page]?.(data);
});
