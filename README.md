# Anúncios em vídeo do Nostalgia

Vídeos verticais de 15 s (1080×1920, 30 fps, H.264 + AAC) para o app **Nostalgia**
(quiz: ouvir o som de um clássico e digitar o nome no controle remoto virtual).
Tudo é gerado por código: pixel art 16-bit desenhada em canvas e trilha e efeitos
sintetizados. Não há samples nem arte de terceiros.

- `_template/`: o pipeline do primeiro anúncio (Bomberman), que é o modelo dos próximos.
- `entregas/<slug>/`: o que vai para o cliente (MP4 final e capa sugerida).

## Como o pipeline funciona

| Arquivo | Papel |
|---|---|
| `timeline.js` | **Contrato.** Tamanho, grade de pixel (1 px de arte = 4 px), FPS, BPM, cada tempo de cena e deixa (`CUES`), textos PT-BR (`CAPTIONS`, `COPY`), retângulo `SAFE`, paleta. Visual e áudio leem os tempos daqui, então ficam sincronizados por construção. |
| `visuals.js` | `initVisuals()` e `drawFrame(ctx, t)`: desenha o quadro no tempo `t` num canvas 270×480 e amplia 4× sem suavização. Precisa ser determinístico: usa PRNG semeado e nunca `Math.random` ou `Date`. |
| `audio.js` | `renderAudio({sampleRate})` → `AudioBuffer` de 15,000 s, feito com `OfflineAudioContext`. Tem masterização própria: −14 LUFS, pico real ≤ −1,5 dBTP. |
| `export.js` | WebCodecs H.264 High (`avc1.640029`, 30 Mbps, keyframe a cada 60) + AAC 192k, via mp4-muxer (jsDelivr). |
| `index.html` | Player de produção. `window.app.exportMp4()` grava `out/nostalgia_bomberman_9x16_15s.mp4`; também oferece `saveWav()` e `snapshot(times, dir)`. Os parâmetros `?v=`, `?a=` e `?t=` escolhem visual, áudio e tempo. |
| `snap.html` | Harness de quadros: `?v=visuals.js&times=..&dir=..` salva PNGs e um `sheet.png`, e checa determinismo e ms/quadro. |
| `audio_check.html` | Renderiza o áudio num WAV: `?m=audio.js&dir=..`. |
| `server.mjs` | Servidor local: `node server.mjs --port 5181`. Serve a pasta, aceita `POST /save?dir=&name=` (grava em `out/`) e suporta Range. |
| `out/test/mp4probe.mjs` | Verifica o MP4 (caixas, 450 quadros, 15,000 s, codecs, fast-start). Saída 0 = passou. |
| `out/final_qa/*` | QA do arquivo: `decode_frames.html` (PSNR contra o renderizador, com re-seek), `decode.html` + `av_qa.mjs` (áudio decodificado contra a master, sincronia, LUFS, pico real). |
| `out/audio/analyze.mjs`, `out/audio_qa/*` | Análise de áudio: LUFS, pico real, onsets por deixa, espectrograma, cliques, alto-falante de celular simulado, originalidade da melodia. |

## Lições do primeiro anúncio (não repetir erros)

- **Regras de propriedade intelectual.** Nada de semelhança com personagem, logo ou
  marca de terceiros. Não imitar sprite, som ou melodia de obra existente. Não usar
  selo oficial de Play Store ou App Store. O nome da obra aparece **só como resposta do
  quiz**, e a cartela final leva `COPY.disclaimer`. O "ícone do personagem" é um slot
  com arte original provisória, trocável por `assets/character.png` licenciado.
- **Zona segura.** Todo texto legível fica dentro de `SAFE {72,160,940,1480}`: a UI do
  TikTok, Reels e Shorts cobre 22% embaixo, 12% à direita e 8% em cima.
- **Legendas.** Altura de maiúscula ≥ 48 px, duas linhas equilibradas, texto visível
  desde o primeiro quadro do pop, sem cobrir a ação.
- **Mão.** Precisa de anatomia de verdade (unha, vincos, rampa de pele de 3–4 tons),
  com a ponta do dedo **no centro da tecla** no quadro exato do toque.
- **Sincronia.** Arredonde as deixas das teclas para o quadro **mais próximo** (erro
  ≤ 16,7 ms). Clarão e "CORRETO!" caem no quadro exato da deixa.
- **Suspense antes do acerto.** Escureça tudo, menos os slots da resposta.
- **Cartela final.** A marca lidera: logo grande, depois a pergunta, depois a pílula
  "Grátis", depois as lojas. O CTA completo fica ≥ 1,5 s na tela.
- **Explosões e clarões.** Nada de quadro cinza desbotado. Use branco puro → tinta
  quente → cor saturada.
- **Bitrate.** A 12 Mbps o chiado e o pontilhado viravam borrão. Use 30 Mbps (Level 4.1).
- **Arquivos grandes.** Edite com `Edit` pontual. Um `Write` de 80 KB numa geração só
  estoura o detector de travamento dos agentes.
- **Servidor.** Se mudar `server.mjs`, reinicie o servidor. Um processo antigo ignora
  as mudanças.
- **Sem ouvido.** Os agentes medem o áudio, mas não ouvem. A validação final é humana.

## Fluxo de produção usado (e que deu certo)

1. **Contrato:** adaptar `timeline.js` (resposta, deixas, textos, paleta).
2. **Duas direções de arte concorrentes** mais um **júri de 3 lentes** (roteiro,
   pixel art, marketing/risco) que decide pelos quadros renderizados.
3. **Refinamento** com as correções do júri, e **QA de áudio** independente em paralelo.
4. **Críticas e polimento em laço:** artesania, espectador sem som mais risco,
   movimento e sincronia.
5. **Exportação.** Depois, QA **do arquivo**: fidelidade da compressão, áudio e
   sincronia decodificados, crítico novo. Por fim, correções e um verificador independente.
6. Copiar o MP4 final e a capa para `entregas/<slug>/`.
