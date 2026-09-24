# Preguntados ISO/IEC 27002 · Multijugador en línea

Juego **multijugador en línea** sobre la norma **ISO/IEC 27002**: una partida por fases, jugable desde el navegador por varias personas a la vez.

## Cómo funciona

1. Un jugador crea una sala y comparte el **código** o el **enlace**.
2. Los demás se unen con su nombre desde cualquier dispositivo (celular, PC).
3. El anfitrión inicia la partida y **modera**: no juega, solo observa y (en la Fase 1) gira la rueda.
4. Los puntos se acumulan a lo largo de las **5 fases**; la partida termina con el podio final.

### Las 5 fases

| Fase | Juego | Mecánica |
|------|-------|----------|
| 1 | 🎯 **Preguntados** | Ronda de 8 preguntas con rueda de categorías. +100 el primero, +50 los demás, −20 si fallas (20 s). |
| 2 | 🗂️ **Sorting Express** | Clasifica 8 controles en Organizacional / Personas / Físicos / Tecnológicos (30 s/tarjeta). +50 acierto, −30 fallo. |
| 3 | 🕵️ **Caza de Vulnerabilidades** | Elige solo los controles adecuados para 2 casos prácticos (2 min). +30 correcto, −20 por omitir o por extra, +50 bono limpio. |
| 4 | 🛡️ **SOC Manager** | Presupuesto de $10,000: compra controles y mitiga 3 ataques (90 s por ataque, con botón "Listo" para adelantar). +150 mitigar, −100 brecha + pérdida de presupuesto. |
| 5 | 🗣️ **Debate Express** | Vota si cada afirmación es ventaja, limitación o mito (30 s). +40 acierto, −15 fallo. |

Cada fase empieza con un anuncio y un temporizador en pantalla; el marcador en vivo se actualiza en todo momento.

## Ejecutar localmente (para probar)

```bash
npm install
npm start
```

Abre `http://localhost:3000`. Para que otros jugadores entren por internet de forma temporal, usa un túnel:

```bash
npx localtunnel --port 3000
```

## Tests

```bash
node test.js         # 12 tests de la Fase 1 (salas, host-modera, puntos)
node test-phases.js  # 19 tests que recorren las 5 fases (URL env: $env:URL / export URL)
```

## Desplegar gratis en la nube

### Opción A · Render (incluye `render.yaml`)
1. Sube la carpeta `preguntados-online` a un repositorio de GitHub.
2. En https://render.com crea una cuenta gratuita y elige **New → Blueprint**.
3. Conecta tu repositorio; Render detecta `render.yaml` y publica la app en un enlace tipo `https://preguntados-27002.onrender.com`.
4. Comparte ese enlace con los jugadores.

### Opción B · Railway
1. Sube la carpeta a GitHub y crea un proyecto nuevo en https://railway.app (plan trial gratuito).
2. Elige **Deploy from GitHub repo**; Railway detectará automáticamente `npm start`.

## Estructura

```
preguntados-online/
├── server.js          # Servidor Node.js + Socket.IO (salas y máquina de 5 fases)
├── phases.js          # Datos de las Fases 2-5 (tarjetas, casos, tienda, ataques, afirmaciones)
├── questions.js       # Banco de 51 preguntas en 5 categorías
├── public/index.html  # Cliente del juego (un solo archivo)
├── test.js            # Tests de la Fase 1 (12)
├── test-phases.js     # Tests end-to-end de las 5 fases (19)
├── package.json
└── render.yaml        # Config de despliegue en Render
```