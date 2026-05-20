Feature 2 — Integración de datos financieros y de mercado

Descripción
Permite integrar fuentes de datos externas reales para alimentar el sistema 
con información financiera oficial y precios de mercado actualizados. 
Incluye integración con SEC EDGAR para consulta financiera y con Yahoo Finance 
para actualización batch de precios persistidos.

User Story
Como inversor, quiero que el sistema obtenga información financiera oficial y precios de mercado actualizados para operar con datos confiables.

Criterios de aceptación
- El usuario puede buscar empresas por ticker o nombre.
- El sistema muestra resultados relevantes provenientes de EDGAR.
- Se muestran métricas financieras principales (Revenue, Net Income, EPS, Assets, Liabilities).
- Se muestra evolución histórica de métricas financieras.
- Se muestran filings recientes (10-K y 10-Q).
- El sistema ejecuta un proceso batch para actualizar precios desde Yahoo Finance.
- Los precios obtenidos se persisten en base de datos.
- Se registra timestamp de última actualización.
- Si un ticker falla durante la actualización, el proceso continúa con el resto.
- Toda valorización utiliza únicamente precios persistidos.

