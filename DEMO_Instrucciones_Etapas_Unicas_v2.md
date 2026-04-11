# Prueba DEMO Etapas Unicas V2

Archivo de prueba:
- `DEMO_Cobranza_2026-04-11_Etapas_Unicas_v2.xlsx`

Objetivo:
- Probar carga sin choque con leads actuales (IDs nuevos).
- Validar asignacion de etapas por fecha de vencimiento.
- Validar caso abono y caso pagado.
- Validar asignacion de ruta por `COD VEN`.

## 1) Cargar archivo
1. Sube `DEMO_Cobranza_2026-04-11_Etapas_Unicas_v2.xlsx` a la carpeta de Drive que dispara `Kommo Cuentas por Cobrar`.
2. Espera a que se ejecute el trigger (o ejecuta manualmente el workflow de ingesta).

## 2) Verificaciones en Kommo despues de la carga
Revisa por `DOCUMENTO` y deberias ver:
- `720101` -> `recordatorio 5 dias antes`
- `720102` -> `deadline`
- `720103` -> `5 dias atrasado`
- `720104` -> `10 dias atrasado`
- `720105` -> `15 dias atrasado`
- `720107` -> `deadline - abono` (porque tiene `PAGO=3000` y saldo pendiente)
- `720108` -> `pagado` (porque `SALDO=0` y `PAGO` total)

Caso especial:
- `720106` es caso para flujo de revision/no pagado segun su proceso operativo.

## 3) Verificaciones de datos
1. Confirma que cada lead tenga `COD CLI`, `DOCUMENTO`, telefono y montos cargados.
2. Confirma etiqueta de ruta usando `COD VEN`:
   - `COD VEN=1` -> etiqueta `Ruta 1`
   - `COD VEN=2` -> etiqueta `Ruta 2`
   - ... hasta `Ruta 8` en este archivo.

## 4) Verificacion en reporte Sheets/Excel historico
1. Ejecuta `Kommo Cobranzas - Reporte Excel Diario` (si no corre por cron en ese momento).
2. Verifica en `EstadoActual` que existan los documentos nuevos.
3. Verifica en `HistoricoMovimientos` que no duplique si no hubo cambios de firma.
4. Verifica color en `STATUS_PAGO`:
   - `Pagado` en verde.
   - `Abonado` en amarillo.

## 5) Limpieza al finalizar
1. Elimina o mueve los leads de prueba por `DOCUMENTO` (`720101` a `720108`).
2. Elimina el archivo de prueba de la carpeta de Drive para evitar reprocesos.
