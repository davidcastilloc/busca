#!/usr/bin/env python3
import json, subprocess, os, sys

DATA_FILE = "persons_full.json"
FRONTEND_DIR = "."
SQL_FILE = "seed.sql"

USE_REMOTE = "--remote" in sys.argv

def map_status(s):
    return {"missing": "desaparecido", "found": "encontrado"}.get(s, "desaparecido")

def map_gender(g):
    if not g:
        return "X"
    return {"masculino": "M", "femenino": "F"}.get(g.lower(), "X")

def main():
    if not os.path.exists(DATA_FILE):
        print(f"ERROR: Archivo {DATA_FILE} no encontrado.")
        sys.exit(1)

    print(f"Leyendo {DATA_FILE}...")
    with open(DATA_FILE) as f:
        data = json.load(f)

    persons = data["persons"]
    total = len(persons)

    print(f"Generando sentencias SQL para {total} registros...")

    sql_lines = ["-- Seed SQL auto-generado"]
    
    # Personas
    values_personas = []
    batch_size = 100
    for i, p in enumerate(persons):
        name = (p.get("first_name") or "").replace("'", "''")
        last = (p.get("last_name") or "").replace("'", "''")
        cedula = (p.get("national_id") or "").replace("'", "''")
        edad = p.get("age")
        edad_sql = str(edad) if edad else "NULL"
        sexo = map_gender(p.get("gender"))
        estado = "desconocido"
        ubicacion = (p.get("last_seen_location") or "").replace("'", "''")
        notas = (p.get("description") or "").replace("'", "''")
        foto = (p.get("photo_key") or "").replace("'", "''")
        created = (p.get("created_at") or "").replace("'", "''")
        updated = (p.get("updated_at") or "").replace("'", "''")

        values_personas.append(
            f"('{cedula}','{name}','{last}',{edad_sql},'{sexo}','{estado}',"
            f"'{ubicacion}',NULL,NULL,'{notas}','{foto}','vtb-scraper',"
            f"'{created}','{updated}')"
        )
        
        if len(values_personas) >= batch_size:
            sql_lines.append(
                "INSERT OR IGNORE INTO personas "
                "(cedula,nombre,apellido,edad,sexo,estado,ubicacion_nombre,latitud,longitud,notas,foto_key,fuente,created_at,updated_at) VALUES "
                + ",".join(values_personas) + ";"
            )
            values_personas = []

    if values_personas:
        sql_lines.append(
            "INSERT OR IGNORE INTO personas "
            "(cedula,nombre,apellido,edad,sexo,estado,ubicacion_nombre,latitud,longitud,notas,foto_key,fuente,created_at,updated_at) VALUES "
            + ",".join(values_personas) + ";"
        )

    # Reportes
    missing = [p for p in persons if p.get("status") == "missing"]
    values_reportes = []
    for p in missing:
        name = ((p.get("first_name") or "") + " " + (p.get("last_name") or "")).strip().replace("'", "''")
        cedula = (p.get("national_id") or "").replace("'", "''")
        desc = (p.get("description") or "").replace("'", "''")
        loc = (p.get("last_seen_location") or "").replace("'", "''")
        created = (p.get("created_at") or "").replace("'", "''")
        
        values_reportes.append(
            f"('desaparecido','{name}','{cedula}','{desc}','','{loc}',NULL,NULL,'abierto',NULL,'{created}','{created}')"
        )
        
        if len(values_reportes) >= batch_size:
            sql_lines.append(
                "INSERT INTO reportes "
                "(tipo,nombre_buscado,cedula_buscado,descripcion,reportante_nombre,ubicacion_nombre,latitud,longitud,estado_reporte,persona_id,created_at,updated_at) VALUES "
                + ",".join(values_reportes) + ";"
            )
            values_reportes = []

    if values_reportes:
        sql_lines.append(
            "INSERT INTO reportes "
            "(tipo,nombre_buscado,cedula_buscado,descripcion,reportante_nombre,ubicacion_nombre,latitud,longitud,estado_reporte,persona_id,created_at,updated_at) VALUES "
            + ",".join(values_reportes) + ";"
        )

    print(f"Escribiendo a {SQL_FILE}...")
    with open(SQL_FILE, "w", encoding="utf-8") as sf:
        sf.write("\n".join(sql_lines))

    print(f"Ejecutando SQL en D1 (remoto: {USE_REMOTE})...")
    cmd = ["npx", "wrangler", "d1", "execute", "busca-db"]
    if not USE_REMOTE:
        cmd.append("--local")
    cmd.extend(["--file", SQL_FILE])

    res = subprocess.run(cmd, cwd=FRONTEND_DIR, capture_output=True, text=True)
    
    # Limpiar archivo SQL temporal
    if os.path.exists(SQL_FILE):
        os.remove(SQL_FILE)

    if res.returncode == 0:
        print("✓ Siembra (seed) completada exitosamente.")
    else:
        print("❌ Error al sembrar base de datos:")
        print(res.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
