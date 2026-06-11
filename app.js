/* CriptoEconomía — monitor estadístico. Datos: CoinGecko y alternative.me */

const COINS = [
  {
    id: "bitcoin",
    symbol: "BTC",
    name: "Bitcoin",
    color: "#b45309",
    note:
      "Oferta rígida con tope de 21 M de unidades y emisión decreciente (halving cada ~4 años). " +
      "Se analiza como reserva de valor y actúa como factor sistemático del mercado cripto.",
  },
  {
    id: "ethereum",
    symbol: "ETH",
    name: "Ethereum",
    color: "#3b5bdb",
    note:
      "Infraestructura de contratos inteligentes (DeFi, stablecoins, tokenización). EIP-1559 quema " +
      "parte de las comisiones (presión deflacionaria endógena); el staking rinde ~3-4% anual y opera " +
      "como tasa de referencia interna.",
  },
  {
    id: "binancecoin",
    symbol: "BNB",
    name: "BNB",
    color: "#92750c",
    note:
      "Token del ecosistema Binance. Quemas trimestrales con cargo a beneficios — mecanismo análogo " +
      "a la recompra de acciones — con objetivo final de 100 M de unidades en circulación.",
  },
];

const WINDOW_DAYS = 90;

/* ---------- Formato ---------- */
const fmtUSD = (n, opts = {}) =>
  n == null
    ? "–"
    : new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: n < 10 ? 4 : 2,
        ...opts,
      }).format(n);

const fmtCompact = (n) =>
  n == null
    ? "–"
    : new Intl.NumberFormat("es-ES", { notation: "compact", maximumFractionDigits: 2 }).format(n);

const fmtPct = (n, digits = 2) =>
  n == null || Number.isNaN(n) ? "–" : `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;

const fmtNum = (n, digits = 0) =>
  n == null ? "–" : new Intl.NumberFormat("es-ES", { maximumFractionDigits: digits }).format(n);

const pctClass = (n) => (n == null ? "" : n >= 0 ? "up" : "down");

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.json();
}

/* Cache en localStorage con TTL: amortigua el rate limit de la API gratuita
   (las series de 90 días apenas cambian entre recargas). */
async function fetchJSONCached(url, ttlMs) {
  const key = `ce-cache:${url}`;
  try {
    const hit = JSON.parse(localStorage.getItem(key));
    if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  } catch (_) { /* cache corrupta: se ignora */ }
  try {
    const v = await fetchJSON(url);
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch (_) {}
    return v;
  } catch (e) {
    // Si la red falla, servir cache vencida antes que nada
    try {
      const stale = JSON.parse(localStorage.getItem(key));
      if (stale) return stale.v;
    } catch (_) {}
    throw e;
  }
}

/* ---------- Estadística ---------- */
function logReturns(prices) {
  const r = [];
  for (let i = 1; i < prices.length; i++) r.push(Math.log(prices[i] / prices[i - 1]));
  return r;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function variance(xs) {
  const m = mean(xs);
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
}

function covariance(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - mx) * (ys[i] - my);
  return s / (xs.length - 1);
}

const annualizedVol = (returns) => Math.sqrt(variance(returns)) * Math.sqrt(365) * 100;

const correlation = (xs, ys) =>
  covariance(xs, ys) / Math.sqrt(variance(xs) * variance(ys));

const beta = (asset, market) => covariance(asset, market) / variance(market);

function maxDrawdown(prices) {
  let peak = prices[0];
  let mdd = 0;
  for (const p of prices) {
    if (p > peak) peak = p;
    const dd = (p - peak) / peak;
    if (dd < mdd) mdd = dd;
  }
  return mdd * 100;
}

/* ---------- Cinta de cotizaciones ---------- */
function renderTape(markets) {
  document.getElementById("tape").innerHTML = COINS.map((coin) => {
    const m = markets.find((x) => x.id === coin.id);
    return `<span class="tape-item">
        <strong>${coin.symbol}</strong> ${fmtUSD(m.current_price)}
        <span class="${pctClass(m.price_change_percentage_24h)}">${fmtPct(m.price_change_percentage_24h)}</span>
      </span>`;
  }).join('<span class="tape-sep">·</span>');
}

/* ---------- Agregados de mercado ---------- */
function renderGlobalStats(global) {
  const d = global.data;
  const totalMcap = d.total_market_cap.usd;
  const totalVol = d.total_volume.usd;
  const stats = [
    {
      label: "Capitalización total",
      value: `$${fmtCompact(totalMcap)}`,
      sub: `${fmtPct(d.market_cap_change_percentage_24h_usd)} en 24 h`,
      cls: pctClass(d.market_cap_change_percentage_24h_usd),
    },
    {
      label: "Volumen 24 h",
      value: `$${fmtCompact(totalVol)}`,
      sub: "Negociación agregada",
    },
    {
      label: "Dominancia BTC / ETH",
      value: `${d.market_cap_percentage.btc.toFixed(1)}% / ${d.market_cap_percentage.eth.toFixed(1)}%`,
      sub: `BNB: ${(d.market_cap_percentage.bnb || 0).toFixed(1)}%`,
    },
    {
      label: "Activos listados",
      value: fmtNum(d.active_cryptocurrencies),
      sub: `${fmtNum(d.markets)} mercados activos`,
    },
  ];

  document.getElementById("globalStats").innerHTML = stats
    .map(
      (s) => `
      <div class="stat-card">
        <div class="stat-label">${s.label}</div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-sub ${s.cls || ""}">${s.sub}</div>
      </div>`
    )
    .join("");

  const ratio = (totalVol / totalMcap) * 100;
  document.getElementById("volMcapRatio").textContent = `${ratio.toFixed(2)}%`;
  document.getElementById("btcDominance").textContent = `${d.market_cap_percentage.btc.toFixed(1)}%`;
}

/* ---------- Matriz de retornos y riesgo ---------- */
function renderRiskTable(markets, series) {
  const btcReturns = logReturns(series.bitcoin);
  const rows = COINS.map((coin) => {
    const m = markets.find((x) => x.id === coin.id);
    const prices = series[coin.id];
    const rets = logReturns(prices);
    const vol = annualizedVol(rets);
    const mdd = maxDrawdown(prices);
    const b = coin.id === "bitcoin" ? 1 : beta(rets, btcReturns);
    return `
      <tr>
        <td><strong>${coin.symbol}</strong> <span class="muted-inline">${coin.name}</span></td>
        <td class="num">${fmtUSD(m.current_price)}</td>
        <td class="num ${pctClass(m.price_change_percentage_24h)}">${fmtPct(m.price_change_percentage_24h)}</td>
        <td class="num ${pctClass(m.price_change_percentage_7d_in_currency)}">${fmtPct(m.price_change_percentage_7d_in_currency)}</td>
        <td class="num ${pctClass(m.price_change_percentage_30d_in_currency)}">${fmtPct(m.price_change_percentage_30d_in_currency)}</td>
        <td class="num ${pctClass(m.price_change_percentage_1y_in_currency)}">${fmtPct(m.price_change_percentage_1y_in_currency, 1)}</td>
        <td class="num">${vol.toFixed(1)}%</td>
        <td class="num down">${mdd.toFixed(1)}%</td>
        <td class="num">${b.toFixed(2)}</td>
      </tr>`;
  });
  document.querySelector("#riskTable tbody").innerHTML = rows.join("");
}

/* ---------- Matriz de correlaciones ---------- */
function renderCorrTable(series) {
  const rets = {};
  for (const coin of COINS) rets[coin.symbol] = logReturns(series[coin.id]);
  const syms = COINS.map((c) => c.symbol);

  const rows = syms.map((rowSym) => {
    const cells = syms.map((colSym) => {
      if (rowSym === colSym) return `<td class="num corr-diag">1,00</td>`;
      const c = correlation(rets[rowSym], rets[colSym]);
      return `<td class="num">${c.toFixed(2).replace(".", ",")}</td>`;
    });
    return `<tr><td><strong>${rowSym}</strong></td>${cells.join("")}</tr>`;
  });
  document.querySelector("#corrTable tbody").innerHTML = rows.join("");
}

/* ---------- Series de precios ---------- */
function renderChartBlocks(seriesRaw) {
  const container = document.getElementById("chartBlocks");
  container.innerHTML = COINS.map(
    (coin) => `
    <figure class="chart-block">
      <figcaption><strong>${coin.symbol}</strong> — ${coin.name}, cierre diario USD (${WINDOW_DAYS} d)</figcaption>
      <div class="chart-canvas"><canvas id="chart-${coin.id}"></canvas></div>
    </figure>`
  ).join("");

  for (const coin of COINS) {
    const points = seriesRaw[coin.id];
    const labels = points.map(([ts]) =>
      new Date(ts).toLocaleDateString("es-ES", { day: "numeric", month: "short" })
    );
    const values = points.map(([, p]) => p);
    const ctx = document.getElementById(`chart-${coin.id}`);
    if (!ctx) continue;

    new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data: values,
            borderColor: coin.color,
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => fmtUSD(c.parsed.y) } },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#6b7280", maxTicksLimit: 9, font: { size: 11 } },
          },
          y: {
            grid: { color: "rgba(107,114,128,0.15)" },
            ticks: {
              color: "#6b7280",
              font: { size: 11 },
              callback: (v) => `$${fmtCompact(v)}`,
            },
          },
        },
      },
    });
  }
}

/* ---------- Fundamentos ---------- */
function renderCompareTable(markets) {
  const get = (id) => markets.find((m) => m.id === id);
  const ms = [get("bitcoin"), get("ethereum"), get("binancecoin")];

  const rows = [
    ["Capitalización", ...ms.map((m) => `$${fmtCompact(m.market_cap)}`)],
    ["Ranking por capitalización", ...ms.map((m) => `#${m.market_cap_rank}`)],
    ["Volumen 24 h", ...ms.map((m) => `$${fmtCompact(m.total_volume)}`)],
    ["Vol. 24 h / Capitalización", ...ms.map((m) => `${((m.total_volume / m.market_cap) * 100).toFixed(2)}%`)],
    ["Oferta circulante", ...ms.map((m) => fmtCompact(m.circulating_supply))],
    ["Oferta máxima", ...ms.map((m) => (m.max_supply ? fmtCompact(m.max_supply) : "Sin tope"))],
    ["% emitido del máximo", ...ms.map((m) => (m.max_supply ? `${((m.circulating_supply / m.max_supply) * 100).toFixed(1)}%` : "—"))],
    ["Máximo histórico (ATH)", ...ms.map((m) => fmtUSD(m.ath))],
    ["Distancia al ATH", ...ms.map((m) => fmtPct(m.ath_change_percentage, 1))],
    ["Fecha del ATH", ...ms.map((m) => new Date(m.ath_date).toLocaleDateString("es-ES", { month: "short", year: "numeric" }))],
  ];

  document.querySelector("#compareTable tbody").innerHTML = rows
    .map(
      ([label, ...vals]) =>
        `<tr><td>${label}</td>${vals
          .map((v) => `<td class="num ${String(v).startsWith("+") ? "up" : String(v).startsWith("-") ? "down" : ""}">${v}</td>`)
          .join("")}</tr>`
    )
    .join("");

  document.getElementById("fundNotes").innerHTML = COINS.map(
    (coin) => `<p><strong>${coin.symbol}.</strong> ${coin.note}</p>`
  ).join("");
}

/* ---------- Fear & Greed ---------- */
async function renderFearGreed() {
  try {
    const data = await fetchJSON("https://api.alternative.me/fng/?limit=1");
    const item = data.data[0];
    const labels = {
      "Extreme Fear": "Miedo extremo",
      Fear: "Miedo",
      Neutral: "Neutral",
      Greed: "Codicia",
      "Extreme Greed": "Codicia extrema",
    };
    document.getElementById("fngValue").textContent = `${item.value}/100`;
    document.getElementById("fngLabel").textContent =
      labels[item.value_classification] || item.value_classification;
  } catch (e) {
    console.warn("No se pudo cargar el índice Fear & Greed:", e);
    document.getElementById("fngLabel").textContent = "No disponible";
  }
}

/* ---------- Init ---------- */
const TTL_MARKETS = 2 * 60 * 1000;   // precios/agregados: 2 min
const TTL_SERIES = 30 * 60 * 1000;   // series de 90 días: 30 min

async function init() {
  const badge = document.getElementById("liveBadge");

  const [marketsR, globalR, ...chartsR] = await Promise.allSettled([
    fetchJSONCached(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,binancecoin&order=market_cap_desc&price_change_percentage=24h,7d,30d,1y",
      TTL_MARKETS
    ),
    fetchJSONCached("https://api.coingecko.com/api/v3/global", TTL_MARKETS),
    ...COINS.map((c) =>
      fetchJSONCached(
        `https://api.coingecko.com/api/v3/coins/${c.id}/market_chart?vs_currency=usd&days=${WINDOW_DAYS}&interval=daily`,
        TTL_SERIES
      )
    ),
  ]);

  const markets = marketsR.status === "fulfilled" ? marketsR.value : null;
  const global = globalR.status === "fulfilled" ? globalR.value : null;
  const chartsOk = chartsR.every((r) => r.status === "fulfilled");

  let seriesRaw = null, series = null;
  if (chartsOk) {
    seriesRaw = {}; series = {};
    COINS.forEach((c, i) => {
      seriesRaw[c.id] = chartsR[i].value.prices;
      series[c.id] = chartsR[i].value.prices.map(([, p]) => p);
    });
  }

  // Render parcial: cada bloque se pinta con los datos que estén disponibles
  if (markets) {
    renderTape(markets);
    renderCompareTable(markets);
  }
  if (global) renderGlobalStats(global);
  if (markets && series) renderRiskTable(markets, series);
  if (series) {
    renderCorrTable(series);
    renderChartBlocks(seriesRaw);
  }

  const allOk = markets && global && chartsOk;
  if (allOk) {
    badge.classList.remove("error");
    badge.textContent = "DATOS EN VIVO";
    document.getElementById("lastUpdate").textContent =
      `Última actualización: ${new Date().toLocaleString("es-ES")} · Fuentes: CoinGecko, alternative.me · Ventana estadística: ${WINDOW_DAYS} días`;
  } else if (markets || global || series) {
    badge.classList.add("error");
    badge.textContent = "DATOS PARCIALES";
    document.getElementById("lastUpdate").textContent =
      "Carga parcial: la API pública de CoinGecko limitó algunas consultas. Los bloques faltantes se completarán en el próximo refresco automático.";
  } else {
    badge.classList.add("error");
    badge.textContent = "ERROR DE CONEXIÓN";
    document.getElementById("lastUpdate").textContent =
      "No se pudieron cargar los datos. Verificá la conexión o reintentá en unos minutos (límite de la API pública de CoinGecko).";
  }

  renderFearGreed();
  return allOk;
}

async function start() {
  const ok = await init();
  // Si la primera carga quedó incompleta por rate limit, reintentar antes
  if (!ok) setTimeout(init, 45000);
  // Refresco automático cada 3 minutos (respeta el rate limit de la API gratuita)
  setInterval(init, 180000);
}

start();
