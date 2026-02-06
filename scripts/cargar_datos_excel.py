#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para cargar datos desde Excel a PostgreSQL
Genera embeddings para búsqueda vectorial
"""

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
import os
import sys
import time
from openai import OpenAI

# Configuración
EXCEL_NOMENCLADORES = './NOMENCLADORES_GENERALES.xlsx'
EXCEL_PRESTADORES = './PRESTADORES_PRINCIPALES.xlsx'
EXCEL_ACUERDOS = './ACUERDO_PRESTADORES.xlsx'

# PostgreSQL
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', 5432),
    'database': os.getenv('DB_NAME', 'medical_ocr'),
    'user': os.getenv('DB_USER', 'medical_ocr'),
    'password': os.getenv('DB_PASSWORD', 'medical_ocr')
}

# OpenAI
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
client = OpenAI(api_key=OPENAI_API_KEY)

def log(msg):
    """Log con timestamp"""
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}")

def conectar_db():
    """Conectar a PostgreSQL"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        log("✅ Conectado a PostgreSQL")
        return conn
    except Exception as e:
        log(f"❌ Error conectando a PostgreSQL: {e}")
        sys.exit(1)

def normalizar_texto(texto):
    """Normalizar texto: minúsculas, sin tildes"""
    if pd.isna(texto):
        return None
    
    texto = str(texto).lower()
    
    # Reemplazar tildes
    reemplazos = {
        'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
        'ä': 'a', 'ë': 'e', 'ï': 'i', 'ö': 'o', 'ü': 'u',
        'ñ': 'n'
    }
    
    for old, new in reemplazos.items():
        texto = texto.replace(old, new)
    
    return texto

def generar_embedding(texto, max_retries=3):
    """Generar embedding usando OpenAI"""
    if not texto or pd.isna(texto):
        return None
    
    for intento in range(max_retries):
        try:
            response = client.embeddings.create(
                model="text-embedding-3-small",
                input=str(texto)[:8000]  # Límite de tokens
            )
            return response.data[0].embedding
        except Exception as e:
            if intento < max_retries - 1:
                log(f"⚠️  Error generando embedding (intento {intento+1}/{max_retries}): {e}")
                time.sleep(2 ** intento)  # Backoff exponencial
            else:
                log(f"❌ Error generando embedding después de {max_retries} intentos: {e}")
                return None

def generar_embeddings_batch(textos, batch_size=100, delay=0.5):
    """Generar embeddings en batch"""
    embeddings = []
    total = len(textos)
    
    for i in range(0, total, batch_size):
        batch = textos[i:i+batch_size]
        log(f"Generando embeddings {i+1}-{min(i+batch_size, total)} de {total}...")
        
        batch_embeddings = []
        for texto in batch:
            emb = generar_embedding(texto)
            batch_embeddings.append(emb)
            time.sleep(0.05)  # Rate limiting suave
        
        embeddings.extend(batch_embeddings)
        
        if i + batch_size < total:
            time.sleep(delay)
    
    return embeddings

def extraer_grupo_subgrupo(id_nomenclador):
    """Extraer grupo y subgrupo del código"""
    codigo_str = str(id_nomenclador)
    
    grupo = codigo_str[:2] if len(codigo_str) >= 2 else None
    subgrupo = codigo_str[:4] if len(codigo_str) >= 4 else None
    
    return grupo, subgrupo

# ==================================================================
# CARGAR PRESTADORES
# ==================================================================
def cargar_prestadores(conn):
    """Cargar prestadores desde Excel"""
    log("📊 Cargando PRESTADORES desde Excel...")
    
    df = pd.read_excel(EXCEL_PRESTADORES)
    
    log(f"   Registros: {len(df)}")
    log(f"   Columnas: {list(df.columns)}")
    
    # Limpiar datos
    df = df.rename(columns={
        'ID_PRESTADOR': 'id_prestador',
        'RUC': 'ruc',
        'NOMBRE_FANTASIA': 'nombre_fantasia',
        'RAZ_SOC_NOMBRE': 'raz_soc_nombre',
        'REGISTRO_PROFESIONAL': 'registro_profesional',
        'RANKING': 'ranking',
        'CANTIDAD': 'cantidad_acuerdos'
    })
    
    # Normalizar nombres
    df['nombre_normalizado'] = df['nombre_fantasia'].apply(normalizar_texto)
    
    # Generar embeddings
    log("   Generando embeddings para nombres...")
    textos_embedding = df['nombre_fantasia'].fillna('').astype(str).tolist()
    embeddings = generar_embeddings_batch(textos_embedding, batch_size=50)
    
    # Insertar en BD
    cur = conn.cursor()
    
    # Limpiar tabla
    cur.execute("TRUNCATE TABLE prestadores CASCADE")
    
    log("   Insertando en PostgreSQL...")
    
    records = []
    for idx, row in df.iterrows():
        embedding = embeddings[idx]
        embedding_str = f"[{','.join(map(str, embedding))}]" if embedding else None
        
        records.append((
            int(row['id_prestador']),
            str(row['ruc']) if pd.notna(row['ruc']) else None,
            str(row['nombre_fantasia']) if pd.notna(row['nombre_fantasia']) else None,
            str(row['raz_soc_nombre']) if pd.notna(row['raz_soc_nombre']) else None,
            str(row['registro_profesional']) if pd.notna(row['registro_profesional']) else None,
            float(row['ranking']) if pd.notna(row['ranking']) else None,
            embedding_str,
            str(row['nombre_normalizado']) if pd.notna(row['nombre_normalizado']) else None,
            int(row['cantidad_acuerdos']) if pd.notna(row['cantidad_acuerdos']) else 0
        ))
    
    execute_values(
        cur,
        """
        INSERT INTO prestadores (
            id_prestador, ruc, nombre_fantasia, raz_soc_nombre,
            registro_profesional, ranking, nombre_embedding,
            nombre_normalizado, cantidad_acuerdos
        ) VALUES %s
        """,
        records
    )
    
    conn.commit()
    cur.close()
    
    log(f"✅ {len(records)} prestadores cargados")

# ==================================================================
# CARGAR NOMENCLADORES
# ==================================================================
def cargar_nomencladores(conn):
    """Cargar nomencladores desde Excel"""
    log("📊 Cargando NOMENCLADORES desde Excel...")
    
    # NOTA: Este archivo tiene solo 13 registros
    # Idealmente se necesita el archivo completo
    df = pd.read_excel(EXCEL_NOMENCLADORES)
    
    log(f"   ⚠️  ADVERTENCIA: Solo {len(df)} nomencladores en el archivo")
    log(f"   Columnas: {list(df.columns)}")
    
    # Limpiar datos
    df = df.rename(columns={
        'ID_NOMENCLADOR': 'id_nomenclador',
        'ESPECIALIDAD': 'especialidad',
        'NOMEN_DESCRIPCION_DET': 'descripcion',
        'ID_NOMENCLADOR2': 'id_nomenclador2',
        'ID_SERVICIO': 'id_servicio',
        'DESC_NOMENCLADOR': 'desc_nomenclador'
    })
    
    # Extraer grupo/subgrupo
    df['grupo'] = df['id_nomenclador'].apply(lambda x: extraer_grupo_subgrupo(x)[0])
    df['subgrupo'] = df['id_nomenclador'].apply(lambda x: extraer_grupo_subgrupo(x)[1])
    
    # Normalizar descripción
    df['descripcion_normalizada'] = df['descripcion'].apply(normalizar_texto)
    
    # Generar embeddings
    log("   Generando embeddings para descripciones...")
    textos_embedding = df['descripcion'].fillna('').astype(str).tolist()
    embeddings = generar_embeddings_batch(textos_embedding, batch_size=10)
    
    # Insertar en BD
    cur = conn.cursor()
    
    # Limpiar tabla
    cur.execute("TRUNCATE TABLE nomencladores CASCADE")
    
    log("   Insertando en PostgreSQL...")
    
    records = []
    for idx, row in df.iterrows():
        embedding = embeddings[idx]
        embedding_str = f"[{','.join(map(str, embedding))}]" if embedding else None
        
        records.append((
            int(row['id_nomenclador']),
            str(row['especialidad']) if pd.notna(row['especialidad']) else None,
            str(row['descripcion']) if pd.notna(row['descripcion']) else None,
            int(row['id_nomenclador2']) if pd.notna(row['id_nomenclador2']) else None,
            int(row['id_servicio']) if pd.notna(row['id_servicio']) else None,
            str(row['desc_nomenclador']) if pd.notna(row['desc_nomenclador']) else None,
            str(row['grupo']) if pd.notna(row['grupo']) else None,
            str(row['subgrupo']) if pd.notna(row['subgrupo']) else None,
            embedding_str,
            str(row['descripcion_normalizada']) if pd.notna(row['descripcion_normalizada']) else None
        ))
    
    execute_values(
        cur,
        """
        INSERT INTO nomencladores (
            id_nomenclador, especialidad, descripcion,
            id_nomenclador2, id_servicio, desc_nomenclador,
            grupo, subgrupo, descripcion_embedding,
            descripcion_normalizada
        ) VALUES %s
        """,
        records
    )
    
    conn.commit()
    cur.close()
    
    log(f"✅ {len(records)} nomencladores cargados")

# ==================================================================
# CARGAR ACUERDOS
# ==================================================================
def cargar_acuerdos(conn):
    """Cargar acuerdos desde Excel"""
    log("📊 Cargando ACUERDOS desde Excel...")
    
    df = pd.read_excel(EXCEL_ACUERDOS)
    
    log(f"   Registros: {len(df)}")
    log(f"   Columnas: {list(df.columns)}")
    
    # Limpiar datos
    df = df.rename(columns={
        'ID_NOMENCLADOR': 'id_nomenclador',
        'PLAN_ID_PLAN': 'plan_id_plan',
        'PREST_ID_PRESTADOR': 'prest_id_prestador',
        'PRECIO': 'precio',
        'PRECIO_NORMAL': 'precio_normal',
        'PRECIO_DIFERENCIADO': 'precio_diferenciado',
        'PRECIO_INTERNADO': 'precio_internado'
    })
    
    # Insertar en BD
    cur = conn.cursor()
    
    # Limpiar tabla
    cur.execute("TRUNCATE TABLE acuerdos_prestador CASCADE")
    
    log("   Insertando en PostgreSQL...")
    
    # Insertar en batches para mejor performance
    batch_size = 1000
    total_inserted = 0
    
    for i in range(0, len(df), batch_size):
        batch = df.iloc[i:i+batch_size]
        
        records = []
        for _, row in batch.iterrows():
            records.append((
                int(row['id_nomenclador']),
                int(row['prest_id_prestador']),
                int(row['plan_id_plan']),
                float(row['precio']) if pd.notna(row['precio']) else None,
                float(row['precio_normal']) if pd.notna(row['precio_normal']) else None,
                float(row['precio_diferenciado']) if pd.notna(row['precio_diferenciado']) else None,
                float(row['precio_internado']) if pd.notna(row['precio_internado']) else None
            ))
        
        execute_values(
            cur,
            """
            INSERT INTO acuerdos_prestador (
                id_nomenclador, prest_id_prestador, plan_id_plan,
                precio, precio_normal, precio_diferenciado, precio_internado
            ) VALUES %s
            ON CONFLICT (prest_id_prestador, id_nomenclador, plan_id_plan) DO UPDATE
            SET precio = EXCLUDED.precio,
                precio_normal = EXCLUDED.precio_normal,
                precio_diferenciado = EXCLUDED.precio_diferenciado,
                precio_internado = EXCLUDED.precio_internado
            """,
            records
        )
        
        total_inserted += len(records)
        log(f"   Insertados {total_inserted}/{len(df)}...")
    
    conn.commit()
    
    # Actualizar contadores en nomencladores y prestadores
    log("   Actualizando contadores de acuerdos...")
    
    cur.execute("""
        UPDATE nomencladores n
        SET cantidad_acuerdos = (
            SELECT COUNT(*)
            FROM acuerdos_prestador a
            WHERE a.id_nomenclador = n.id_nomenclador
        )
    """)
    
    cur.execute("""
        UPDATE prestadores p
        SET cantidad_acuerdos = (
            SELECT COUNT(*)
            FROM acuerdos_prestador a
            WHERE a.prest_id_prestador = p.id_prestador
        )
    """)
    
    conn.commit()
    cur.close()
    
    log(f"✅ {total_inserted} acuerdos cargados")

# ==================================================================
# MAIN
# ==================================================================
def main():
    """Función principal"""
    log("=" * 70)
    log("CARGA DE DATOS DESDE EXCEL A POSTGRESQL")
    log("=" * 70)
    
    # Verificar archivos
    for archivo in [EXCEL_NOMENCLADORES, EXCEL_PRESTADORES, EXCEL_ACUERDOS]:
        if not os.path.exists(archivo):
            log(f"❌ Archivo no encontrado: {archivo}")
            sys.exit(1)
    
    # Verificar API Key de OpenAI
    if not OPENAI_API_KEY:
        log("❌ OPENAI_API_KEY no configurada")
        sys.exit(1)
    
    # Conectar a BD
    conn = conectar_db()
    
    try:
        # Cargar datos
        cargar_prestadores(conn)
        cargar_nomencladores(conn)
        cargar_acuerdos(conn)
        
        # Estadísticas finales
        log("\n" + "=" * 70)
        log("ESTADÍSTICAS FINALES")
        log("=" * 70)
        
        cur = conn.cursor()
        
        cur.execute("SELECT COUNT(*) FROM prestadores")
        log(f"📊 Prestadores: {cur.fetchone()[0]}")
        
        cur.execute("SELECT COUNT(*) FROM nomencladores")
        log(f"📊 Nomencladores: {cur.fetchone()[0]}")
        
        cur.execute("SELECT COUNT(*) FROM acuerdos_prestador")
        log(f"📊 Acuerdos: {cur.fetchone()[0]}")
        
        cur.execute("""
            SELECT p.id_prestador, p.nombre_fantasia, COUNT(a.id_acuerdo) as total
            FROM prestadores p
            JOIN acuerdos_prestador a ON a.prest_id_prestador = p.id_prestador
            GROUP BY p.id_prestador, p.nombre_fantasia
            ORDER BY total DESC
            LIMIT 10
        """)
        
        log("\n📊 Top 10 prestadores por acuerdos:")
        for row in cur.fetchall():
            log(f"   {row[0]:5d} - {row[1][:50]:50s} - {row[2]:5d} acuerdos")
        
        cur.close()
        
        log("\n✅ Carga completada exitosamente")
        
    except Exception as e:
        log(f"❌ Error durante la carga: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == '__main__':
    main()
