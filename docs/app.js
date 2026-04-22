const PLAYERS = {
  "ffbe6f24-3880-482a-a469-cdbf08eb9372": "Thibault",
  "d0fbaef3-fbce-440f-9c26-5a62694feb62": "Pierre",
};
const PLAYER_COLOR = {
  "ffbe6f24-3880-482a-a469-cdbf08eb9372": "#c0392b",
  "d0fbaef3-fbce-440f-9c26-5a62694feb62": "#2980b9",
};

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

function mapLabel(uid, name) {
  const short = uid.slice(0, 8);
  return name ? `${name} (${short})` : short;
}

function renderDashboard({ snapshots, maps }) {
  const pb = playerPBs(snapshots);
  const mapCount = Object.keys(maps).length;
  const counts = Object.fromEntries(Object.keys(PLAYERS).map((p) => [p, 0]));
  for (const times of Object.values(pb)) {
    for (const pid of Object.keys(PLAYERS)) if (times[pid] != null) counts[pid]++;
  }
  const rows = Object.entries(PLAYERS)
    .map(([pid, name]) => `<li>${name}: ${counts[pid]} PBs</li>`)
    .join("");
  document.getElementById("summary").innerHTML = `
    <p><strong>${mapCount}</strong> maps tracked, <strong>${snapshots.length}</strong> change events.</p>
    <ul>${rows}</ul>
  `;

  const recent = snapshots.slice(-5).reverse();
  const th = `<tr><th>When</th><th>Map</th>${Object.values(PLAYERS)
    .map((n) => `<th>${n}</th>`)
    .join("")}</tr>`;
  const body = recent
    .map(
      (s) =>
        `<tr><td>${s.ts}</td><td>${mapLabel(s.map_uid, maps[s.map_uid])}</td>${Object.keys(
          PLAYERS,
        )
          .map((pid) => `<td>${fmtTime(s.times[pid])}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  document.getElementById("recent").innerHTML = th + body;
}

function renderMap({ snapshots, maps }) {
  const picker = document.getElementById("map-picker");
  const uids = Object.keys(maps).sort((a, b) =>
    (maps[a] || a).localeCompare(maps[b] || b),
  );
  picker.innerHTML = uids
    .map((uid) => `<option value="${uid}">${mapLabel(uid, maps[uid])}</option>`)
    .join("");

  const ctx = document.getElementById("chart");
  let chart = null;

  function draw(uid) {
    const entries = snapshots.filter((s) => s.map_uid === uid);
    const datasets = Object.entries(PLAYERS).map(([pid, name]) => ({
      label: name,
      borderColor: PLAYER_COLOR[pid],
      backgroundColor: PLAYER_COLOR[pid],
      data: entries.map((s) => ({ x: s.ts, y: s.times[pid] ?? null })),
      spanGaps: true,
    }));
    chart?.destroy();
    chart = new Chart(ctx, {
      type: "line",
      data: { datasets },
      options: {
        parsing: false,
        scales: {
          x: { type: "category", labels: entries.map((s) => s.ts) },
          y: { reverse: true, ticks: { callback: (v) => fmtTime(v) } },
        },
        plugins: {
          tooltip: {
            callbacks: { label: (c) => `${c.dataset.label}: ${fmtTime(c.parsed.y)}` },
          },
        },
      },
    });
  }

  picker.addEventListener("change", () => draw(picker.value));
  if (uids.length) draw(uids[0]);
}

function renderLeaderboard({ snapshots, maps }) {
  const pb = playerPBs(snapshots);
  const pids = Object.keys(PLAYERS);
  const header =
    `<tr><th>Map</th>` +
    pids.map((p) => `<th>${PLAYERS[p]}</th>`).join("") +
    `<th>Δ</th></tr>`;
  const rows = Object.keys(maps)
    .sort((a, b) => (maps[a] || a).localeCompare(maps[b] || b))
    .map((uid) => {
      const t = pids.map((p) => pb[uid]?.[p] ?? null);
      const delta =
        t[0] != null && t[1] != null ? fmtTime(Math.abs(t[0] - t[1])) : "—";
      return `<tr><td>${mapLabel(uid, maps[uid])}</td>${t
        .map((x) => `<td>${fmtTime(x)}</td>`)
        .join("")}<td>${delta}</td></tr>`;
    })
    .join("");
  document.getElementById("leaderboard").innerHTML = header + rows;
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
