Chart.register(ChartDataLabels);

const AppState = { filtro: { loja: 'ALL', modelo: 'ALL', gestao: 'ALL' } };

const CORES = {
    primary: '#f2c029',
    ace: '#2ecc71',
    prt: '#ff4d4d',
    trilha: '#121212',
    sunset: ['#FFD700', '#F2C029', '#FFA500', '#FF8C00', '#FF7F50']
};

document.addEventListener('DOMContentLoaded', () => {
    if (typeof dadosDashboard === 'undefined') {
        console.error("❌ Erro: dados.js não encontrado.");
        return;
    }
    configurarEventosFiltro();
    atualizarRelogio();
    setInterval(atualizarRelogio, 1000);
    setTimeout(() => processarEDataRender(), 150);
});

window.addEventListener('resize', () => processarEDataRender());

// #* MOTOR DE FILTRAGEM
function filtrarBase(base) {
    if (!base) return [];
    return base.filter(item => {
        const id = Number(item['ID TIPO']);
        const modeloItem = (id === 1 || id === 2) ? 'LOJA' : 'QUIOSQUE';
        const gestaoItem = (id === 1 || id === 3) ? 'PRÓPRIA' : 'FRANQUIA';

        const matchLoja = AppState.filtro.loja === 'ALL' || String(item['ID_LOJA']) === String(AppState.filtro.loja);
        const matchModelo = AppState.filtro.modelo === 'ALL' || modeloItem === AppState.filtro.modelo;
        const matchGestao = AppState.filtro.gestao === 'ALL' || gestaoItem === AppState.filtro.gestao;

        return matchLoja && matchModelo && matchGestao;
    });
}

// #* PROCESSAMENTO E RENDERIZAÇÃO (REVISADO D06)
function processarEDataRender() {
    const d = dadosDashboard;
    const baseFiltrada = filtrarBase(d.unidades);
    const atingIdeal = d.tempo?.ideal ?? 0;

    // 1. Acumuladores de KPI
    const stats = baseFiltrada.reduce((acc, curr) => {
        acc.faturamento += curr.REALIZADO || 0;
        acc.vendas += curr.N_VENDAS || 0;
        acc.pecas += curr.QTD_PEÇAS || 0;
        return acc;
    }, { faturamento: 0, vendas: 0, pecas: 0 });

    renderKpiCards(stats);

    // 2. Acumuladores de Metas (Gauges)
    const metas = baseFiltrada.reduce((acc, curr) => {
        acc.real_g += curr.REALIZADO || 0; acc.meta_g += curr.META_GERAL || 0;
        acc.real_a += curr.ACE || 0; acc.meta_a += curr.META_ACE || 0;
        acc.real_p += curr.PRT || 0; acc.meta_p += curr.META_PRT || 0;
        return acc;
    }, { real_g: 0, meta_g: 0, real_a: 0, meta_a: 0, real_p: 0, meta_p: 0 });

    renderGauge('chart-atg-geral', (metas.real_g / (metas.meta_g || 1) * 100), 'val-geral', atingIdeal);
    renderGauge('chart-atg-ace', (metas.real_a / (metas.meta_a || 1) * 100), 'val-ace', atingIdeal);
    renderGauge('chart-atg-prt', (metas.real_p / (metas.meta_p || 1) * 100), 'val-prt', atingIdeal);

    // 3. AGREGAÇÃO DINÂMICA (AQUI MORA A MÁGICA DO D06)
    const dynSaz = { 'Seg': 0, 'Ter': 0, 'Qua': 0, 'Qui': 0, 'Sex': 0, 'Sáb': 0, 'Dom': 0 };
    const dynCat = { 'CEL': 0, 'SOM': 0, 'ACE': 0, 'PRT': 0 };
    const dynPlanos = {};

    baseFiltrada.forEach(loja => {
        // Soma Sazonalidade (com trava de segurança || {})
        const sazLocal = loja.sazonalidade || {};
        Object.keys(sazLocal).forEach(dia => { if(dynSaz.hasOwnProperty(dia)) dynSaz[dia] += sazLocal[dia] || 0; });

        // Soma Categorias
        const catLocal = loja.mix_categorias || {};
        Object.keys(catLocal).forEach(cat => { if(dynCat.hasOwnProperty(cat)) dynCat[cat] += catLocal[cat] || 0; });

        // Soma Planos
        const planosLocal = loja.mix_planos || {};
        Object.keys(planosLocal).forEach(plano => {
            dynPlanos[plano] = (dynPlanos[plano] || 0) + (planosLocal[plano] || 0);
        });
    });

    // Filtra planos vazios para a rosca
    const planosFinal = Object.fromEntries(Object.entries(dynPlanos).filter(([_, v]) => v > 0));

    renderSazonalidade(dynSaz);
    renderMixDonut('chart-mix-cat', dynCat);
    renderMixDonut('chart-mix-planos', planosFinal);

    document.getElementById('last-update').innerText = d.ultima_atualizacao;
}

// #* COMPONENTES DE INTERFACE (FUNÇÕES DE SUPORTE)
function renderKpiCards(stats) {
    document.querySelector('#kpi-fat b').innerText = fmt(stats.faturamento);
    document.querySelector('#kpi-vendas b').innerText = stats.vendas.toLocaleString();
    document.querySelector('#kpi-pecas b').innerText = stats.pecas.toLocaleString();
    document.querySelector('#kpi-ticket b').innerText = fmt(stats.faturamento / Math.max(stats.vendas, 1));
    document.querySelector('#kpi-pa b').innerText = (stats.pecas / Math.max(stats.vendas, 1)).toFixed(2);
}

function renderSazonalidade(dados) {
    const ctx = document.getElementById('chart-sazonalidade');
    if (Chart.getChart(ctx)) Chart.getChart(ctx).destroy();
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(dados),
            datasets: [{ data: Object.values(dados), backgroundColor: CORES.primary, borderRadius: 4 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, datalabels: { display: false } },
            scales: { y: { grid: { color: '#1a1a1a', borderDash: [2, 2] }, ticks: { display: false } }, x: { grid: { display: false }, ticks: { color: '#888', font: { size: 10 } } } }
        }
    });
}

function renderMixDonut(id, dados) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (Chart.getChart(ctx)) Chart.getChart(ctx).destroy();
    new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(dados), datasets: [{ data: Object.values(dados), backgroundColor: CORES.sunset, borderColor: '#000', borderWidth: 2 }] },
        options: { layout: { padding: 15 }, cutout: '72%', responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#888', font: { size: 10 }, padding: 8, boxWidth: 8 } },
                datalabels: { anchor: 'end', align: 'end', color: '#fff', font: { size: 10, weight: 'bold' },
                    formatter: (v, ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); return total > 0 ? ((v / total) * 100).toFixed(1) + '%' : '0%'; }
                }
            }
        }
    });
}

function obterCorGauge(valorAtual, valorIdeal) {
    if (!valorIdeal) return CORES.trilha;
    const lim = valorIdeal * 0.8;
    if (valorAtual >= valorIdeal) return CORES.ace;
    if (valorAtual >= lim) return CORES.primary;
    return CORES.prt;
}

function renderGauge(id, valor, labelId, atingIdeal) {
    const ctx = document.getElementById(id);
    if (!ctx || Chart.getChart(ctx)) if(ctx) Chart.getChart(ctx).destroy();
    const v = Math.min(100, Math.max(0, valor));
    const cor = obterCorGauge(valor, atingIdeal);
    document.getElementById(labelId).innerText = `${v.toFixed(1)}%`;
    new Chart(ctx, { type: 'doughnut', data: { datasets: [{ data: [v, 100 - v], backgroundColor: [cor, CORES.trilha], borderWidth: 0 }] },
        options: { cutout: '88%', responsive: true, maintainAspectRatio: false, plugins: { datalabels: { display: false }, tooltip: { enabled: false } } }
    });
}

function configurarEventosFiltro() {
    const selLoja = document.getElementById('filter-loja');
    if (selLoja && dadosDashboard.unidades) {
        dadosDashboard.unidades.forEach(l => {
            const opt = document.createElement('option');
            opt.value = l['ID_LOJA']; opt.innerText = l['NOME PDV'];
            selLoja.appendChild(opt);
        });
    }
    ['filter-loja', 'filter-modelo', 'filter-gestao'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', e => {
            AppState.filtro[id.replace('filter-', '')] = e.target.value;
            processarEDataRender();
        });
    });
}

function fmt(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v); }
function atualizarRelogio() { const el = document.getElementById('relogio'); if (el) el.innerText = new Date().toLocaleTimeString(); }