# Radio Edu — Flash FM

Aplicação web em React + Vite baseada no [template-react](https://github.com/jposawa/template-react) e utilizando [`@jposawa/ronin-ui`](https://www.npmjs.com/package/@jposawa/ronin-ui), integrada à API PHP e ao Firebase Realtime Database de `../sistemasPHP/datasystem/radio` para reprodução sincronizada de áudio MP3 em tempo real.

## Funcionalidades

1. **Rádio Ao Vivo (`/`) — Ouvinte**:
   - Reprodução sincronizada de faixas MP3 pelo `offset_segundos` do servidor (`radio_sync.php`), mantendo todos os ouvintes no mesmo ponto da música.
   - Mixagem digital via Web Audio API (`AudioContext`, `GainNode` e `AnalyserNode`) com VU Meter de LEDs em tempo real e disco de vinil animado.
   - Sincronização instantânea via Firebase Realtime Database (`mesa`) para:
     - Controle de volume de música e microfone em tempo real.
     - Crossfade digital suave quando o locutor avança a faixa (`forcar_troca`).
     - Reprodução automática de blocos de voz ao vivo do locutor (`voz_stream/chunk_*.webm`) e vinhetas.
     - Hora certa automática nos minutos `:00` e `:30` com atenuação da música (ducking).
   - Modal de **Pedir Música** e **Catálogo do Acervo por Gênero** construídos com `@jposawa/ronin-ui` (`Modal`, `Input`, `Button`, `Badge`), integrados ao endpoint `fazer_pedido.php`.

2. **Mesa Master (`/locutor`) — Locutor**:
   - Mesa de som de 2 canais (`CH 1 • MIC` e `CH 2 • MÚSICA`) com faders verticais e VU Meters verticais de 14 LEDs.
   - Transmissão de voz ao vivo (`getUserMedia` + `MediaRecorder`) com corte inteligente por silêncio e envio para `api_locutor.php`.
   - Card **No Ar Agora** com cronômetro regressivo e botão **⏭ Pular / Fade** (crossfade remoto em todos os ouvintes).
   - Painel de **Pedidos dos Ouvintes** (`locutor.php?acao_pedidos=listar|marcar_tocado|remover`) com agendamento imediato da próxima faixa.
   - Painel de **Acervo por Gênero** com busca, agendamento direto (`radio_sync.php?agendar_proxima=...`) e reindexação de cache (`radio_sync.php?gerar_cache=1`).

## Como rodar

Certifique-se de que o Apache/PHP esteja servindo `http://localhost/datasystem/radio` (o Vite possui proxy automático em `/radio-api`).

```bash
pnpm.cmd install
pnpm.cmd dev
```
