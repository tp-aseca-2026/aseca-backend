US-010 — API interna de datos financieros y precios

Descripción
Exponer endpoints internos para que web y mobile consuman datos financieros, filings y precios persistidos.

User Story
Como aplicación web o mobile, quiero consumir una API interna de datos financieros y precios para mostrar información consistente al usuario.

Criterios de aceptación
- Existe endpoint de búsqueda de empresas.
- Existe endpoint de métricas financieras.
- Existe endpoint de filings recientes.
- Existe endpoint para consultar últimos precios almacenados.
- La API no consulta Yahoo Finance en tiempo real para valorizar.
- La API retorna errores claros ante fallas externas o datos inexistentes.
