# Playable "Que jogo é esse?" — Tetris

Anúncio **jogável** em HTML5 (não é vídeo). A pessoa liga a TV, ouve a música,
monta a resposta no teclado do controle, ganha moedas e cai no "JOGAR GRÁTIS".
Um arquivo só, sem rede, **187 KB** (9% do teto de 2 MB do Google Ads).

```bash
node playable_tetris/build.cjs
```

Saída: `entregas/playable_tetris/nostalgia_tetris_playable.html` (ignorada pelo
git, como as outras entregas). O build **reprova** se sobrar marcador sem
preencher, se houver recurso externo ou se passar de 2 MB.

Para testar no celular de verdade — o único teste que confere áudio e toque —
mande o `.html` pelo WhatsApp ou Drive e abra. Não precisa de servidor.

## De onde vem cada coisa

| Elemento | Origem |
|---|---|
| Música | **Korobeiniki**, folclore russo de 1861, domínio público. Sintetizada em Web Audio com arranjo próprio: pulso 25% na melodia e triângulo no baixo. **Não** é a gravação nem o arranjo do Game Boy (Hirokazu Tanaka/Nintendo). |
| Efeitos (tecla, erro, acerto, chiado) | Sintetizados. Os `.mp3` do app vieram do Construct e a licença não é verificável. |
| Silhueta na TV | `assets/silhouette_0.webp`, arte própria do app (controle genérico). |
| TV, controle, moeda, fundo | CSS. |
| Fonte | Press Start 2P, SIL OFL. |

`scene_bg.webp` e `channel_*.webp` do app ficaram **de fora**: têm He-Man, Sonic,
Mario, Star Wars e outros.

## ⚠️ Onde este playable NÃO segue as regras deste repositório

As regras do `README.md` da raiz foram escritas para os vídeos. O playable
diverge delas em três pontos, que precisam ser resolvidos antes de rodar mídia
paga.

1. **"Não imitar melodia de obra existente."** Korobeiniki é domínio público
   como composição, mas num quiz cuja resposta é TETRIS ele funciona como *a*
   música do Tetris. Foi uma decisão consciente do Gerson (2026-09-29), não um
   descuido. O `out/audio_qa/melody.mjs` do pipeline de vídeo mediria isso como
   não original.
2. **Falta o aviso na cartela final.** Os vídeos levam
   `COPY.disclaimer = 'Marcas citadas pertencem aos seus respectivos donos.'`,
   e o playable ainda não tem.
3. **A palavra TETRIS** é marca registrada da The Tetris Company, que tem
   histórico de processar clones. A resposta pode ser trocada em
   `CONFIG.answer`, no topo do `src/index.html`.

## Saída para a loja

`openStore()` tenta os ganchos na ordem: MRAID (AppLovin, Unity, ironSource),
Google `ExitApi`, Meta `FbPlayableAd`. Se nenhum existir, abre o link direto.
No link direto, iPhone e iPad vão para a App Store e o resto vai para a Google
Play. O iPadOS 13+ se apresenta como Mac, então ele é detectado pela tela de
toque.

No Google Ads e na Meta, quem decide o destino é a URL de clique da campanha.

**Não rode campanha iOS ainda.** Em 2026-09-29 a App Store tinha a 4.0.3,
que não tem a telemetria e está com os IDs de anúncio errados (usa o app do
Android no AdMob). O build iOS está travado na migração da conta Apple para
pessoa jurídica.

## Origem

Criado no repositório do app (`gersonsdj/Nostalgia`) e movido para cá em
2026-09-29. O histórico anterior está lá nos commits `e83a384`, `dd32746` e
`44ea01c`.
