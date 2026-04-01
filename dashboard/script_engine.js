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

function filtrarBase(base) {
    if (!base) return [];
    return base.filter(item => {
        const matchLoja = AppState.filtro.loja === 'ALL' || String(item['ID_LOJA']) === String(AppState.filtro.loja);

        const modelo = (item['ID TIPO'] == 1 || item['ID TIPO'] == 2) ? 'LOJA' : 'QUIOSQUE';
        const gestao = (item['ID TIPO'] == 1 || item['ID TIPO'] == 3) ? 'PRÓPRIA' : 'FRANQUIA';

        return matchLoja &&
               (AppState.filtro.modelo === 'ALL' || modelo === AppState.filtro.modelo) &&
               (AppState.filtro.gestao === 'ALL' || gestao === AppState.filtro.gestao);
    });
}

function processarEDataRender() {
    const d = dadosDashboard;
    const baseFiltrada = filtrarBase(d.unidades);

    const stats = baseFiltrada.reduce((acc, curr) => {
        acc.faturamento += curr.REALIZADO || 0;
        acc.vendas += curr.N_VENDAS || 0;
        acc.pecas += curr.QTD_PEÇAS || 0;
        return acc;
    }, {faturamento:0, vendas:0, pecas:0});

    renderKpiCards(stats);

    const metas = baseFiltrada.reduce((acc, curr) => {
        acc.real_g += curr.REALIZADO||0; acc.meta_g += curr.META_GERAL||0;
        acc.real_a += curr.ACE||0; acc.meta_a += curr.META_ACE||0;
        acc.real_p += curr.PRT||0; acc.meta_p += curr.META_PRT||0;
        return acc;
    }, {real_g:0, meta_g:0, real_a:0, meta_a:0, real_p:0, meta_p:0});

    renderGauge('chart-atg-geral', (metas.real_g/(metas.meta_g||1)*100), 'val-geral');
    renderGauge('chart-atg-ace', (metas.real_a/(metas.meta_a||1)*100), 'val-ace');
    renderGauge('chart-atg-prt', (metas.real_p/(metas.meta_p||1)*100), 'val-prt');

    renderSazonalidade(d.analise_geral.sazonalidade);
    renderMixDonut('chart-mix-cat', d.analise_geral.mix_categorias);
    renderMixDonut('chart-mix-planos', d.analise_geral.mix_planos);

    document.getElementById('last-update').innerText = d.ultima_atualizacao;
}

function renderKpiCards(stats) {

    const faturamento = stats.faturamento;
    const vendas = stats.vendas;
    const pecas = stats.pecas;

    const ticket = faturamento / Math.max(vendas,1);
    const pa = pecas / Math.max(vendas,1);

    document.querySelector('#kpi-fat b').innerText = fmt(faturamento);
    document.querySelector('#kpi-vendas b').innerText = vendas.toLocaleString();
    document.querySelector('#kpi-pecas b').innerText = pecas.toLocaleString();
    document.querySelector('#kpi-ticket b').innerText = fmt(ticket);
    document.querySelector('#kpi-pa b').innerText = pa.toFixed(2);
}

function renderSazonalidade(dados) {
    const ctx = document.getElementById('chart-sazonalidade');
    if (Chart.getChart(ctx)) Chart.getChart(ctx).destroy();

    new Chart(ctx, {
        type:'bar',
        data:{
            labels:Object.keys(dados),
            datasets:[{
                data:Object.values(dados),
                backgroundColor:CORES.primary,
                borderRadius:4
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            plugins:{
                legend:{display:false},
                datalabels:{display:false}
            },
            scales:{
                y:{grid:{color:'#1a1a1a',borderDash:[2,2]},ticks:{display:false}},
                x:{grid:{display:false}, ticks:{color:'#888', font:{size:10}}}
            }
        }
    });
}

function renderMixDonut(id,dados){
    const ctx=document.getElementById(id);
    if(Chart.getChart(ctx)) Chart.getChart(ctx).destroy();

    new Chart(ctx,{
        type:'doughnut',
        data:{
            labels:Object.keys(dados),
            datasets:[{
                data:Object.values(dados),
                backgroundColor:CORES.sunset,
                borderColor:'#000',
                borderWidth:2
            }]
        },
        options:{
            layout:{padding:{top:40,bottom:20,left:10,right:10}},
            cutout:'72%',
            responsive:true,
            maintainAspectRatio:false,
            plugins:{
                legend:{position:'bottom', labels:{color:'#888', font:{size:10}, padding:8, boxWidth:8}},
                datalabels:{
                    anchor:'end',
                    align:'end',
                    offset:15,
                    color:'#fff',
                    font:{size:10,weight:'bold'},
                    formatter:(v,ctx)=>{
                        const total=ctx.dataset.data.reduce((a,b)=>a+b,0);
                        return ((v/total)*100).toFixed(1)+'%';
                    }
                }
            }
        }
    });
}

function renderGauge(id, valor, labelId){
    const ctx=document.getElementById(id);
    if(Chart.getChart(ctx)) Chart.getChart(ctx).destroy();

    const v=Math.min(100,Math.max(0,valor));
    let cor=v<33?CORES.prt:v<66?CORES.primary:CORES.ace;

    document.getElementById(labelId).innerText=`${v.toFixed(1)}%`;

    new Chart(ctx,{
        type:'doughnut',
        data:{
            datasets:[{
                data:[v,100-v],
                backgroundColor:[cor,CORES.trilha],
                borderWidth:0
            }]
        },
        options:{
            cutout:'88%',
            responsive:true,
            maintainAspectRatio:false,
            plugins:{
                datalabels:{display:false},
                tooltip:{enabled:false}
            }
        }
    });
}

function configurarEventosFiltro(){
    const selLoja=document.getElementById('filter-loja');

    if(selLoja && dadosDashboard.unidades){
        dadosDashboard.unidades.forEach(l=>{
            const opt=document.createElement('option'); 
            opt.value=l['ID_LOJA']; 
            opt.innerText=l['NOME PDV']; 
            selLoja.appendChild(opt);
        });
    }

    ['filter-loja','filter-tipo','filter-gestao'].forEach(id=>{
        const el=document.getElementById(id);
        if(el) el.addEventListener('change', e=>{
            AppState.filtro[id.replace('filter-','')]=e.target.value; 
            processarEDataRender();
        });
    });
}

function fmt(v){
    return new Intl.NumberFormat('pt-BR',{
        style:'currency',
        currency:'BRL',
        maximumFractionDigits:0
    }).format(v);
}

function atualizarRelogio(){
    const el=document.getElementById('relogio');
    if(el) el.innerText=new Date().toLocaleTimeString();
}