Chart.register(ChartDataLabels);

const AppState = {
    filtro: { loja: 'ALL', modelo: 'ALL', gestao: 'ALL' }
};

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
    setTimeout(processarEDataRender, 150);
});

window.addEventListener('resize', () => {
    processarEDataRender();
});

function filtrarBase(base) {
    if (!base) return [];
    return base.filter(item => {
        const matchLoja = AppState.filtro.loja === 'ALL' || String(item['ID LOJA']) === String(AppState.filtro.loja);
        let modelo = (item['ID TIPO'] == 1 || item['ID TIPO'] == 2) ? 'LOJA' : 'QUIOSQUE';
        const matchModelo = AppState.filtro.modelo === 'ALL' || modelo === AppState.filtro.modelo;
        let gestao = (item['ID TIPO'] == 1 || item['ID TIPO'] == 3) ? 'PRÓPRIA' : 'FRANQUIA';
        const matchGestao = AppState.filtro.gestao === 'ALL' || gestao === AppState.filtro.gestao;
        return matchLoja && matchModelo && matchGestao;
    });
}

function processarEDataRender() {
    const d = dadosDashboard;
    const baseFiltrada = filtrarBase(d.unidades);
    const stats = baseFiltrada.reduce((acc, curr) => {
        acc.real_g += curr.REALIZADO || 0;
        acc.meta_g += curr.META_GERAL || 0;
        acc.real_a += curr.ACE || 0;
        acc.meta_a += curr.META_ACE || 0;
        acc.real_p += curr.PRT || 0;
        acc.meta_p += curr.META_PRT || 0;
        return acc;
    }, { real_g:0, meta_g:0, real_a:0, meta_a:0, real_p:0, meta_p:0 });
    renderKpiCards(stats.real_g, d.geral);
    renderGauge('chart-atg-geral', (stats.real_g / (stats.meta_g || 1) * 100), 'val-geral');
    renderGauge('chart-atg-ace', (stats.real_a / (stats.meta_a || 1) * 100), 'val-ace');
    renderGauge('chart-atg-prt', (stats.real_p / (stats.meta_p || 1) * 100), 'val-prt');
    renderSazonalidade(d.analise_geral.sazonalidade);
    renderMixDonut('chart-mix-cat', d.analise_geral.mix_categorias);
    renderMixDonut('chart-mix-planos', d.analise_geral.mix_planos);
    document.getElementById('last-update').innerText = d.ultima_atualizacao;
}

function renderKpiCards(fatFiltrado, geral) {
    const isFiltered = AppState.filtro.loja !== 'ALL';
    const vendas = isFiltered ? Math.round(fatFiltrado / (geral.ticket || 1)) : geral.vendas;
    const pecas = isFiltered ? Math.round(vendas * (geral.pa || 1)) : geral.pecas;
    document.querySelector('#kpi-fat b').innerText = fmt(fatFiltrado);
    document.querySelector('#kpi-vendas b').innerText = vendas.toLocaleString();
    document.querySelector('#kpi-pecas b').innerText = pecas.toLocaleString();
    document.querySelector('#kpi-ticket b').innerText = fmt(fatFiltrado / Math.max(vendas, 1));
    document.querySelector('#kpi-pa b').innerText = (pecas / Math.max(vendas, 1)).toFixed(2);
}

function renderSazonalidade(dados) {
    const ctx = document.getElementById('chart-sazonalidade');
    if (Chart.getChart(ctx)) Chart.getChart(ctx).destroy();
    new Chart(ctx, {
        type: 'bar',
        data: { labels: Object.keys(dados), datasets: [{ data: Object.values(dados), backgroundColor: CORES.primary, borderRadius: 4 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: { anchor: 'end', align: 'top', color: '#888', font: { size: 10, weight: 'bold' }, formatter: (v) => v > 0 ? (v/1000).toFixed(0) + 'k' : '' }
            },
            scales: { y: { ticks: { display: false } }, x: { ticks: { color: '#888', font: { size: 10 } } } }
        }
    });
}

function renderMixDonut(id, dados) {
    const ctx = document.getElementById(id);
    if (Chart.getChart(ctx)) Chart.getChart(ctx).destroy();
    new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(dados), datasets: [{ data: Object.values(dados), backgroundColor: CORES.sunset, borderColor: '#000', borderWidth: 2 }] },
        options: {
            layout: { padding: 10 },
            cutout: '70%',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#888', font: { size: 10 }, padding: 6 } },
                datalabels: { anchor: 'end', align: 'start', offset: 6, clamp: true, clip: true, color: '#fff', font: { size: 10, weight: 'bold' }, formatter: (v, ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); return ((v / total) * 100).toFixed(1) + '%'; } }
            }
        }
    });
}

function renderGauge(id, valor, labelId) {
    const ctx = document.getElementById(id);
    if (Chart.getChart(ctx)) Chart.getChart(ctx).destroy();
    const v = Math.min(100, Math.max(0, valor));
    document.getElementById(labelId).innerText = `${v.toFixed(1)}%`;
    let cor = '';
    if (v < 33) cor = CORES.prt;
    else if (v < 66) cor = CORES.primary;
    else cor = CORES.ace;
    new Chart(ctx, {
        type: 'doughnut',
        data: { datasets: [{ data: [v, 100 - v], backgroundColor: [cor, CORES.trilha], borderWidth: 0 }] },
        options: { cutout: '85%', responsive: true, maintainAspectRatio: false, plugins: { datalabels: { display: false }, tooltip: { enabled: false } } }
    });
}

function configurarEventosFiltro() {
    const selLoja = document.getElementById('filter-loja');
    if (selLoja && dadosDashboard.unidades) dadosDashboard.unidades.forEach(l => { const opt = document.createElement('option'); opt.value = l['ID LOJA']; opt.innerText = l['NOME PDV']; selLoja.appendChild(opt); });
    ['filter-loja', 'filter-tipo', 'filter-gestao'].forEach(id => { const el = document.getElementById(id); if(el) el.addEventListener('change', (e) => { AppState.filtro[id.replace('filter-', '')] = e.target.value; processarEDataRender(); }); });
}

function fmt(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v); }

function atualizarRelogio() { const el = document.getElementById('relogio'); if(el) el.innerText = new Date().toLocaleTimeString(); }