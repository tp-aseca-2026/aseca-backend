US-021 — Cálculo backend de valorización del portfolio

Descripción
Implementar el cálculo backend del valor actual del portfolio usando precios persistidos.

User Story
Como sistema, quiero calcular el valor actual del portfolio usando los últimos precios almacenados para evitar depender de consultas externas en tiempo real.

Criterios de aceptación
- El cálculo usa únicamente precios persistidos. 
- Se calcula el valor actual por posición. 
- Se calcula el valor total del portfolio. 
- Se informa la fecha de última actualización de precios. 
- Si falta precio para un ticker, el sistema lo informa o lo maneja de forma controlada.
