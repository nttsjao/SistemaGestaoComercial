import pandas as pd
import numpy as np
from datetime import datetime
from calendar import monthrange
import json

#TODO ==> 1. SISTEMA DE TEMPO E MÉTRICAS DE CALENDÁRIO
#? Função central para controle de períodos e cálculos de projeção (Mês Vigente)
def obter_metricas_tempo():
    hoje = datetime.now()
    mes_atual = hoje.month
    ano_atual = hoje.year
    dia_atual = hoje.day
    
    #* Cálculo de dias para Projeção e Atingimento Ideal
    _, total_dias = monthrange(ano_atual, mes_atual)
    restantes = max(total_dias - dia_atual, 1)
    atg_ideal = (dia_atual / total_dias) * 100
    
    return {
        "dia": dia_atual,
        "total": total_dias,
        "mes": mes_atual,
        "ano": ano_atual,
        "ideal": round(atg_ideal, 2)
    }

#* Função auxiliar para limpeza de dados monetários (R$ -> Float)
def limpar_moeda(valor):
    if valor is None or (isinstance(valor, float) and np.isnan(valor)):
        return 0.0
    if isinstance(valor, str):
        valor = valor.replace('R$', '').replace('.', '').replace(',', '.').strip()
        try:
            return float(valor) if valor != '' else 0.0
        except ValueError:
            return 0.0
    return float(valor)

#TODO ==> 2. KPIs GERAIS (VISÃO 1 - SNAPSHOT REDE)
#? Consolida os grandes números para os 5 cards do topo
def calcular_kpis_topo(db, df_meta):
    tempo = obter_metricas_tempo()
    df_snap = db['vendas_snapshot'].copy()
    
    #* Agregação de Realizados
    fat = df_snap['REALIZADO'].sum()
    vendas = df_snap['N_VENDAS'].sum()
    pecas = df_snap['QTD_PEÇAS'].sum()
    
    #* Agregação de Metas (Sincronizado com ID_LOJA do database_engine)
    meta_geral = df_meta['META_GERAL'].sum() if not df_meta.empty else 0
    
    return {
        'fat': float(fat),
        'vendas': int(vendas),
        'pecas': int(pecas),
        'ticket': float(fat / max(vendas, 1)),
        'pa': float(pecas / max(vendas, 1)),
        'atg_geral': float((fat / meta_geral * 100) if meta_geral > 0 else 0),
        'atg_ideal': tempo['ideal']
    }

#TODO ==> 3. ESTRUTURA TABULAR DE UNIDADES (BASE PARA TODAS AS VISÕES)
#? Cruza Fato e Dimensão para gerar performance por PDV, Projeção e Atingimentos
def preparar_base_unidades_completa(db, df_meta):
    tempo = obter_metricas_tempo()
    df_snap = db['vendas_snapshot'].copy()
    df_lojas = db['dim_lojas']
    
    #* 1. Realizado por Categoria (ACE e PRT dinâmicos para gauges)
    rel_cat = df_snap.groupby(['ID LOJA', 'CATEGORIA'])['REALIZADO'].sum().unstack(fill_value=0).reset_index()
    for col in ['ACE', 'PRT', 'CEL', 'SOM']:
        if col not in rel_cat: rel_cat[col] = 0

    #* 2. Realizado Total por Loja
    rel_total = df_snap.groupby('ID LOJA').agg({
        'REALIZADO': 'sum',
        'N_VENDAS': 'sum',
        'QTD_PEÇAS': 'sum'
    }).reset_index()

    #* 3. Merge de Metas e Realizados (Sincronização ID_LOJA x ID LOJA)
    df_tab = df_meta[['ID_LOJA', 'META_GERAL', 'META_ACE', 'META_PRT']].copy()
    df_tab = df_tab.merge(rel_total, left_on='ID_LOJA', right_on='ID LOJA', how='left').fillna(0)
    df_tab = df_tab.merge(rel_cat[['ID LOJA', 'ACE', 'PRT']], on='ID LOJA', how='left').fillna(0)
    
    #* 4. Merge com Dimensão Lojas (Nomes e Atributos)
    df_tab = df_tab.merge(df_lojas[['ID LOJA', 'NOME PDV', 'ID TIPO', 'TIPO PDV']], 
                          left_on='ID_LOJA', right_on='ID LOJA', how='left')

    #* 5. Métricas Calculadas (Projeção e Eficiência)
    df_tab['PROJECAO_VAL'] = (df_tab['REALIZADO'] / tempo['dia']) * tempo['total']
    df_tab['PROJECAO_PERC'] = (df_tab['PROJECAO_VAL'] / df_tab['META_GERAL'] * 100).replace([np.inf, -np.inf], 0).fillna(0)
    df_tab['TICKET'] = df_tab['REALIZADO'] / df_tab['N_VENDAS'].replace(0, 1)
    df_tab['PA'] = df_tab['QTD_PEÇAS'] / df_tab['N_VENDAS'].replace(0, 1)
    
    return df_tab.to_dict(orient='records')

#TODO ==> 4. ANÁLISE OPERACIONAL (SAZONALIDADE E MIXES)
#? Gera os dados para gráficos de Barras e Roscas (Somente Mês Vigente)
def preparar_analise_geral_completa(db):
    tempo = obter_metricas_tempo()
    df_snap = db['vendas_snapshot'].copy()
    
    #* 4.1 Sazonalidade (Faturamento por Dia da Semana)
    dias_map = {'Monday':'Seg', 'Tuesday':'Ter', 'Wednesday':'Qua', 'Thursday':'Qui', 'Friday':'Sex', 'Saturday':'Sáb', 'Sunday':'Dom'}
    df_snap['Dia_Semana'] = df_snap['Date'].dt.day_name().map(dias_map)
    ordem_dias = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
    sazonalidade = df_snap.groupby('Dia_Semana')['REALIZADO'].sum().reindex(ordem_dias).fillna(0).to_dict()

    #* 4.2 Mix de Categorias (Base Snapshot)
    mix_cat = df_snap.groupby('CATEGORIA')['REALIZADO'].sum().to_dict()

    #* 4.3 Mix de Planos (FILTRO MÊS VIGENTE + JOIN DIMENSÃO)
    df_plano = db['vendas_plano'].copy()
    df_plano['Date'] = pd.to_datetime(df_plano['Date'], dayfirst=True, errors='coerce')
    
    #? Filtro rigoroso: Apenas mês e ano atuais para Mix de Planos
    df_plano_vigente = df_plano[
        (df_plano['Date'].dt.month == tempo['mes']) & 
        (df_plano['Date'].dt.year == tempo['ano'])
    ].copy()
    
    df_plano_vigente['FATURADO'] = df_plano_vigente['FATURADO'].apply(limpar_moeda)
    df_plano_vigente = df_plano_vigente.merge(db['dim_planos'], on='ID PLANO', how='left')
    mix_planos = df_plano_vigente.groupby('PLANO')['FATURADO'].sum().sort_values(ascending=False).to_dict()

    return {
        'sazonalidade': sazonalidade,
        'mix_categorias': mix_cat,
        'mix_planos': mix_planos
    }

#TODO ==> 5. EXPORTADOR DE DADOS (DADOS.JS)
#? Compila todas as métricas em um JSON estruturado para o Frontend
def exportar_dados_dashboard(db, df_metas_pdv, df_metas_vend, caminho_destino='dashboard/dados.js'):
    try:
        #* Garantia de datas formatadas no Snapshot
        db['vendas_snapshot']['Date'] = pd.to_datetime(db['vendas_snapshot']['Date'], dayfirst=True, errors='coerce')
        
        payload = {
            "ultima_atualizacao": datetime.now().strftime("%d/%m/%Y %H:%M"),
            "tempo": obter_metricas_tempo(),
            "geral": calcular_kpis_topo(db, df_metas_pdv),
            "unidades": preparar_base_unidades_completa(db, df_metas_pdv),
            "analise_geral": preparar_analise_geral_completa(db),
            "vendedores": db['vendas_snapshot'].groupby('VENDEDOR')['REALIZADO'].sum().sort_values(ascending=False).to_dict()
        }
        
        #* Escrita física do arquivo JS
        with open(caminho_destino, 'w', encoding='utf-8') as f:
            f.write(f"const dadosDashboard = {json.dumps(payload, indent=4, ensure_ascii=False)};")
        
        print(f"✅ Sucesso: Métricas processadas e exportadas para {caminho_destino}")
        return True
    except Exception as e:
        print(f"❌ Erro Crítico no Processamento: {e}")
        return False