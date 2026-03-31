import pandas as pd
from datetime import datetime
import os

# CONFIGURAÇÃO DE CAMINHOS
CAMINHO_DIM = 'dimensoes.xlsx'
CAMINHO_DB = r"C:\Users\PHONE STORE\Documents\Análise de Dados PHONE STORE\Dados Phone Store Base.xlsx"

def limpar_moedas(valor):
    if isinstance(valor, str):
        valor = valor.replace('R$', '').replace('.', '').replace(',', '.').strip()
        try:
            return float(valor) if valor not in ['-', ''] else 0.0
        except:
            return 0.0
    return float(valor) if pd.notnull(valor) else 0.0

def carregar_banco_dados(mes_referencia=None, ano_referencia=None):
    try:
        print(f"🔍 Conectando aos bancos de dados...")
        
        if not os.path.exists(CAMINHO_DIM) or not os.path.exists(CAMINHO_DB):
            raise FileNotFoundError("Arquivos de base (.xlsx) não encontrados.")

        # 1. CARGA DAS DIMENSÕES
        df_lojas = pd.read_excel(CAMINHO_DIM, sheet_name='Lojas')
        df_vendedores = pd.read_excel(CAMINHO_DIM, sheet_name='Vendedores')
        df_planos = pd.read_excel(CAMINHO_DIM, sheet_name='Planos')
        
        # 2. CARGA DAS VENDAS (Removido 'dayfirst' daqui pois não existe em excel)
        df_cat = pd.read_excel(CAMINHO_DB, sheet_name='F_Vendas_cat')
        df_plano = pd.read_excel(CAMINHO_DB, sheet_name='F_Vendas_Plano')
        df_prod = pd.read_excel(CAMINHO_DB, sheet_name='F_Vendas_Prod')

        # 3. PADRONIZAÇÃO DE IDS
        for df in [df_lojas, df_cat]: df['ID LOJA'] = df['ID LOJA'].astype(str)
        for df in [df_vendedores, df_cat, df_plano]: df['ID VENDEDOR'] = df['ID VENDEDOR'].astype(str)
        for df in [df_planos, df_plano]: df['ID PLANO'] = df['ID PLANO'].astype(str)

        # 4. TRATAMENTO DE DATAS (Onde o 'dayfirst' realmente funciona)
        df_cat['Date'] = pd.to_datetime(df_cat['Date'], dayfirst=True, errors='coerce')
        df_plano['Date'] = pd.to_datetime(df_plano['Date'], dayfirst=True, errors='coerce')
        
        hoje = datetime.now()
        mes = mes_referencia or hoje.month
        ano = ano_referencia or hoje.year

        # 5. LIMPEZA MONETÁRIA
        df_cat['REALIZADO'] = df_cat['REALIZADO'].apply(limpar_moedas)
        df_plano['FATURADO'] = df_plano['FATURADO'].apply(limpar_moedas)
        df_prod['REALIZADO'] = df_prod['REALIZADO'].apply(limpar_moedas)

        # 6. FILTRO DE MÊS VIGENTE
        df_snapshot = df_cat[(df_cat['Date'].dt.month == mes) & (df_cat['Date'].dt.year == ano)].copy()
        
        metas_pdv = carregar_metas_pdv(mes, ano)
        metas_vend = carregar_metas_vendedor(mes, ano)

        db = {
            'vendas_snapshot': df_snapshot,
            'vendas_plano': df_plano,
            'vendas_prod': df_prod,
            'dim_lojas': df_lojas,
            'dim_vendedores': df_vendedores,
            'dim_planos': df_planos
        }

        print(f"✅ Sucesso: {len(df_snapshot)} linhas processadas.")
        return db, metas_pdv, metas_vend

    except Exception as e:
        print(f"❌ Erro no Database Engine: {e}")
        return None, None, None

def carregar_metas_pdv(mes, ano):
    df = pd.read_excel(CAMINHO_DB, sheet_name='F_MetasPDV')
    df.columns = ['Date', 'ID_LOJA', 'META_GERAL', 'META_CEL', 'META_ACE', 'META_SOM', 'META_PRT']
    df['ID_LOJA'] = df['ID_LOJA'].astype(str)
    for col in df.columns[2:]: df[col] = df[col].apply(limpar_moedas)
    
    ref = f"{str(mes).zfill(2)}/{str(ano)[2:]}"
    df['Date'] = pd.to_datetime(df['Date'], errors='coerce')
    df['Date_Str'] = df['Date'].dt.strftime('%m/%y')
    return df[df['Date_Str'] == ref].copy()

def carregar_metas_vendedor(mes, ano):
    df = pd.read_excel(CAMINHO_DB, sheet_name='F_MetasVendedor')
    df.columns = ['Date', 'ID_LOJA2', 'ID_VENDEDOR', 'CARGO', 'VENDEDOR', 'PESO_REL', 'META_GERAL', 'META_ACE', 'META_PRT']
    df['ID_VENDEDOR'] = df['ID_VENDEDOR'].astype(str)
    for col in ['META_GERAL', 'META_ACE', 'META_PRT']: df[col] = df[col].apply(limpar_moedas)
    
    ref = f"{str(mes).zfill(2)}/{str(ano)[2:]}"
    df['Date'] = pd.to_datetime(df['Date'], errors='coerce')
    df['Date_Str'] = df['Date'].dt.strftime('%m/%y')
    return df[df['Date_Str'] == ref].copy()