US-009 — Batch de actualización de precios desde Yahoo Finance

Descripción
Implementar un proceso batch independiente para actualizar precios de mercado desde Yahoo Finance.

User Story
Como sistema, quiero actualizar periódicamente los precios de los tickers utilizados para valorizar portfolios y watchlists con datos persistidos.

Criterios de aceptación
- El batch obtiene precios desde Yahoo Finance. 
- El batch consulta los tickers presentes en portfolios y watchlists. 
- Los precios obtenidos se guardan en base de datos. 
- Se registra fecha y hora de la última actualización. 
- Si falla un ticker, se registra el error y el proceso continúa. 
- El batch puede ejecutarse manualmente. 
- El batch puede ejecutarse desde el pipeline de CI como paso opcional.
