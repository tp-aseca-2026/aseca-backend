US-013 — Validación de integración de datos externos

Descripción
Implementar pruebas para validar la integración con EDGAR, Yahoo Finance y las APIs internas.

User Story
Como equipo de desarrollo, queremos validar las integraciones externas para asegurar que el sistema opere con datos reales y maneje fallos correctamente.


Criterios de aceptación
- Existen tests de integración contra EDGAR.
- Existen tests del proceso batch de Yahoo Finance.
- Se testean errores parciales de Yahoo Finance.
- Se testea ausencia de datos financieros.
- Se valida que la valorización use precios persistidos.
- Se contemplan restricciones de rate limit de EDGAR.
