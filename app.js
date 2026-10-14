const DEFAULT_COLUMNS = 2;

const rows = {
  location: document.getElementById("row-location"),
  volume: document.getElementById("row-volume"),
  cargo: document.getElementById("row-cargo"),
  fuelPrice: document.getElementById("row-fuel-price"),
  fuelGal: document.getElementById("row-fuel-gal"),
  fuelTotal: document.getElementById("row-fuel-total"),
  revenue: document.getElementById("row-revenue"),
  profit: document.getElementById("row-profit"),
};
const overallCell = document.getElementById("overall-profit");
const addButton = document.getElementById("add-location");
const chartEl = document.getElementById("chart");
const tooltip = document.getElementById("tooltip");
const saveButton = document.getElementById("save");
const savedEl = document.getElementById("saved");
const slidersEl = document.getElementById("sliders");
const compareEl = document.getElementById("compare");
const optimizeButton = document.getElementById("optimize");
const optimizeEl = document.getElementById("optimal");
const optimizeDialog = document.getElementById("optimize-dialog");

// The four inputs per location, shared by the table, the sliders and saved scenarios.
const FIELDS = [
  { key: "volume", inputClass: "volume-input", label: "Cargo volume", unit: "kg", fallbackMax: 10000 },
  { key: "cargo", inputClass: "cargo-input", label: "Cargo rate", unit: "$/kg", fallbackMax: 1 },
  { key: "fuelPrice", inputClass: "fuel-price-input", label: "Fuel price", unit: "$/gal", fallbackMax: 10 },
  { key: "fuelGal", inputClass: "fuel-gal-input", label: "Fuel volume", unit: "gal", fallbackMax: 1000 },
];

let nextId = 1;

// The first two columns are the origin and destination of the trip.
const defaultName = (id) => ({ 1: "Origin", 2: "Destination" })[id] || `Location ${id}`;

const money = (n) => (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amount = (n, unit) => n.toLocaleString("en-US", { maximumFractionDigits: 1 }) + " " + unit;
const kg = (n) => amount(n, "kg");
const gal = (n) => amount(n, "gal");

// ---------- Table ----------

function insertCell(row, tag, col, html) {
  const el = document.createElement(tag);
  el.dataset.col = col;
  el.innerHTML = html;
  row.insertBefore(el, row.lastElementChild);
  return el;
}

function numberInput(cls, label, placeholder) {
  return `<div class="cell"><input type="number" class="${cls}" min="0" step="any" placeholder="${placeholder}" aria-label="${label}"></div>`;
}

function addLocation() {
  const id = nextId++;

  insertCell(rows.location, "th", id, `
    <div class="cell">
      <input type="text" class="location-input" placeholder="${defaultName(id)}" aria-label="Location ${id} name">
      <button type="button" class="remove" title="Remove location" aria-label="Remove location ${id}">×</button>
    </div>`);
  insertCell(rows.volume, "td", id, numberInput("volume-input", `Cargo volume for location ${id} in kg`, "kg"));
  insertCell(rows.cargo, "td", id, numberInput("cargo-input", `Cargo rate for location ${id} in dollars per kg`, "$/kg"));
  insertCell(rows.fuelPrice, "td", id, numberInput("fuel-price-input", `Fuel price for location ${id} in dollars per US gallon`, "$/gal"));
  insertCell(rows.fuelGal, "td", id, numberInput("fuel-gal-input", `Fuel volume for location ${id} in US gallons`, "gal"));
  for (const key of ["fuelTotal", "revenue", "profit"]) insertCell(rows[key], "td", id, "—");

  const nameInput = rows.location.querySelector(`th[data-col="${id}"] input`);
  rows.location.querySelector(`th[data-col="${id}"] .remove`).addEventListener("click", () => removeLocation(id));
  document.querySelectorAll(`[data-col="${id}"] input`).forEach((input) => input.addEventListener("input", () => update()));

  buildSliders();
  update();
  return nameInput;
}

function removeLocation(id) {
  if (rows.location.querySelectorAll("th[data-col]").length <= DEFAULT_COLUMNS) return;
  document.querySelectorAll(`[data-col="${id}"]`).forEach((el) => el.remove());
  buildSliders();
  update();
}

function readNumber(row, col) {
  const raw = row.querySelector(`[data-col="${col}"] input`).value;
  return raw === "" ? null : Number(raw);
}

function getLocations() {
  return [...rows.location.querySelectorAll("th[data-col]")].map((th) => {
    const col = th.dataset.col;
    const volume = readNumber(rows.volume, col);
    const cargo = readNumber(rows.cargo, col);
    const fuelPrice = readNumber(rows.fuelPrice, col);
    const fuelGal = readNumber(rows.fuelGal, col);
    const fuel = fuelPrice !== null && fuelGal !== null ? fuelPrice * fuelGal : null;
    const revenue = volume !== null && cargo !== null ? volume * cargo : null;
    return {
      col,
      name: th.querySelector("input").value.trim() || defaultName(Number(col)),
      volume, cargo, fuelPrice, fuelGal, fuel, revenue,
      profit: fuel !== null && revenue !== null ? revenue - fuel : null,
    };
  });
}

// ---------- Update ----------

function setResult(row, col, value, cls = "") {
  const cell = row.querySelector(`[data-col="${col}"]`);
  cell.textContent = value === null ? "—" : money(value);
  cell.className = value === null ? "" : cls;
}

// `source` is the slider being dragged, if any, so its range stays put while you drag.
function update(source = null) {
  const locations = getLocations();

  const canRemove = locations.length > DEFAULT_COLUMNS;
  rows.location.querySelectorAll(".remove").forEach((b) => (b.disabled = !canRemove));

  for (const loc of locations) {
    setResult(rows.fuelTotal, loc.col, loc.fuel);
    setResult(rows.revenue, loc.col, loc.revenue);
    setResult(rows.profit, loc.col, loc.profit, loc.profit < 0 ? "neg" : "pos");
  }

  const complete = locations.filter((loc) => loc.profit !== null);
  const sum = (key) => complete.reduce((total, loc) => total + loc[key], 0);
  const overall = complete.length
    ? { name: "Overall", overall: true, count: complete.length, revenue: sum("revenue"), fuel: sum("fuel"), profit: sum("profit") }
    : null;

  // Overall revenue spans all location columns
  overallCell.colSpan = locations.length;
  overallCell.textContent = overall ? money(overall.profit) : "—";
  overallCell.className = overall ? (overall.profit < 0 ? "neg" : "pos") : "";

  renderChart(complete, overall);
  syncSliders(locations, source);
  renderCompare(overall);
  renderOptimize(locations, overall);
  saveButton.disabled = !overall || complete.length < locations.length;
  currentOverall = overall;
}

// ---------- Chart ----------

const SVG_NS = "http://www.w3.org/2000/svg";
const H = 300;
const M = { top: 16, right: 12, bottom: 40, left: 60 };
const SERIES = [
  { key: "revenue", label: "Cargo income" },
  { key: "fuel", label: "Fuel total" },
  { key: "profit", label: "Revenue" },
];
const BAR_GAP = 2;
const RADIUS = 4;

function svgEl(tag, attrs = {}, parent) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.append(el);
  return el;
}

function niceTicks(min, max, count = 5) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const ticks = [];
  for (let t = Math.floor(min / step) * step; t <= Math.ceil(max / step) * step + step * 1e-9; t += step) ticks.push(Number(t.toFixed(10)));
  return ticks;
}

function shortMoney(n) {
  const abs = Math.abs(n);
  const s = abs >= 1000 ? (abs / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "k" : abs.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return (n < 0 ? "−$" : "$") + s;
}

// Bar with a rounded data end and a square end on the zero baseline.
function barPath(x, w, y0, y1) {
  const h = Math.abs(y1 - y0);
  const r = Math.min(RADIUS, w / 2, h);
  if (y1 <= y0) {
    return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  }
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}

function renderChart(complete, overall) {
  const locations = overall ? [...complete, overall] : complete;
  chartEl.replaceChildren();
  if (!locations.length) {
    chartEl.innerHTML = `<p class="empty">Enter volume, cargo rate, fuel price and fuel to see the chart.</p>`;
    return;
  }

  const W = Math.max(480, locations.length * 150 + M.left + M.right);
  const values = locations.flatMap((loc) => SERIES.map((s) => loc[s.key]));
  const yTicks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const yMin = yTicks[0], yMax = yTicks[yTicks.length - 1];
  const y = (val) => M.top + (1 - (val - yMin) / (yMax - yMin || 1)) * (H - M.top - M.bottom);

  const plotW = W - M.left - M.right;
  const groupW = plotW / locations.length;
  const barW = Math.min(36, (groupW * 0.7 - BAR_GAP * (SERIES.length - 1)) / SERIES.length);
  const clusterW = barW * SERIES.length + BAR_GAP * (SERIES.length - 1);

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Cargo income, fuel total and revenue by location, and overall" });

  const grid = svgEl("g", { class: "grid" }, svg);
  for (const t of yTicks) {
    svgEl("line", { x1: M.left, x2: W - M.right, y1: y(t), y2: y(t) }, grid);
    svgEl("text", { x: M.left - 8, y: y(t) + 4, "text-anchor": "end", class: "tick" }, svg).textContent = shortMoney(t);
  }
  svgEl("line", { x1: M.left, x2: W - M.right, y1: y(0), y2: y(0), class: "zero" }, svg);

  locations.forEach((loc, i) => {
    const gx = M.left + groupW * i;
    const cx = gx + (groupW - clusterW) / 2;

    // Separate the overall group from the individual locations
    if (loc.overall) svgEl("line", { x1: gx, x2: gx, y1: M.top, y2: H - M.bottom + 28, class: "divider" }, svg);

    const name = svgEl("text", { x: gx + groupW / 2, y: H - M.bottom + 20, "text-anchor": "middle", class: "group-label" }, svg);
    name.textContent = loc.name.length > 18 ? loc.name.slice(0, 17) + "…" : loc.name;

    SERIES.forEach((s, j) => {
      const bx = cx + j * (barW + BAR_GAP);
      const value = loc[s.key];
      const bar = svgEl("path", { d: barPath(bx, barW, y(0), y(value)), class: `bar b-${s.key}` }, svg);

      // Hit target taller and wider than the bar itself
      const hit = svgEl("rect", { x: bx - BAR_GAP / 2, y: M.top, width: barW + BAR_GAP, height: H - M.top - M.bottom, class: "hit" }, svg);
      const show = (evt) => {
        bar.classList.add("active");
        tooltip.innerHTML = `
          <div class="t-head"></div>
          <div class="t-row"><span><i class="swatch s-${s.key}"></i>${s.label}</span><b>${money(value)}</b></div>
          ${loc.overall ? `<div class="t-row"><span>Sum of ${loc.count} location${loc.count > 1 ? "s" : ""}</span></div>` : ""}
          ${s.key === "revenue" && !loc.overall ? `<div class="t-row"><span>${kg(loc.volume)} × ${money(loc.cargo)}/kg</span></div>` : ""}
          ${s.key === "fuel" && !loc.overall ? `<div class="t-row"><span>${gal(loc.fuelGal)} × ${money(loc.fuelPrice)}/gal</span></div>` : ""}`;
        tooltip.querySelector(".t-head").textContent = loc.name;
        tooltip.hidden = false;
        const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
        let left = evt.clientX + 14, top = evt.clientY - th - 10;
        if (left + tw > window.innerWidth - 8) left = evt.clientX - tw - 14;
        if (top < 8) top = evt.clientY + 14;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      };
      const hide = () => {
        bar.classList.remove("active");
        tooltip.hidden = true;
      };
      hit.addEventListener("pointermove", show);
      hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", hide);
    });

    // Direct label on the revenue bar only
    const py = y(loc.profit);
    const px = cx + 2 * (barW + BAR_GAP) + barW / 2;
    svgEl("text", { x: px, y: loc.profit >= 0 ? py - 6 : py + 14, "text-anchor": "middle", class: "value-label" }, svg).textContent = shortMoney(loc.profit);
  });

  chartEl.append(svg);
}

// ---------- Sliders and ranges ----------

// Min/max per location for cargo volume and fuel. Fuel "min" is the fuel needed with the
// min cargo and fuel "max" the fuel needed with the max cargo; fuel moves in a straight
// line between them, so more cargo means more fuel.
const ranges = new Map();
const RANGE_KEYS = ["volMin", "volMax", "fuelMin", "fuelMax"];
const RANGE_INPUTS = {
  volume: [["volMin", "Min"], ["volMax", "Max"]],
  fuelGal: [["fuelMin", "At min cargo"], ["fuelMax", "At max cargo"]],
};

function getRange(col) {
  if (!ranges.has(col)) ranges.set(col, { volMin: null, volMax: null, fuelMin: null, fuelMax: null });
  return ranges.get(col);
}

function rangeComplete(r) {
  return RANGE_KEYS.every((k) => r[k] !== null) && r.volMax >= r.volMin && r.fuelMax >= r.fuelMin;
}

// Fuel needed for cargo volume v, following the line between the two range points.
function fuelForVolume(v, r) {
  if (r.volMax === r.volMin) return r.fuelMin;
  return r.fuelMin + ((v - r.volMin) / (r.volMax - r.volMin)) * (r.fuelMax - r.fuelMin);
}

// A round number about twice the value, so the slider can go both up and down.
function sliderMax(value, field) {
  if (!(value > 0)) return field.fallbackMax;
  const raw = value * 2;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
}

// Slider bounds: the min/max range when it's filled in, otherwise 0 to about twice the value.
function sliderBounds(value, field, r) {
  const [minKey, maxKey] = (RANGE_INPUTS[field.key] || []).map(([k]) => k);
  if (minKey && r[minKey] !== null && r[maxKey] !== null && r[maxKey] > r[minKey]) {
    return [r[minKey], r[maxKey]];
  }
  return [0, sliderMax(value, field)];
}

function formatField(value, field) {
  if (value === null) return "—";
  if (field.unit === "kg") return kg(value);
  if (field.unit === "gal") return gal(value);
  return `${money(value)}${field.unit.slice(1)}`;
}

function tableInput(col, field) {
  return document.querySelector(`[data-col="${col}"] .${field.inputClass}`);
}

function setTableValue(col, field, value, step) {
  const decimals = Math.max(0, -Math.floor(Math.log10(step || 1)));
  tableInput(col, field).value = String(Number(Number(value).toFixed(decimals)));
}

function rangeInputsHtml(field) {
  const pair = RANGE_INPUTS[field.key];
  if (!pair) return "";
  return `<div class="range-inputs">${pair.map(([key, label]) => `
    <label><span>${label}</span><input type="number" min="0" step="any" data-range="${key}" placeholder="${field.unit}"></label>`).join("")}
  </div>`;
}

function buildSliders() {
  slidersEl.replaceChildren();
  const cols = [...rows.location.querySelectorAll("th[data-col]")].map((th) => th.dataset.col);
  for (const col of [...ranges.keys()]) if (!cols.includes(col)) ranges.delete(col);

  for (const col of cols) {
    const r = getRange(col);
    const line = document.createElement("div");
    line.className = "slider-line";
    line.dataset.col = col;
    line.innerHTML = `<div class="slider-name"></div>` + FIELDS.map((f) => `
      <div class="slider-field">
        <label class="slider-label"><span>${f.label}</span> <output data-field="${f.key}"></output>
          <input type="range" data-field="${f.key}">
        </label>
        ${rangeInputsHtml(f)}
      </div>`).join("");

    for (const f of FIELDS) {
      const slider = line.querySelector(`input[data-field="${f.key}"]`);
      slider.addEventListener("input", () => {
        setTableValue(col, f, slider.value, Number(slider.step));
        // Moving the cargo volume moves the fuel along with it once the ranges are set.
        if (f.key === "volume" && rangeComplete(r)) {
          const fuelField = FIELDS.find((x) => x.key === "fuelGal");
          setTableValue(col, fuelField, fuelForVolume(Number(slider.value), r), 0.1);
        }
        update(slider);
      });
    }
    for (const input of line.querySelectorAll("input[data-range]")) {
      input.value = r[input.dataset.range] ?? "";
      input.addEventListener("input", () => {
        r[input.dataset.range] = input.value === "" ? null : Number(input.value);
        if (input.value !== "") input.classList.remove("missing");
        update();
      });
    }
    slidersEl.append(line);
  }
}

function syncSliders(locations, source) {
  for (const loc of locations) {
    const line = slidersEl.querySelector(`.slider-line[data-col="${loc.col}"]`);
    if (!line) continue;
    const r = getRange(loc.col);
    line.querySelector(".slider-name").textContent = loc.name;
    for (const f of FIELDS) {
      const slider = line.querySelector(`input[data-field="${f.key}"]`);
      const value = loc[f.key];
      if (slider !== source) {
        const [min, max] = sliderBounds(value, f, r);
        slider.min = min;
        slider.max = max;
        slider.step = (max - min) / 200;
        slider.value = value ?? min;
      }
      slider.setAttribute("aria-label", `${f.label} for ${loc.name}`);
      line.querySelector(`output[data-field="${f.key}"]`).textContent = formatField(value, f);
    }
    for (const input of line.querySelectorAll("input[data-range]")) {
      input.setAttribute("aria-label", `${input.previousElementSibling.textContent} ${input.dataset.range.startsWith("vol") ? "cargo volume" : "fuel"} for ${loc.name}`);
    }
    const bad = (r.volMin !== null && r.volMax !== null && r.volMax < r.volMin) || (r.fuelMin !== null && r.fuelMax !== null && r.fuelMax < r.fuelMin);
    line.classList.toggle("invalid", bad);
  }
}

// ---------- Optimization ----------

// Revenue at one location is cargo volume × cargo rate − fuel price × fuel, and fuel rises in a
// straight line with cargo. So each extra kg of cargo earns the cargo rate but costs
// (extra gallons of fuel per kg of cargo) × fuel price. If it earns more than it costs, carry the max;
// otherwise carry the min. Locations don't affect each other, so each is solved on its own.
let optimizeShown = false;
let lastOptimal = null;

function optimizeLocation(loc, r) {
  const fuelPerKg = r.volMax === r.volMin ? 0 : (r.fuelMax - r.fuelMin) / (r.volMax - r.volMin);
  const earnPerKg = loc.cargo;
  const fuelCostPerKg = fuelPerKg * loc.fuelPrice;
  const volume = earnPerKg >= fuelCostPerKg ? r.volMax : r.volMin;
  const fuelGal = fuelForVolume(volume, r);
  return {
    col: loc.col,
    name: loc.name,
    volume,
    fuelGal,
    profit: volume * loc.cargo - fuelGal * loc.fuelPrice,
    earnPerKg,
    fuelCostPerKg,
  };
}

// Everything the optimizer needs per location: both prices and all four min/max values.
const RANGE_LABELS = {
  volMin: "Cargo volume min",
  volMax: "Cargo volume max",
  fuelMin: "Fuel volume at min cargo",
  fuelMax: "Fuel volume at max cargo",
};

function findMissing(locations) {
  const problems = [];
  for (const loc of locations) {
    const r = getRange(loc.col);
    const missing = [];
    if (loc.cargo === null) missing.push("Cargo rate");
    if (loc.fuelPrice === null) missing.push("Fuel price");
    const emptyKeys = RANGE_KEYS.filter((k) => r[k] === null);
    missing.push(...emptyKeys.map((k) => RANGE_LABELS[k]));
    const invalid = [];
    if (r.volMin !== null && r.volMax !== null && r.volMax < r.volMin) invalid.push("Cargo volume max is lower than the min");
    if (r.fuelMin !== null && r.fuelMax !== null && r.fuelMax < r.fuelMin) invalid.push("Fuel volume at max cargo is lower than at min cargo");
    if (missing.length || invalid.length) problems.push({ col: loc.col, name: loc.name, missing, invalid, emptyKeys });
  }
  return problems;
}

function fillProblemList(ul, problems) {
  ul.replaceChildren();
  for (const p of problems) {
    const li = document.createElement("li");
    const parts = [];
    if (p.missing.length) parts.push(p.missing.join(", "));
    parts.push(...p.invalid);
    li.innerHTML = "<b></b>: <span></span>";
    li.querySelector("b").textContent = p.name;
    li.querySelector("span").textContent = parts.join("; ");
    ul.append(li);
  }
}

// Outline the empty min/max boxes so they're easy to find.
function markMissing(problems) {
  slidersEl.querySelectorAll("input[data-range].missing").forEach((i) => i.classList.remove("missing"));
  for (const p of problems) {
    for (const key of p.emptyKeys) {
      slidersEl.querySelector(`.slider-line[data-col="${p.col}"] input[data-range="${key}"]`)?.classList.add("missing");
    }
  }
}

function computeOptimal() {
  const problems = findMissing(getLocations());
  markMissing(problems);
  if (problems.length) {
    optimizeShown = false;
    update();
    fillProblemList(optimizeDialog.querySelector("ul"), problems);
    optimizeDialog.showModal();
    return;
  }
  optimizeShown = true;
  update();
}

function renderOptimize(locations, overall) {
  if (!optimizeShown) {
    optimizeEl.replaceChildren();
    lastOptimal = null;
    return;
  }
  const problems = findMissing(locations);
  if (problems.length) {
    // A range was cleared after computing: hide the old result instead of showing a wrong one.
    lastOptimal = null;
    optimizeEl.innerHTML = `<div class="alert" role="alert"><b>Can't compute the optimal values.</b> Fill in under <b>Adjust values</b>:<ul></ul></div>`;
    fillProblemList(optimizeEl.querySelector("ul"), problems);
    return;
  }

  const results = locations.map((loc) => optimizeLocation(loc, getRange(loc.col)));
  const bestOverall = results.reduce((t, r) => t + r.profit, 0);
  lastOptimal = results;

  const head = `<tr><th></th>${results.map(() => "<th></th>").join("")}</tr>`;
  const row = (label, cells, cls = "") => `<tr class="${cls}"><th class="row-label">${label}</th>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
  const diff = overall ? bestOverall - overall.profit : null;

  optimizeEl.innerHTML = `
    <div class="table-wrap">
      <table class="optimal-table">
        <thead>${head}</thead>
        <tbody>
          ${row("Best cargo volume", results.map((r) => kg(r.volume)))}
          ${row("Fuel volume needed", results.map((r) => gal(r.fuelGal)))}
          ${row("Why", results.map((r) => `Each kg of cargo earns ${perKg(r.earnPerKg)} and needs ${perKg(r.fuelCostPerKg)} of fuel, so carry the <b>${r.earnPerKg >= r.fuelCostPerKg ? "max" : "min"}</b>`), "why")}
          ${row(`Revenue <span class="unit">$</span>`, results.map((r) => `<span class="${r.profit < 0 ? "neg" : "pos"}">${money(r.profit)}</span>`), "result-row")}
          <tr class="result-row overall-row"><th class="row-label">Overall revenue <span class="unit">$</span></th><td colspan="${results.length}" class="${bestOverall < 0 ? "neg" : "pos"}">${money(bestOverall)}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="optimal-summary">
      <p>Best overall revenue: <b class="${bestOverall < 0 ? "neg" : "pos"}">${money(bestOverall)}</b>${compareText(diff, overall)}</p>
      <button type="button" id="apply-optimal" class="primary">Use and save these values</button>
    </div>`;
  optimizeEl.querySelectorAll("thead th").forEach((th, i) => {
    if (i > 0) th.textContent = results[i - 1].name;
  });
  optimizeEl.querySelector("#apply-optimal").addEventListener("click", applyOptimal);
}

// Per-kg amounts are small, so show enough decimals to tell them apart.
const perKg = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

function compareText(diff, overall) {
  if (diff === null) return ".";
  if (Math.abs(diff) < 0.005) return ", which is what you have now.";
  if (diff > 0) return `, ${money(diff)} more than now (${money(overall.profit)}).`;
  return `, ${money(-diff)} less than now (${money(overall.profit)}). The fuel in the table now is lower than the min/max ranges say you need.`;
}

// Put the optimal cargo volume and fuel into the table (which redraws the chart) and save it.
function applyOptimal() {
  if (!lastOptimal) return;
  const volumeField = FIELDS.find((f) => f.key === "volume");
  const fuelField = FIELDS.find((f) => f.key === "fuelGal");
  for (const r of lastOptimal) {
    setTableValue(r.col, volumeField, r.volume, 0.1);
    setTableValue(r.col, fuelField, r.fuelGal, 0.1);
  }
  update();
  saveScenario();
}

// ---------- Saved scenarios ----------

// Saved scenarios live only in memory: they stay while you work (adding, removing or changing
// locations) and are cleared when the page is refreshed.
let saved = [];
let currentOverall = null;

function bestSaved() {
  return saved.reduce((best, s) => (!best || s.overall > best.overall ? s : best), null);
}

function saveScenario() {
  const locations = getLocations();
  if (!currentOverall || locations.some((loc) => loc.profit === null)) return;
  const number = saved.reduce((n, s) => Math.max(n, s.number), 0) + 1;
  saved.push({
    number,
    savedAt: new Date().toISOString(),
    overall: currentOverall.profit,
    locations: locations.map(({ name, volume, cargo, fuelPrice, fuelGal, profit }) => ({ name, volume, cargo, fuelPrice, fuelGal, profit })),
  });
  renderSaved();
  renderCompare(currentOverall);
}

function deleteScenario(number) {
  saved = saved.filter((s) => s.number !== number);
  renderSaved();
  renderCompare(currentOverall);
}

// Put a saved scenario back into the table.
function loadScenario(number) {
  const scenario = saved.find((s) => s.number === number);
  if (!scenario) return;
  let ths = [...rows.location.querySelectorAll("th[data-col]")];
  while (ths.length < scenario.locations.length) {
    addLocation();
    ths = [...rows.location.querySelectorAll("th[data-col]")];
  }
  while (ths.length > scenario.locations.length) {
    document.querySelectorAll(`[data-col="${ths.pop().dataset.col}"]`).forEach((el) => el.remove());
  }
  ths.forEach((th, i) => {
    const loc = scenario.locations[i];
    const col = th.dataset.col;
    th.querySelector("input").value = loc.name === defaultName(Number(col)) ? "" : loc.name;
    for (const f of FIELDS) tableInput(col, f).value = loc[f.key];
  });
  buildSliders();
  update();
}

function renderSaved() {
  savedEl.replaceChildren();
  if (!saved.length) {
    savedEl.innerHTML = `<p class="empty">Nothing saved yet. Click <b>Save</b> above the chart to keep the current values.</p>`;
    return;
  }
  const best = bestSaved();
  const table = document.createElement("table");
  table.className = "saved-table";
  table.innerHTML = `<thead><tr><th>#</th><th>Saved</th><th>Revenue per location</th><th>Overall revenue</th><th></th></tr></thead><tbody></tbody>`;
  const tbody = table.querySelector("tbody");
  for (const s of [...saved].reverse()) {
    const tr = document.createElement("tr");
    if (s === best && saved.length > 1) tr.className = "best";
    const when = new Date(s.savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    tr.innerHTML = `
      <td class="num">${s.number}</td>
      <td class="when"></td>
      <td class="per-location"></td>
      <td class="overall ${s.overall < 0 ? "neg" : "pos"}">${money(s.overall)}${s === best && saved.length > 1 ? ` <span class="tag">Best</span>` : ""}</td>
      <td class="actions">
        <button type="button" class="load">Load</button>
        <button type="button" class="delete" aria-label="Delete saved scenario ${s.number}">Delete</button>
      </td>`;
    tr.querySelector(".when").textContent = when;
    for (const l of s.locations) {
      const line = document.createElement("div");
      line.innerHTML = `<span></span> <b class="${l.profit < 0 ? "neg" : "pos"}">${money(l.profit)}</b>`;
      line.querySelector("span").textContent = l.name;
      tr.querySelector(".per-location").append(line);
    }
    tr.querySelector(".load").addEventListener("click", () => loadScenario(s.number));
    tr.querySelector(".delete").addEventListener("click", () => deleteScenario(s.number));
    tbody.append(tr);
  }
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  wrap.append(table);
  savedEl.append(wrap);
}

function renderCompare(overall) {
  const best = bestSaved();
  if (!overall) {
    compareEl.className = "compare";
    compareEl.textContent = "Fill in every location to see the overall revenue.";
    return;
  }
  if (!best) {
    compareEl.className = "compare";
    compareEl.innerHTML = `Overall revenue now: <b>${money(overall.profit)}</b>. Save it to compare other values against it.`;
    return;
  }
  const diff = overall.profit - best.overall;
  if (Math.abs(diff) < 0.005) {
    compareEl.className = "compare";
    compareEl.innerHTML = `Overall revenue now: <b>${money(overall.profit)}</b>, the same as your best saved (#${best.number}).`;
  } else if (diff > 0) {
    compareEl.className = "compare higher";
    compareEl.innerHTML = `▲ Overall revenue now: <b>${money(overall.profit)}</b>, <b>${money(diff)} higher</b> than your best saved (#${best.number}). Click <b>Save</b> to keep it.`;
  } else {
    compareEl.className = "compare lower";
    compareEl.innerHTML = `▼ Overall revenue now: <b>${money(overall.profit)}</b>, ${money(-diff)} lower than your best saved (#${best.number}).`;
  }
}

// ---------- Init ----------

addButton.addEventListener("click", () => addLocation().focus());
saveButton.addEventListener("click", saveScenario);
optimizeButton.addEventListener("click", computeOptimal);
optimizeDialog.querySelector("button").addEventListener("click", () => {
  optimizeDialog.close();
  slidersEl.querySelector("input.missing")?.focus();
});

for (let i = 0; i < DEFAULT_COLUMNS; i++) addLocation();
renderSaved();
