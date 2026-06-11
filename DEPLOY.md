# Pasos pendientes para publicar este sitio

Contexto: este es un sitio estático (HTML/CSS/JS, sin build) sobre criptomonedas
para profesionales de economía. El objetivo es subirlo a GitHub y publicarlo en
Render (o GitHub Pages) para obtener una URL compartible.

## Estado

- [x] Verificar que Git esté instalado — instalado Git 2.54.0 con `winget install Git.Git`.
- [x] Inicializar el repositorio (`git init`) y hacer el primer commit.
- [x] Autenticar con GitHub — GitHub CLI 2.93.0 instalado y autenticado como `bazan404`.
- [x] Crear el repositorio remoto y hacer push — https://github.com/bazan404/cripto-economia
- [ ] Publicar (último paso, requiere un click):
  - **Opción Render (recomendada)**: hay un `render.yaml` en el repo. Entrar a https://dashboard.render.com/blueprints → New Blueprint Instance → conectar el repo `bazan404/cripto-economia` → Apply. Alternativa manual: New → Static Site → repo `cripto-economia` → publish directory `.` → sin build command.
  - **Opción GitHub Pages**: Settings del repo → Pages → Deploy from branch `main` / root.

## Notas

- No hay build ni dependencias: se publica la carpeta tal cual.
- El sitio consume APIs públicas (CoinGecko y alternative.me) desde el navegador del visitante; no necesita backend ni claves.
