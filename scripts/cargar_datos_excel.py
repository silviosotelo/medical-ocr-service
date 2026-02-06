#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para cargar datos desde Excel a PostgreSQL con embeddings vectoriales.

Maneja la estructura real de los archivos Excel:
  - PRESTADORES_PRINCIPALES.xlsx: columna extra de fila + datos de prestadores
  - NOMENCLADORES_GENERALES.xlsx: datos combinados nomenclador+acuerdo
  - ACUERDO_PRESTADORES.xlsx: datos combinados nomenclador+acuerdo (set completo)

Usa la API batch de OpenAI para generar embeddings eficientemente.
Usa UPSERT (ON CONFLICT) para no perder datos en re-ejecuciones.
Soporta modo --skip-embeddings para cargar datos sin vectorizar.
Soporta modo --only-embeddings para vectorizar datos ya cargados.
"""

import argparse
import os
import sys
import time

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from openai import OpenAI


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_DIR, 'data')

EXCEL_PRESTADORES = os.path.join(DATA_DIR, 'PRESTADORES_PRINCIPALES.xlsx')
EXCEL_NOMENCLADORES = os.path.join(DATA_DIR, 'NOMENCLADORES_GENERALES.xlsx')
EXCEL_ACUERDOS = os.path.join(DATA_DIR, 'ACUERDO_PRESTADORES.xlsx')

DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'port': int(os.getenv('POSTGRES_PORT', '5432')),
    'database': os.getenv('POSTGRES_DB', 'medical_ocr'),
    'user': os.getenv('POSTGRES_USER', 'medical_ocr'),
    'password': os.getenv('POSTGRES_PASSWORD', 'medical_ocr_dev'),
}

EMBEDDING_MODEL = 'text-embedding-3-small'
EMBEDDING_BATCH_SIZE = 200
EMBEDDING_DIMENSIONS = 1536


def log(msg):
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


def normalizar_texto(texto):
    if pd.isna(texto) or texto is None:
        return None
    texto = str(texto).strip().lower()
    reemplazos = {
        'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
        'ä': 'a', 'ë': 'e', 'ï': 'i', 'ö': 'o', 'ü': 'u',
        'ñ': 'n',
    }
    for old, new in reemplazos.items():
        texto = texto.replace(old, new)
    texto = ' '.join(texto.split())
    return texto


def limpiar_texto(texto):
    if pd.isna(texto) or texto is None:
        return None
    texto = str(texto).strip()
    texto = texto.replace('\xa0', ' ')
    texto = ' '.join(texto.split())
    return texto if texto else None


def conectar_db():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = False
        log(f"Conectado a PostgreSQL ({DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']})")
        return conn
    except Exception as e:
        log(f"ERROR: No se pudo conectar a PostgreSQL: {e}")
        sys.exit(1)


def generar_embeddings_batch(client, textos, desc=""):
    if not textos:
        return []

    total = len(textos)
    all_embeddings = [None] * total

    textos_limpios = []
    for t in textos:
        t_str = str(t).strip() if t and not pd.isna(t) else ''
        textos_limpios.append(t_str[:8000] if t_str else '')

    idx_con_texto = [i for i, t in enumerate(textos_limpios) if t]
    textos_a_embeddear = [textos_limpios[i] for i in idx_con_texto]

    if not textos_a_embeddear:
        return all_embeddings

    log(f"  Generando {len(textos_a_embeddear)} embeddings {desc}...")

    procesados = 0
    for batch_start in range(0, len(textos_a_embeddear), EMBEDDING_BATCH_SIZE):
        batch_end = min(batch_start + EMBEDDING_BATCH_SIZE, len(textos_a_embeddear))
        batch = textos_a_embeddear[batch_start:batch_end]

        for intento in range(5):
            try:
                response = client.embeddings.create(
                    model=EMBEDDING_MODEL,
                    input=batch
                )
                for item in response.data:
                    original_idx = idx_con_texto[batch_start + item.index]
                    all_embeddings[original_idx] = item.embedding
                procesados += len(batch)
                break
            except Exception as e:
                if intento < 4:
                    wait = 2 ** intento
                    log(f"  Reintento {intento+1}/5 en {wait}s: {e}")
                    time.sleep(wait)
                else:
                    log(f"  ERROR: No se pudieron generar embeddings para batch {batch_start}: {e}")

        if procesados % 1000 == 0 or procesados == len(textos_a_embeddear):
            log(f"  Progreso embeddings: {procesados}/{len(textos_a_embeddear)}")

        time.sleep(0.1)

    generados = sum(1 for e in all_embeddings if e is not None)
    log(f"  Embeddings generados: {generados}/{total}")
    return all_embeddings


def embedding_to_pgvector(embedding):
    if embedding is None:
        return None
    return f"[{','.join(map(str, embedding))}]"


# ============================================================
# CARGAR PRESTADORES
# ============================================================
def cargar_prestadores(conn, client, skip_embeddings=False):
    log("=" * 60)
    log("CARGANDO PRESTADORES")
    log("=" * 60)

    df = pd.read_excel(EXCEL_PRESTADORES, sheet_name=0)
    log(f"  Filas en Excel: {len(df)}")
    log(f"  Columnas: {list(df.columns)}")

    col_map = {}
    for col in df.columns:
        col_upper = str(col).strip().upper()
        if col_upper == 'ID_PRESTADOR':
            col_map['id_prestador'] = col
        elif col_upper == 'RUC':
            col_map['ruc'] = col
        elif col_upper == 'NOMBRE_FANTASIA':
            col_map['nombre_fantasia'] = col
        elif col_upper in ('RAZ_SOC_NOMBRE', 'RAZON_SOCIAL'):
            col_map['raz_soc_nombre'] = col
        elif col_upper == 'RANKING':
            col_map['ranking'] = col
        elif col_upper == 'REGISTRO_PROFESIONAL':
            col_map['registro_profesional'] = col
        elif col_upper == 'CANTIDAD':
            col_map['cantidad_acuerdos'] = col

    if 'id_prestador' not in col_map or 'nombre_fantasia' not in col_map:
        log("ERROR: Columnas obligatorias no encontradas (ID_PRESTADOR, NOMBRE_FANTASIA)")
        return 0

    df_clean = pd.DataFrame()
    df_clean['id_prestador'] = pd.to_numeric(df[col_map['id_prestador']], errors='coerce')
    df_clean['nombre_fantasia'] = df[col_map['nombre_fantasia']].apply(limpiar_texto)
    df_clean['ruc'] = df[col_map.get('ruc', col_map['nombre_fantasia'])].apply(
        lambda x: str(x).strip() if pd.notna(x) else None
    ) if 'ruc' in col_map else None
    df_clean['raz_soc_nombre'] = df[col_map.get('raz_soc_nombre', col_map['nombre_fantasia'])].apply(limpiar_texto) if 'raz_soc_nombre' in col_map else df_clean['nombre_fantasia']
    df_clean['registro_profesional'] = df[col_map.get('registro_profesional', col_map['nombre_fantasia'])].apply(
        lambda x: str(x).strip() if pd.notna(x) else None
    ) if 'registro_profesional' in col_map else None
    df_clean['ranking'] = pd.to_numeric(df[col_map.get('ranking', col_map['id_prestador'])], errors='coerce').fillna(0) if 'ranking' in col_map else 0
    df_clean['cantidad_acuerdos'] = pd.to_numeric(df[col_map.get('cantidad_acuerdos', col_map['id_prestador'])], errors='coerce').fillna(0).astype(int) if 'cantidad_acuerdos' in col_map else 0

    df_clean = df_clean.dropna(subset=['id_prestador'])
    df_clean['id_prestador'] = df_clean['id_prestador'].astype(int)
    df_clean = df_clean.drop_duplicates(subset=['id_prestador'], keep='first')
    df_clean['nombre_normalizado'] = df_clean['nombre_fantasia'].apply(normalizar_texto)

    log(f"  Prestadores unicos: {len(df_clean)}")

    embeddings = [None] * len(df_clean)
    if not skip_embeddings and client:
        embeddings = generar_embeddings_batch(
            client,
            df_clean['nombre_fantasia'].tolist(),
            desc="(prestadores)"
        )

    cur = conn.cursor()
    records = []
    for i, (_, row) in enumerate(df_clean.iterrows()):
        records.append((
            int(row['id_prestador']),
            row.get('ruc'),
            row.get('nombre_fantasia'),
            row.get('raz_soc_nombre'),
            row.get('registro_profesional'),
            float(row['ranking']) if pd.notna(row.get('ranking')) else 0,
            embedding_to_pgvector(embeddings[i]),
            row.get('nombre_normalizado'),
            int(row['cantidad_acuerdos']) if pd.notna(row.get('cantidad_acuerdos')) else 0,
        ))

    batch_size = 500
    total_inserted = 0
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        execute_values(
            cur,
            """
            INSERT INTO prestadores (
                id_prestador, ruc, nombre_fantasia, raz_soc_nombre,
                registro_profesional, ranking, nombre_embedding,
                nombre_normalizado, cantidad_acuerdos
            ) VALUES %s
            ON CONFLICT (id_prestador) DO UPDATE SET
                ruc = EXCLUDED.ruc,
                nombre_fantasia = EXCLUDED.nombre_fantasia,
                raz_soc_nombre = EXCLUDED.raz_soc_nombre,
                registro_profesional = EXCLUDED.registro_profesional,
                ranking = EXCLUDED.ranking,
                nombre_embedding = COALESCE(EXCLUDED.nombre_embedding, prestadores.nombre_embedding),
                nombre_normalizado = EXCLUDED.nombre_normalizado,
                cantidad_acuerdos = EXCLUDED.cantidad_acuerdos,
                updated_at = NOW()
            """,
            batch
        )
        total_inserted += len(batch)
        if total_inserted % 1000 == 0:
            log(f"  Insertados: {total_inserted}/{len(records)}")

    conn.commit()
    cur.close()
    log(f"  Prestadores cargados: {total_inserted}")
    return total_inserted


# ============================================================
# CARGAR NOMENCLADORES (extraidos de ambos Excel combinados)
# ============================================================
def cargar_nomencladores(conn, client, skip_embeddings=False):
    log("=" * 60)
    log("CARGANDO NOMENCLADORES")
    log("=" * 60)

    all_nomen = []

    for archivo, nombre in [
        (EXCEL_NOMENCLADORES, 'NOMENCLADORES_GENERALES'),
        (EXCEL_ACUERDOS, 'ACUERDO_PRESTADORES'),
    ]:
        if not os.path.exists(archivo):
            log(f"  Archivo no encontrado: {archivo}")
            continue

        df = pd.read_excel(archivo, sheet_name=0)
        log(f"  {nombre}: {len(df)} filas, columnas: {list(df.columns)}")

        col_map = {}
        for col in df.columns:
            col_upper = str(col).strip().upper()
            if col_upper == 'ID_NOMENCLADOR':
                col_map['id_nomenclador'] = col
            elif col_upper == 'ESPECIALIDAD':
                col_map['especialidad'] = col
            elif col_upper in ('NOMEN_DESCRIPCION_DET', 'DESCRIPCION'):
                col_map['descripcion'] = col
            elif col_upper == 'ID_NOMENCLADOR2':
                col_map['id_nomenclador2'] = col
            elif col_upper == 'ID_SERVICIO':
                col_map['id_servicio'] = col
            elif col_upper == 'DESC_NOMENCLADOR':
                col_map['desc_nomenclador'] = col

        if 'id_nomenclador' not in col_map or 'descripcion' not in col_map:
            log(f"  ADVERTENCIA: Columnas nomenclador no encontradas en {nombre}")
            continue

        for _, row in df.iterrows():
            id_nom = row[col_map['id_nomenclador']]
            if pd.isna(id_nom):
                continue
            all_nomen.append({
                'id_nomenclador': int(id_nom),
                'especialidad': limpiar_texto(row.get(col_map.get('especialidad', ''), None)),
                'descripcion': limpiar_texto(row.get(col_map['descripcion'], None)),
                'id_nomenclador2': int(row[col_map['id_nomenclador2']]) if 'id_nomenclador2' in col_map and pd.notna(row.get(col_map['id_nomenclador2'])) else None,
                'id_servicio': int(row[col_map['id_servicio']]) if 'id_servicio' in col_map and pd.notna(row.get(col_map['id_servicio'])) else None,
                'desc_nomenclador': limpiar_texto(row.get(col_map.get('desc_nomenclador', ''), None)),
            })

    df_nomen = pd.DataFrame(all_nomen)
    if df_nomen.empty:
        log("  ERROR: No se encontraron nomencladores")
        return 0

    df_nomen = df_nomen.drop_duplicates(subset=['id_nomenclador'], keep='last')
    log(f"  Nomencladores unicos: {len(df_nomen)}")

    df_nomen['descripcion_normalizada'] = df_nomen['descripcion'].apply(normalizar_texto)

    def extraer_grupo(id_nom):
        s = str(id_nom)
        return s[:2] if len(s) >= 2 else None

    def extraer_subgrupo(id_nom):
        s = str(id_nom)
        return s[:4] if len(s) >= 4 else None

    df_nomen['grupo'] = df_nomen['id_nomenclador'].apply(extraer_grupo)
    df_nomen['subgrupo'] = df_nomen['id_nomenclador'].apply(extraer_subgrupo)

    embeddings = [None] * len(df_nomen)
    if not skip_embeddings and client:
        embeddings = generar_embeddings_batch(
            client,
            df_nomen['descripcion'].tolist(),
            desc="(nomencladores)"
        )

    cur = conn.cursor()
    records = []
    for i, (_, row) in enumerate(df_nomen.iterrows()):
        records.append((
            int(row['id_nomenclador']),
            row.get('especialidad'),
            row.get('descripcion'),
            row.get('id_nomenclador2'),
            row.get('id_servicio'),
            row.get('desc_nomenclador'),
            row.get('grupo'),
            row.get('subgrupo'),
            embedding_to_pgvector(embeddings[i]),
            row.get('descripcion_normalizada'),
        ))

    batch_size = 500
    total_inserted = 0
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        execute_values(
            cur,
            """
            INSERT INTO nomencladores (
                id_nomenclador, especialidad, descripcion,
                id_nomenclador2, id_servicio, desc_nomenclador,
                grupo, subgrupo, descripcion_embedding,
                descripcion_normalizada
            ) VALUES %s
            ON CONFLICT (id_nomenclador) DO UPDATE SET
                especialidad = EXCLUDED.especialidad,
                descripcion = EXCLUDED.descripcion,
                id_nomenclador2 = EXCLUDED.id_nomenclador2,
                id_servicio = EXCLUDED.id_servicio,
                desc_nomenclador = EXCLUDED.desc_nomenclador,
                grupo = EXCLUDED.grupo,
                subgrupo = EXCLUDED.subgrupo,
                descripcion_embedding = COALESCE(EXCLUDED.descripcion_embedding, nomencladores.descripcion_embedding),
                descripcion_normalizada = EXCLUDED.descripcion_normalizada,
                updated_at = NOW()
            """,
            batch
        )
        total_inserted += len(batch)
        if total_inserted % 1000 == 0:
            log(f"  Insertados: {total_inserted}/{len(records)}")

    conn.commit()
    cur.close()
    log(f"  Nomencladores cargados: {total_inserted}")
    return total_inserted


# ============================================================
# CARGAR ACUERDOS (de ambos Excel combinados)
# ============================================================
def cargar_acuerdos(conn):
    log("=" * 60)
    log("CARGANDO ACUERDOS")
    log("=" * 60)

    all_acuerdos = []

    for archivo, nombre in [
        (EXCEL_NOMENCLADORES, 'NOMENCLADORES_GENERALES'),
        (EXCEL_ACUERDOS, 'ACUERDO_PRESTADORES'),
    ]:
        if not os.path.exists(archivo):
            continue

        df = pd.read_excel(archivo, sheet_name=0)

        col_map = {}
        for col in df.columns:
            col_upper = str(col).strip().upper()
            if col_upper == 'ID_NOMENCLADOR':
                col_map['id_nomenclador'] = col
            elif col_upper == 'PREST_ID_PRESTADOR':
                col_map['prest_id_prestador'] = col
            elif col_upper == 'PLAN_ID_PLAN':
                col_map['plan_id_plan'] = col
            elif col_upper == 'PRECIO':
                col_map['precio'] = col
            elif col_upper == 'PRECIO_NORMAL':
                col_map['precio_normal'] = col
            elif col_upper == 'PRECIO_DIFERENCIADO':
                col_map['precio_diferenciado'] = col
            elif col_upper == 'PRECIO_INTERNADO':
                col_map['precio_internado'] = col

        required = ['id_nomenclador', 'prest_id_prestador', 'plan_id_plan']
        if not all(k in col_map for k in required):
            log(f"  {nombre}: Columnas de acuerdo no encontradas, saltando")
            continue

        log(f"  {nombre}: procesando {len(df)} filas de acuerdos...")

        for _, row in df.iterrows():
            id_nom = row.get(col_map['id_nomenclador'])
            id_prest = row.get(col_map['prest_id_prestador'])
            id_plan = row.get(col_map['plan_id_plan'])

            if pd.isna(id_nom) or pd.isna(id_prest) or pd.isna(id_plan):
                continue

            def safe_float(val):
                if pd.isna(val) or val is None:
                    return None
                try:
                    return float(val)
                except (ValueError, TypeError):
                    return None

            all_acuerdos.append((
                int(id_nom),
                int(id_prest),
                int(id_plan),
                safe_float(row.get(col_map.get('precio', ''))),
                safe_float(row.get(col_map.get('precio_normal', ''))),
                safe_float(row.get(col_map.get('precio_diferenciado', ''))),
                safe_float(row.get(col_map.get('precio_internado', ''))),
            ))

    if not all_acuerdos:
        log("  ERROR: No se encontraron acuerdos")
        return 0

    seen = set()
    unique_acuerdos = []
    for a in all_acuerdos:
        key = (a[0], a[1], a[2])
        if key not in seen:
            seen.add(key)
            unique_acuerdos.append(a)

    log(f"  Acuerdos totales: {len(all_acuerdos)}, unicos: {len(unique_acuerdos)}")

    cur = conn.cursor()
    batch_size = 1000
    total_inserted = 0

    for i in range(0, len(unique_acuerdos), batch_size):
        batch = unique_acuerdos[i:i + batch_size]

        try:
            execute_values(
                cur,
                """
                INSERT INTO acuerdos_prestador (
                    id_nomenclador, prest_id_prestador, plan_id_plan,
                    precio, precio_normal, precio_diferenciado, precio_internado
                ) VALUES %s
                ON CONFLICT (prest_id_prestador, id_nomenclador, plan_id_plan) DO UPDATE SET
                    precio = EXCLUDED.precio,
                    precio_normal = EXCLUDED.precio_normal,
                    precio_diferenciado = EXCLUDED.precio_diferenciado,
                    precio_internado = EXCLUDED.precio_internado,
                    updated_at = NOW()
                """,
                batch
            )
            total_inserted += len(batch)
        except Exception as e:
            log(f"  Error en batch {i}: {e}")
            conn.rollback()
            skipped = 0
            for record in batch:
                try:
                    cur.execute(
                        """
                        INSERT INTO acuerdos_prestador (
                            id_nomenclador, prest_id_prestador, plan_id_plan,
                            precio, precio_normal, precio_diferenciado, precio_internado
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (prest_id_prestador, id_nomenclador, plan_id_plan) DO UPDATE SET
                            precio = EXCLUDED.precio,
                            precio_normal = EXCLUDED.precio_normal,
                            precio_diferenciado = EXCLUDED.precio_diferenciado,
                            precio_internado = EXCLUDED.precio_internado,
                            updated_at = NOW()
                        """,
                        record
                    )
                    conn.commit()
                    total_inserted += 1
                except Exception as e2:
                    conn.rollback()
                    skipped += 1
            if skipped:
                log(f"  Saltados {skipped} acuerdos con FK invalidas")

        if total_inserted % 5000 == 0:
            log(f"  Insertados: {total_inserted}/{len(unique_acuerdos)}")

    conn.commit()

    log("  Actualizando contadores de acuerdos...")
    cur.execute("""
        UPDATE nomencladores n
        SET cantidad_acuerdos = sub.cnt
        FROM (
            SELECT id_nomenclador, COUNT(*) as cnt
            FROM acuerdos_prestador
            GROUP BY id_nomenclador
        ) sub
        WHERE n.id_nomenclador = sub.id_nomenclador
    """)
    cur.execute("""
        UPDATE prestadores p
        SET cantidad_acuerdos = sub.cnt
        FROM (
            SELECT prest_id_prestador, COUNT(*) as cnt
            FROM acuerdos_prestador
            GROUP BY prest_id_prestador
        ) sub
        WHERE p.id_prestador = sub.prest_id_prestador
    """)
    conn.commit()
    cur.close()
    log(f"  Acuerdos cargados: {total_inserted}")
    return total_inserted


# ============================================================
# REGENERAR EMBEDDINGS (para datos ya cargados sin embedding)
# ============================================================
def regenerar_embeddings(conn, client):
    log("=" * 60)
    log("REGENERANDO EMBEDDINGS FALTANTES")
    log("=" * 60)

    cur = conn.cursor()

    cur.execute("SELECT id_prestador, nombre_fantasia FROM prestadores WHERE nombre_embedding IS NULL AND nombre_fantasia IS NOT NULL")
    rows = cur.fetchall()
    if rows:
        log(f"  Prestadores sin embedding: {len(rows)}")
        ids = [r[0] for r in rows]
        textos = [r[1] for r in rows]
        embeddings = generar_embeddings_batch(client, textos, desc="(prestadores faltantes)")
        for pid, emb in zip(ids, embeddings):
            if emb:
                cur.execute(
                    "UPDATE prestadores SET nombre_embedding = %s, updated_at = NOW() WHERE id_prestador = %s",
                    (embedding_to_pgvector(emb), pid)
                )
        conn.commit()
        log(f"  Prestadores actualizados: {sum(1 for e in embeddings if e)}")

    cur.execute("SELECT id_nomenclador, descripcion FROM nomencladores WHERE descripcion_embedding IS NULL AND descripcion IS NOT NULL")
    rows = cur.fetchall()
    if rows:
        log(f"  Nomencladores sin embedding: {len(rows)}")
        ids = [r[0] for r in rows]
        textos = [r[1] for r in rows]
        embeddings = generar_embeddings_batch(client, textos, desc="(nomencladores faltantes)")
        for nid, emb in zip(ids, embeddings):
            if emb:
                cur.execute(
                    "UPDATE nomencladores SET descripcion_embedding = %s, updated_at = NOW() WHERE id_nomenclador = %s",
                    (embedding_to_pgvector(emb), nid)
                )
        conn.commit()
        log(f"  Nomencladores actualizados: {sum(1 for e in embeddings if e)}")

    cur.close()


# ============================================================
# ESTADISTICAS FINALES
# ============================================================
def mostrar_estadisticas(conn):
    log("=" * 60)
    log("ESTADISTICAS FINALES")
    log("=" * 60)

    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM prestadores")
    log(f"  Prestadores: {cur.fetchone()[0]}")

    cur.execute("SELECT COUNT(*) FROM prestadores WHERE nombre_embedding IS NOT NULL")
    log(f"  Prestadores con embedding: {cur.fetchone()[0]}")

    cur.execute("SELECT COUNT(*) FROM nomencladores")
    log(f"  Nomencladores: {cur.fetchone()[0]}")

    cur.execute("SELECT COUNT(*) FROM nomencladores WHERE descripcion_embedding IS NOT NULL")
    log(f"  Nomencladores con embedding: {cur.fetchone()[0]}")

    cur.execute("SELECT COUNT(*) FROM acuerdos_prestador")
    log(f"  Acuerdos: {cur.fetchone()[0]}")

    cur.execute("SELECT COUNT(DISTINCT especialidad) FROM nomencladores WHERE especialidad IS NOT NULL")
    log(f"  Especialidades: {cur.fetchone()[0]}")

    cur.execute("""
        SELECT especialidad, COUNT(*) as total
        FROM nomencladores
        WHERE especialidad IS NOT NULL
        GROUP BY especialidad
        ORDER BY total DESC
        LIMIT 15
    """)
    log("  Top 15 especialidades:")
    for row in cur.fetchall():
        log(f"    {row[0]:50s} {row[1]:6d}")

    cur.execute("""
        SELECT p.id_prestador, p.nombre_fantasia, p.cantidad_acuerdos
        FROM prestadores p
        ORDER BY p.cantidad_acuerdos DESC
        LIMIT 10
    """)
    log("  Top 10 prestadores por acuerdos:")
    for row in cur.fetchall():
        nombre = (row[1] or '')[:50]
        log(f"    {row[0]:6d} - {nombre:50s} - {row[2]:6d}")

    cur.close()


# ============================================================
# MAIN
# ============================================================
def main():
    parser = argparse.ArgumentParser(description='Cargar datos Excel a PostgreSQL')
    parser.add_argument('--skip-embeddings', action='store_true',
                        help='Cargar datos sin generar embeddings (mas rapido)')
    parser.add_argument('--only-embeddings', action='store_true',
                        help='Solo regenerar embeddings faltantes')
    parser.add_argument('--only', choices=['prestadores', 'nomencladores', 'acuerdos'],
                        help='Cargar solo una tabla especifica')
    args = parser.parse_args()

    log("=" * 60)
    log("CARGA DE DATOS EXCEL -> POSTGRESQL")
    log("=" * 60)

    for archivo, nombre in [
        (EXCEL_PRESTADORES, 'Prestadores'),
        (EXCEL_NOMENCLADORES, 'Nomencladores'),
        (EXCEL_ACUERDOS, 'Acuerdos'),
    ]:
        exists = os.path.exists(archivo)
        log(f"  {nombre}: {'OK' if exists else 'NO ENCONTRADO'} ({archivo})")
        if not exists and not args.only_embeddings:
            log(f"ERROR: Archivo requerido no encontrado: {archivo}")
            sys.exit(1)

    client = None
    api_key = os.getenv('OPENAI_API_KEY')
    if not args.skip_embeddings:
        if not api_key:
            log("ADVERTENCIA: OPENAI_API_KEY no configurada. Se cargaran datos sin embeddings.")
            args.skip_embeddings = True
        else:
            client = OpenAI(api_key=api_key)
            log(f"  OpenAI API: configurada ({api_key[:8]}...)")

    conn = conectar_db()

    try:
        inicio = time.time()

        if args.only_embeddings:
            if not client:
                log("ERROR: Se requiere OPENAI_API_KEY para generar embeddings")
                sys.exit(1)
            regenerar_embeddings(conn, client)
        else:
            if args.only is None or args.only == 'prestadores':
                cargar_prestadores(conn, client, args.skip_embeddings)

            if args.only is None or args.only == 'nomencladores':
                cargar_nomencladores(conn, client, args.skip_embeddings)

            if args.only is None or args.only == 'acuerdos':
                cargar_acuerdos(conn)

        mostrar_estadisticas(conn)

        duracion = time.time() - inicio
        log(f"\nTiempo total: {duracion:.1f}s ({duracion/60:.1f} min)")
        log("Carga completada exitosamente")

    except KeyboardInterrupt:
        log("\nCarga interrumpida por el usuario. Los datos ya insertados se conservan.")
    except Exception as e:
        log(f"\nERROR durante la carga: {e}")
        import traceback
        traceback.print_exc()
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()


if __name__ == '__main__':
    main()
