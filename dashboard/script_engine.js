Chart.register(ChartDataLabels);

const AppState = { filtro: { loja: 'ALL', modelo: 'ALL', gestao: 'ALL' } };

const CORES = {
    primary: '#f2c029',
    ace: '#2ecc71',     // Verde (Sucesso)
    prt: '#ff4d4d',     // Vermelho (Alerta)
    trilha: '#121212',
    sunset: ['#FFD700', '#F2C029', '#FFA500', '#FF8C00', '#FF7F50']
};

const PALETAS_MIX = {
    categorias:{
        'CEL': '#FFB347',
        'ACE': '#E67E22',
        'SOM': '#8B0000',
        'PRT': '#A9A9A9'
    },
    planos: {
        'CREDIÁRIO': '#E67E22',
        'DINHEIRO': '#2E8B57',
        'CARTÃO': '#0047AB',
        'BRASILCARD': '#8B0000',
        'ODRES F': '#116466'  
    }
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
    
    iniciarRoteamento();
});

window.addEventListener('resize', () => processarEDataRender());

// ==========================================
// MOTOR DE FILTRAGEM GLOBAL
// ==========================================
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

// ==========================================
// PROCESSAMENTO PRINCIPAL
// ==========================================
function processarEDataRender() {
    const d = dadosDashboard;
    const baseFiltrada = filtrarBase(d.unidades);
    const atingIdeal = d.tempo?.ideal ?? 0;

    // --- VISÃO GERAL ---
    const stats = baseFiltrada.reduce((acc, curr) => {
        acc.faturamento += curr.REALIZADO || 0;
        acc.vendas += curr.N_VENDAS || 0;
        acc.pecas += curr.QTD_PEÇAS || 0;
        return acc;
    }, { faturamento: 0, vendas: 0, pecas: 0 });

    renderKpiCards(stats);

    const metas = baseFiltrada.reduce((acc, curr) => {
        acc.real_g += curr.REALIZADO || 0; acc.meta_g += curr.META_GERAL || 0;
        acc.real_a += curr.ACE || 0; acc.meta_a += curr.META_ACE || 0;
        acc.real_p += curr.PRT || 0; acc.meta_p += curr.META_PRT || 0;
        return acc;
    }, { real_g: 0, meta_g: 0, real_a: 0, meta_a: 0, real_p: 0, meta_p: 0 });

    renderGauge('chart-atg-geral', (metas.real_g / (metas.meta_g || 1) * 100), 'val-geral', atingIdeal);
    renderGauge('chart-atg-ace', (metas.real_a / (metas.meta_a || 1) * 100), 'val-ace', atingIdeal);
    renderGauge('chart-atg-prt', (metas.real_p / (metas.meta_p || 1) * 100), 'val-prt', atingIdeal);

    const dynSaz = { 'Seg': 0, 'Ter': 0, 'Qua': 0, 'Qui': 0, 'Sex': 0, 'Sáb': 0, 'Dom': 0 };
    const dynCat = { 'CEL': 0, 'SOM': 0, 'ACE': 0, 'PRT': 0 };
    const dynPlanos = {};

    baseFiltrada.forEach(loja => {
        const sazLocal = loja.sazonalidade || {};
        Object.keys(sazLocal).forEach(dia => { if(dynSaz.hasOwnProperty(dia)) dynSaz[dia] += sazLocal[dia] || 0; });

        const catLocal = loja.mix_categorias || {};
        Object.keys(catLocal).forEach(cat => { if(dynCat.hasOwnProperty(cat)) dynCat[cat] += catLocal[cat] || 0; });

        const planosLocal = loja.mix_planos || {};
        Object.keys(planosLocal).forEach(plano => {
            dynPlanos[plano] = (dynPlanos[plano] || 0) + (planosLocal[plano] || 0);
        });
    });

    const planosFinal = Object.fromEntries(Object.entries(dynPlanos).filter(([_, v]) => v > 0));

    renderSazonalidade(dynSaz);
    renderMixDonut('chart-mix-cat', dynCat, PALETAS_MIX.categorias);
    renderMixDonut('chart-mix-planos', planosFinal, PALETAS_MIX.planos);

    // --- VISÃO UNIDADES ---
    renderCardsUnidades(baseFiltrada, metas, d.tempo);
    renderGraficosHibridos(baseFiltrada); // [NOVO D07]
    renderTabelaUnidades(baseFiltrada, d.tempo);

    document.getElementById('last-update').innerText = d.ultima_atualizacao;
}

// ==========================================
// MÓDULOS DA VISÃO UNIDADES
// ==========================================

function renderCardsUnidades(baseFiltrada, metas, tempo) {
    const diasTotalMes = tempo?.total ?? 30;
    const diaAtual = tempo?.dia ?? 1;

    const fatDiarioRede = {};
    const metaDiariaOriginalRede = {};
    
    baseFiltrada.forEach(loja => {
        const metaGerLocal = loja.META_GERAL || 0;
        const metaDiariaOrigLocal = metaGerLocal / diasTotalMes; 
        
        if (loja.historico_diario && Array.isArray(loja.historico_diario)) {
            loja.historico_diario.forEach(diaExtrato => {
                const data = diaExtrato.Date;
                if (!fatDiarioRede[data]) {
                    fatDiarioRede[data] = 0;
                    metaDiariaOriginalRede[data] = 0;
                }
                fatDiarioRede[data] += diaExtrato.REALIZADO || 0;
                metaDiariaOriginalRede[data] += metaDiariaOrigLocal;
            });
        }
    });

    const datasOrdenadas = Object.keys(fatDiarioRede).sort((a,b) => new Date(a) - new Date(b));
    let fatD1 = 0;
    let fatD2 = 0;
    let crescimento = 0;

    if (datasOrdenadas.length > 0) {
        const dataD1 = datasOrdenadas[datasOrdenadas.length - 1]; 
        fatD1 = fatDiarioRede[dataD1];
        
        if (datasOrdenadas.length > 1) {
            const dataD2 = datasOrdenadas[datasOrdenadas.length - 2]; 
            fatD2 = fatDiarioRede[dataD2];
            
            if (fatD2 > 0) {
                crescimento = ((fatD1 - fatD2) / fatD2) * 100;
            }
        }
    }

    let totalDiasAvaliados = 0;
    let diasMetaBatida = 0;
    datasOrdenadas.forEach(data => {
        totalDiasAvaliados++;
        if (fatDiarioRede[data] >= metaDiariaOriginalRede[data]) diasMetaBatida++;
    });
    const constancia = totalDiasAvaliados > 0 ? (diasMetaBatida / totalDiasAvaliados) * 100 : 0;

    const esperadoHoje = (metas.meta_g / diasTotalMes) * diaAtual;
    const gapRitmo = metas.real_g - esperadoHoje;

    const elFatD1 = document.querySelector('#kpi-uni-fat-d1 b');
    const elCresc = document.getElementById('val-crescimento-d1');
    if (elFatD1) elFatD1.innerText = fmt(fatD1);
    if (elCresc) {
        if (datasOrdenadas.length > 1) {
            const icone = crescimento >= 0 ? '▲' : '▼';
            const cor = crescimento >= 0 ? CORES.ace : CORES.prt;
            elCresc.innerHTML = `<span style="color: ${cor}">${icone} ${Math.abs(crescimento).toFixed(1)}%</span>`;
        } else {
            elCresc.innerHTML = `<span style="color: var(--text-dim)">--</span>`;
        }
    }

    const elEsperado = document.querySelector('#kpi-uni-esperado b');
    if (elEsperado) elEsperado.innerText = fmt(esperadoHoje);

    const elGap = document.querySelector('#kpi-uni-gap b');
    if (elGap) {
        elGap.innerText = fmt(gapRitmo);
        elGap.style.color = gapRitmo >= 0 ? CORES.ace : CORES.prt;
    }

    const elConst = document.querySelector('#kpi-uni-constancia b');
    if (elConst) {
        elConst.innerText = `${constancia.toFixed(1)}%`;
        if (constancia >= 80) elConst.style.color = CORES.ace;
        else if (constancia >= 50) elConst.style.color = CORES.primary;
        else elConst.style.color = CORES.prt;
    }
}

// ==========================================
// [D07] GRÁFICOS HÍBRIDOS
// ==========================================
function renderGraficosHibridos(baseFiltrada) {
    // --- DADOS PARA GRÁFICO 1 (MODELO: COMBO BARRAS + LINHA) ---
    const dadosModelo = {
        'LOJA': { fat: 0, meta: 0 },
        'QUIOSQUE': { fat: 0, meta: 0 }
    };

    baseFiltrada.forEach(loja => {
        const id = Number(loja['ID TIPO']);
        const modelo = (id === 1 || id === 2) ? 'LOJA' : 'QUIOSQUE';
        dadosModelo[modelo].fat += loja.REALIZADO || 0;
        dadosModelo[modelo].meta += loja.META_GERAL || 0;
    });

    const labelsModelo = Object.keys(dadosModelo);
    const faturamentoModelo = labelsModelo.map(m => dadosModelo[m].fat);
    const atingimentoModelo = labelsModelo.map(m => (dadosModelo[m].meta > 0 ? (dadosModelo[m].fat / dadosModelo[m].meta) * 100 : 0));

    renderComboModelo('chart-hibrido-modelo', labelsModelo, faturamentoModelo, atingimentoModelo);

    // --- DADOS PARA GRÁFICO 2 (GESTÃO: SÉRIE TEMPORAL / LINHAS) ---
    const timelinePropria = {};
    const timelineFranquia = {};

    baseFiltrada.forEach(loja => {
        const id = Number(loja['ID TIPO']);
        const gestao = (id === 1 || id === 3) ? 'PRÓPRIA' : 'FRANQUIA';
        
        if (loja.historico_diario && Array.isArray(loja.historico_diario)) {
            loja.historico_diario.forEach(dia => {
                const dataStr = dia.Date; 
                if (gestao === 'PRÓPRIA') {
                    timelinePropria[dataStr] = (timelinePropria[dataStr] || 0) + (dia.REALIZADO || 0);
                } else {
                    timelineFranquia[dataStr] = (timelineFranquia[dataStr] || 0) + (dia.REALIZADO || 0);
                }
            });
        }
    });

    const datasOrdenadas = Object.keys({...timelinePropria, ...timelineFranquia}).sort((a,b) => new Date(a) - new Date(b));
    const datasetPropria = datasOrdenadas.map(d => timelinePropria[d] || 0);
    const datasetFranquia = datasOrdenadas.map(d => timelineFranquia[d] || 0);
    
    const labelsDatas = datasOrdenadas.map(d => d.split('-')[2]);

    renderLinhasGestao('chart-hibrido-gestao', labelsDatas, datasetPropria, datasetFranquia);
}

function renderComboModelo(id, labels, dataFat, dataAting) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (Chart.getChart(ctx)) Chart.getChart(ctx).destroy();

    new Chart(ctx, {
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Faturamento',
                    data: dataFat,
                    backgroundColor: '#895129',
                    borderRadius: 4,
                    yAxisID: 'y',
                    order: 2
                },
                {
                    type: 'line',
                    label: 'Atingimento %',
                    data: dataAting,
                    borderColor: '#fff',
                    borderWidth: 2,
                    pointBackgroundColor: CORES.ace,
                    tension: 0.4,
                    yAxisID: 'y1',
                    order: 1,
                    datalabels: { align: 'top', formatter: (v) => v.toFixed(1) + '%' }
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: {
                    color: '#c6c6c6', font: { size: 10, weight: 'bold' },
                    formatter: (v, context) => {
                        if (context.dataset.type === 'line') return v.toFixed(1) + '%';
                        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(v);
                    }
                }
            },
            scales: {
                y: { display: false, position: 'left' },
                y1: { display: false, position: 'right', min: 0, max: Math.max(...dataAting) + 20 },
                x: { grid: { display: false }, ticks: { color: '#888', font: { size: 10 } } }
            }
        }
    });
}

function renderLinhasGestao(id, labels, dataPropria, dataFranquia) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (Chart.getChart(ctx)) Chart.getChart(ctx).destroy();

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'PRÓPRIA', data: dataPropria, borderColor: CORES.primary, borderWidth: 2, pointRadius: 0, tension: 0.3, fill: false },
                { label: 'FRANQUIA', data: dataFranquia, borderColor: '#555', borderWidth: 2, pointRadius: 0, tension: 0.3, fill: false }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', align: 'end', labels: { color: '#888', boxWidth: 10, font: { size: 10 } } },
                datalabels: { display: false } 
            },
            scales: {
                y: { display: true, grid: { color: '#1a1a1a' }, ticks: { color: '#444', font: { size: 8 }, callback: (v) => 'R$ ' + (v/1000) + 'k' } },
                x: { grid: { display: false }, ticks: { color: '#888', font: { size: 9 } } }
            }
        }
    });
}

function renderTabelaUnidades(baseFiltrada, tempo) {
    const tbody = document.getElementById('tbody-unidades');
    if (!tbody) return;
    
    tbody.innerHTML = ''; 
    const diasRestantes = Math.max((tempo?.total ?? 30) - (tempo?.dia ?? 1), 1);

    baseFiltrada.forEach(loja => {
        const pdv = loja['NOME PDV'] || 'N/A';
        const meta = loja.META_GERAL || 0;
        const fat = loja.REALIZADO || 0;
        
        const atingGeral = meta > 0 ? (fat / meta) * 100 : 0;
        
        let metaDiaria = (meta - fat) / diasRestantes;
        if (metaDiaria < 0) metaDiaria = 0; 

        const projVal = loja.PROJECAO_VAL || 0;
        const projPerc = loja.PROJECAO_PERC || 0;
        
        let corProj = 'var(--text-main)';
        if (projPerc >= 100) corProj = CORES.ace; 
        else if (projPerc >= 80) corProj = CORES.primary; 
        else corProj = CORES.prt; 

        const ticket = loja.TICKET || 0;
        const pa = loja.PA || 0;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 700;">${pdv}</td>
            <td>${fmt(meta)}</td>
            <td>${fmt(fat)}</td>
            <td>${atingGeral.toFixed(1)}%</td>
            <td style="color: ${corProj}; font-weight: 800;">${fmt(projVal)}</td>
            <td style="color: var(--text-dim);">${fmt(metaDiaria)}</td>
            <td>${fmt(ticket)}</td>
            <td>${pa.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// FUNÇÕES AUXILIARES GERAIS
// ==========================================

function renderKpiCards(stats) {
    document.querySelector('#kpi-fat b').innerText = fmt(stats.faturamento);
    document.querySelector('#kpi-vendas b').innerText = stats.vendas.toLocaleString();
    document.querySelector('#kpi-pecas b').innerText = stats.pecas.toLocaleString();
    document.querySelector('#kpi-ticket b').innerText = fmt(stats.faturamento / Math.max(stats.vendas, 1));
    document.querySelector('#kpi-pa b').innerText = (stats.pecas / Math.max(stats.vendas, 1)).toFixed(2);
}

function renderSazonalidade(dados) {
    const ctx = document.getElementById('chart-sazonalidade');
    if (!ctx) return;
    if (Chart.getChart(ctx)) Chart.getChart(ctx).destroy();

    new Chart(ctx, {
        type: 'bar',
        data: { labels: Object.keys(dados), datasets: [{ data: Object.values(dados), backgroundColor: CORES.primary, borderRadius: 4 }] },
        options: {
            responsive: true, maintainAspectRatio: false, layout: { padding: { top: 20 } },
            plugins: {
                legend: { display: false },
                datalabels: { 
                    display: true, anchor: 'end', align: 'end', color: '#888', font: { size: 10, weight: 'bold' },
                    formatter: (v) => v === 0 ? '' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(v)
                }
            },
            scales: { y: { grid: { color: '#1a1a1a', borderDash: [2, 2] }, ticks: { display: false }, beginAtZero: true, grace: '10%' }, x: { grid: { display: false }, ticks: { color: '#888', font: { size: 10 } } } }
        }
    });
}

function renderMixDonut(id, dados, paleta) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (Chart.getChart(ctx)) Chart.getChart(ctx).destroy();

    new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(dados), datasets: [{ data: Object.values(dados), backgroundColor: Object.keys(dados).map(chave => paleta[chave] || '#444444'), borderColor: '#121212', borderWidth: 2 }] },
        options: { 
            layout: { padding: { top: 10, bottom: 10, left: 25, right: 25 } }, radius: 90, cutout: 60, responsive: true, maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'bottom', labels: { color: '#888', font: { size: 10 }, padding: 20, boxWidth: 10 } },
                datalabels: { anchor: 'end', align: 'end', offset: 8, color: '#fff', font: { size: 10, weight: 'bold' },
                    formatter: (v, ctx) => { 
                        const total = ctx.dataset.data.reduce((a, b) => a + b, 0); 
                        if (total === 0) return '';
                        const perc = (v / total) * 100;
                        return perc >= 2 ? perc.toFixed(1) + '%' : ''; 
                    }
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

// ==========================================
// ROTEAMENTO SPA
// ==========================================
function iniciarRoteamento() {
    const botoesMenu = document.querySelectorAll('.nav-item[data-target]');
    const secoes = document.querySelectorAll('.view-section');
    const tituloPagina = document.getElementById('current-view-title');
    
    const filtroLoja = document.getElementById('container-filtro-loja');
    const filtroData = document.getElementById('container-filtro-data');

    function aplicarRegraDeFiltros(targetId) {
        if (targetId === 'visao-geral') {
            if (filtroLoja) filtroLoja.style.display = 'flex';
            if (filtroData) filtroData.style.display = 'none';
        } else if (targetId === 'visao-unidades') {
            if (filtroLoja) filtroLoja.style.display = 'none';
            if (filtroData) filtroData.style.display = 'flex';
        } else {
            if (filtroLoja) filtroLoja.style.display = 'none';
            if (filtroData) filtroData.style.display = 'none';
        }
    }

    botoesMenu.forEach(botao => {
        botao.addEventListener('click', () => {
            botoesMenu.forEach(b => b.classList.remove('active'));
            secoes.forEach(s => s.classList.remove('active'));

            botao.classList.add('active');

            const targetId = botao.getAttribute('data-target');
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.classList.add('active');
            }

            const textoBotao = botao.querySelector('.nav-text');
            if (textoBotao) {
                tituloPagina.innerText = textoBotao.innerText;
            }

            aplicarRegraDeFiltros(targetId);
        });
    });

    aplicarRegraDeFiltros('visao-geral');
}