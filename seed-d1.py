#!/usr/bin/env python3
import json, subprocess, os

DATA_FILE = "data/persons_full.json"
FRONTEND_DIR = "frontend"

def map_status(s):
    return {"missing": "desaparecido", "found": "encontrado"}.get(s, "desaparecido")

def map_gender(g):
    if not g:
        return "X"
    return {"masculino": "M", "femenino": "F"}.get(g.lower(), "X")

def run_sql(sql):
    subprocess.run(
        ["npx", "wrangler", "d1", "execute", "busca-db", "--local", "--command", sql],
        cwd=FRONTEND_DIR, capture_output=True, text=True
    )

def main():
    with open(DATA_FILE) as f:
        data = json.load(f)

    persons = data["persons"]
    total = len(persons)
    batch_size = 50

    print(f"Insertando {total} registros en D1 local...")

    for i in range(0, total, batch_size):
        batch = persons[i : i + batch_size]
        values = []
        for p in batch:
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

            values.append(
                f"('{cedula}','{name}','{last}',{edad_sql},'{sexo}','{estado}',"
                f"'{ubicacion}',NULL,NULL,'{notas}','{foto}','vtb-scraper',"
                f"'{created}','{updated}')"
            )

        sql = (
            "INSERT OR IGNORE INTO personas "
            "(cedula,nombre,apellido,edad,sexo,estado,ubicacion_nombre,latitud,longitud,notas,foto_key,fuente,created_at,updated_at) VALUES "
            + ",".join(values) + ";"
        )
        run_sql(sql)
        if (i // batch_size) % 10 == 0:
            print(f"  {i}/{total}...")

    print(f"  {total}/{total} - COMPLETO")

    print("Insertando reportes de desaparecidos...")
    missing = [p for p in persons if p.get("status") == "missing"]
    rbatch_size = 50
    for i in range(0, len(missing), rbatch_size):
        batch = missing[i : i + rbatch_size]
        values = []
        for p in batch:
            name = ((p.get("first_name") or "") + " " + (p.get("last_name") or "")).strip().replace("'", "''")
            cedula = (p.get("national_id") or "").replace("'", "''")
            desc = (p.get("description") or "").replace("'", "''")
            loc = (p.get("last_seen_location") or "").replace("'", "''")
            created = (p.get("created_at") or "").replace("'", "''")
            values.append(
                f"('desaparecido','{name}','{cedula}','{desc}','','{loc}',NULL,NULL,'abierto',NULL,'{created}','{created}')"
            )
        sql = (
            "INSERT INTO reportes "
            "(tipo,nombre_buscado,cedula_buscado,descripcion,reportante_nombre,ubicacion_nombre,latitud,longitud,estado_reporte,persona_id,created_at,updated_at) VALUES "
            + ",".join(values) + ";"
        )
        run_sql(sql)
        if (i // rbatch_size) % 10 == 0:
            print(f"  Reportes: {i}/{len(missing)}...")

    print("  COMPLETO")
    print("\nSeed finalizado. Datos insertados en D1 local.")


if __name__ == "__main__":
    main()
