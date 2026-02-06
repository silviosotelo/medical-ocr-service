#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de carga de datos Excel a PostgreSQL
Adaptado a estructura real de tablas
"""

import pandas as pd
import psycopg2
import openai
import os
import sys
import time

# Configuración
openai.api_key = os.getenv('OPENAI_API_KEY')

DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'port': int(os.getenv('POSTGRES_PORT', '5432')),
    'database': os.getenv('POSTGRES_DB', 'medical_ocr'),
    'user': os.getenv('POSTGRES_USER', 'postgres'),
    'password': os.getenv('POSTGRES_PASSWORD', 'postgres')
}

# Rutas de archivos Excel
EXCEL_FILES = {
    'prestadores': '/home/soporte/apps/medical-ocr-service/data/PRESTADORES_PRINCIPALES.xlsx',
    'nomencladores': '/home/soporte/apps/medical-ocr-service/data/NOMENCLADORES_GENERALES.xlsx',
    'acuerdos': '/home/soporte/apps/medical-ocr-service/data/ACUERDO_PRESTADORES.xlsx'
}

def generar_embedding(texto: str, retry: int = 3):
    """Genera embedding usando OpenAI 0.28.0"""
    for intento in range(retry):
        try:
            response = openai.Embedding.create(
                model="text-embedding-ada-002",
                input=texto
            )
            return response['data'][0]['embedding']
        except Exception as e:
            print(f"Error generando embedding (intento {intento+1}/{retry}): {e}")
            if intento < retry - 1:
                time.sleep(2 ** intento)
            else:
                raise
    return None

def conectar_db():
    """Conectar a PostgreSQL"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        print("✅ Conectado a PostgreSQL")
        return conn
    except Exception as e:
        print(f"❌ Error conectando a PostgreSQL: {e}")
        sys.exit(1)

def cargar_prestadores(conn):
    """Cargar prestadores desde Excel"""
    print("\n📦 Cargando prestadores...")
    
    try:
        df = pd.read_excel(EXCEL_FILES['prestadores'])
        print(f"Registros encontrados: {len(df)}")
        
        cursor = conn.cursor()
        insertados = 0
        errores = 0
        
        for idx, row in df.iterrows():
            try:
                # Generar embedding del nombre
                texto_embedding = str(row.get('NOMBRE_FANTASIA', ''))
                if not texto_embedding or texto_embedding == 'nan':
                    print(f"  ⚠️  Fila {idx}: nombre vacío, saltando...")
                    continue
                
                embedding = generar_embedding(texto_embedding)
                
                # Insertar prestador
                cursor.execute("""
                    INSERT INTO prestadores (
                        id_prestador,
                        ruc,
                        nombre_fantasia,
                        raz_soc_nombre,
                        registro_profesional,
                        nombre_embedding,
                        nombre_normalizado,
                        estado
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id_prestador) DO UPDATE SET
                        nombre_fantasia = EXCLUDED.nombre_fantasia,
                        raz_soc_nombre = EXCLUDED.raz_soc_nombre,
                        nombre_embedding = EXCLUDED.nombre_embedding,
                        nombre_normalizado = EXCLUDED.nombre_normalizado,
                        updated_at = NOW()
                """, (
                    int(row['ID_PRESTADOR']),
                    row.get('RUC'),
                    row.get('NOMBRE_FANTASIA'),
                    row.get('RAZON_SOCIAL'),
                    row.get('REGISTRO_PROFESIONAL'),
                    str(embedding),
                    texto_embedding.upper().strip(),
                    'ACTIVO'
                ))
                
                insertados += 1
                
                if (idx + 1) % 10 == 0:
                    conn.commit()
                    print(f"  Procesados: {idx + 1}/{len(df)}")
                
            except Exception as e:
                print(f"  ❌ Error en fila {idx}: {e}")
                errores += 1
                conn.rollback()
                continue
        
        conn.commit()
        print(f"✅ Prestadores: {insertados} insertados, {errores} errores")
        
    except Exception as e:
        print(f"❌ Error cargando prestadores: {e}")
        conn.rollback()
        raise

def cargar_nomencladores(conn):
    """Cargar nomencladores desde Excel"""
    print("\n📦 Cargando nomencladores...")
    
    try:
        df = pd.read_excel(EXCEL_FILES['nomencladores'])
        print(f"Registros encontrados: {len(df)}")
        
        cursor = conn.cursor()
        insertados = 0
        errores = 0
        
        for idx, row in df.iterrows():
            try:
                # Generar embedding de la descripción
                texto_embedding = str(row.get('DESCRIPCION', ''))
                if not texto_embedding or texto_embedding == 'nan':
                    print(f"  ⚠️  Fila {idx}: descripción vacía, saltando...")
                    continue
                
                embedding = generar_embedding(texto_embedding)
                
                # Insertar nomenclador
                cursor.execute("""
                    INSERT INTO nomencladores (
                        id_nomenclador,
                        especialidad,
                        descripcion,
                        desc_nomenclador,
                        grupo,
                        subgrupo,
                        descripcion_embedding,
                        descripcion_normalizada,
                        estado
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id_nomenclador) DO UPDATE SET
                        descripcion = EXCLUDED.descripcion,
                        desc_nomenclador = EXCLUDED.desc_nomenclador,
                        especialidad = EXCLUDED.especialidad,
                        descripcion_embedding = EXCLUDED.descripcion_embedding,
                        descripcion_normalizada = EXCLUDED.descripcion_normalizada,
                        updated_at = NOW()
                """, (
                    int(row['ID_NOMENCLADOR']),
                    row.get('ESPECIALIDAD'),
                    row.get('DESCRIPCION'),
                    row.get('DESC_NOMENCLADOR'),
                    row.get('GRUPO'),
                    row.get('SUBGRUPO'),
                    str(embedding),
                    texto_embedding.upper().strip(),
                    'ACTIVO'
                ))
                
                insertados += 1
                
                if (idx + 1) % 10 == 0:
                    conn.commit()
                    print(f"  Procesados: {idx + 1}/{len(df)}")
                
            except Exception as e:
                print(f"  ❌ Error en fila {idx}: {e}")
                errores += 1
                conn.rollback()
                continue
        
        conn.commit()
        print(f"✅ Nomencladores: {insertados} insertados, {errores} errores")
        
    except Exception as e:
        print(f"❌ Error cargando nomencladores: {e}")
        conn.rollback()
        raise

def cargar_acuerdos(conn):
    """Cargar acuerdos desde Excel"""
    print("\n📦 Cargando acuerdos...")
    
    try:
        df = pd.read_excel(EXCEL_FILES['acuerdos'])
        print(f"Registros encontrados: {len(df)}")
        
        cursor = conn.cursor()
        insertados = 0
        errores = 0
        
        for idx, row in df.iterrows():
            try:
                cursor.execute("""
                    INSERT INTO acuerdos_prestador (
                        id_nomenclador,
                        prest_id_prestador,
                        plan_id_plan,
                        precio,
                        precio_normal,
                        precio_diferenciado,
                        precio_internado,
                        vigente,
                        fecha_vigencia
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (prest_id_prestador, id_nomenclador, plan_id_plan) DO UPDATE SET
                        precio = EXCLUDED.precio,
                        precio_normal = EXCLUDED.precio_normal,
                        precio_diferenciado = EXCLUDED.precio_diferenciado,
                        precio_internado = EXCLUDED.precio_internado,
                        vigente = EXCLUDED.vigente,
                        fecha_vigencia = EXCLUDED.fecha_vigencia,
                        updated_at = NOW()
                """, (
                    int(row['ID_NOMENCLADOR']),
                    int(row['ID_PRESTADOR']),
                    int(row.get('ID_PLAN', 1)),
                    float(row.get('PRECIO', 0)) if pd.notna(row.get('PRECIO')) else None,
                    float(row.get('PRECIO_NORMAL', 0)) if pd.notna(row.get('PRECIO_NORMAL')) else None,
                    float(row.get('PRECIO_DIFERENCIADO', 0)) if pd.notna(row.get('PRECIO_DIFERENCIADO')) else None,
                    float(row.get('PRECIO_INTERNADO', 0)) if pd.notna(row.get('PRECIO_INTERNADO')) else None,
                    'SI',
                    row.get('FECHA_VIGENCIA')
                ))
                
                insertados += 1
                
                if (idx + 1) % 100 == 0:
                    conn.commit()
                    print(f"  Procesados: {idx + 1}/{len(df)}")
                
            except Exception as e:
                print(f"  ❌ Error en fila {idx}: {e}")
                errores += 1
                conn.rollback()
                continue
        
        conn.commit()
        print(f"✅ Acuerdos: {insertados} insertados, {errores} errores")
        
    except Exception as e:
        print(f"❌ Error cargando acuerdos: {e}")
        conn.rollback()
        raise

def verificar_archivos():
    """Verificar que existan los archivos Excel"""
    faltantes = []
    for nombre, ruta in EXCEL_FILES.items():
        if not os.path.exists(ruta):
            faltantes.append(f"{nombre}: {ruta}")
    
    if faltantes:
        print("❌ Archivos faltantes:")
        for f in faltantes:
            print(f"  - {f}")
        sys.exit(1)
    
    print("✅ Todos los archivos Excel encontrados")

def main():
    print("=" * 60)
    print("CARGA DE DATOS DESDE EXCEL A POSTGRESQL")
    print("=" * 60)
    
    # Verificar API Key
    if not openai.api_key:
        print("❌ OPENAI_API_KEY no configurada")
        sys.exit(1)
    
    print(f"✅ OpenAI API Key: {openai.api_key[:10]}...")
    
    # Verificar archivos
    verificar_archivos()
    
    # Conectar a DB
    conn = conectar_db()
    
    try:
        # Cargar datos
        cargar_prestadores(conn)
        cargar_nomencladores(conn)
        cargar_acuerdos(conn)
        
        # Estadísticas finales
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM prestadores")
        total_prestadores = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM nomencladores")
        total_nomencladores = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM acuerdos_prestador")
        total_acuerdos = cursor.fetchone()[0]
        
        print("\n" + "=" * 60)
        print("RESUMEN FINAL")
        print("=" * 60)
        print(f"Prestadores:   {total_prestadores}")
        print(f"Nomencladores: {total_nomencladores}")
        print(f"Acuerdos:      {total_acuerdos}")
        print("=" * 60)
        print("✅ Carga completada exitosamente")
        
    except Exception as e:
        print(f"\n❌ Error durante la carga: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == '__main__':
    main()