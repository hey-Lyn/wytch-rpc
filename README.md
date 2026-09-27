# Wytch RPC

![Node](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)
![Dependências](https://img.shields.io/badge/depend%C3%AAncias-0-brightgreen)
![Testes](https://img.shields.io/badge/testes-43%20passando-brightgreen)
![Discord](https://img.shields.io/badge/Discord-Rich%20Presence-5865F2?logo=discord&logoColor=white)
![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)

> Mostra no seu status do Discord **o que você está assistindo no YouTube**: título, canal, timestamp com barra de progresso, thumbnail e um botão para assistir na hora exata. Tudo isso conversando com o Discord pelo **protocolo IPC puro**, sem bibliotecas externas.

[English version 🇺🇸](README.en.md)

---

## Demonstração

Quando você assiste a um vídeo, seu status fica assim:

```
▶ Assistindo ao YouTube
   Canal · Título do vídeo
   ▶ 03:21 / 10:45 · by @hey-Lyn

   [Assistir no YouTube]   ← abre o vídeo na timestamp exata
```

- **Pausou** (ou trocou de aba)? O progresso congela (`❚❚ 03:21 / 10:45`).
- **Fechou** a aba do YouTube? O RPC some.
- **Assistindo uma live?** Sem barra de progresso, só o tempo decorrido.
- **Anúncio tocando?** O RPC não mostra o anúncio.

---

## Funcionalidades

- ⏱️ **Timestamp em tempo real** com barra de progresso (tocando / pausado / live)
- 🖼️ **Thumbnail do vídeo** como imagem grande do RPC em **moldura quadrada** — o Discord exige imagem quadrada; o servidor gera via `images.weserv.nl` (padrão: zoom preenchendo o quadrado, sem bordas; ou `contain` com fundo)
- 🔘 **Botão "Assistir no YouTube"** que abre o vídeo exatamente no segundo atual
- 🧊 Congela o progresso ao pausar, trocar de aba ou durante anúncios
- 🧹 Limpa o RPC automaticamente quando a última aba de YouTube é fechada
- 🔁 Reconexão automática: se o Discord cair ou o app for reiniciado, o servidor se recupera sozinho
- 🛡️ Entrada validada (anti-NaN, truncamento, limites de payload) — roda como se fosse produção
- 🧪 Suíte de testes automatizada (42 testes) que valida o protocolo de ponta a ponta
- 📦 **Zero dependências** — Node.js puro, sem `npm install`
- 🏷️ Crédito configurável (`by @seunick`)

---

## Como funciona

```
┌──────────────────────────┐      ┌──────────────────────────────┐
│   Extensão (MV3)         │      │  Servidor local (Node.js)    │
│   content.js             │      │  server.js                   │
│   extrai do <video> e    │ HTTP │  valida, monta o activity e  │
│   do DOM do YouTube      ├─────►│  envia pelo named pipe       │
└──────────────────────────┘  POST│  http://127.0.0.1:4444/update└─────────────┬────────┐
                                                                              │ IPC     │
                                                                              ▼         │
                                                                      ┌────────────────┐│
                                                                      │ Discord        ││
                                                                      │ \\.\pipe\      ││
                                                                      │ discord-ipc-0  ││
                                                                      └────────────────┘│
```

**Sem OAuth, sem tokens.** O Discord permite atualizar o Rich Presence de um app apenas enviando o `client_id` (Application ID) — é o mesmo mecanismo usado pelo PreMiD. Isso simplifica demais o projeto.

### O protocolo

O Discord desktop expõe **named pipes** `\\.\pipe\discord-ipc-{0..9}`. Cada mensagem é um frame:

| bytes 0–3 | bytes 4–7 | bytes 8+ |
|-----------|-----------|----------|
| opcode (uint32 LE) | tamanho do JSON (uint32 LE) | payload JSON |

Opcodes usados:

| opcode | nome | direção |
|--------|------|---------|
| `0` | HANDSHAKE | cliente → Discord (`{ "v": 1, "client_id": "..." }`) |
| `1` | FRAME | ambos (`SET_ACTIVITY` com o activity, ou `READY`/`CLOSE`/`ERROR`) |
| `2` | CLOSE | Discord → cliente |
| `3` | PING | ambos (heartbeat) |
| `4` | PONG | resposta ao PING |

O activity é o objeto padrão do Discord (tipo `3` = Watching), com `timestamps` em **segundos** e `buttons` com URL:

```json
{
  "type": 3,
  "details": "Canal · Título do vídeo",
  "state": "▶ 03:21 / 10:45 · by @hey-Lyn",
  "timestamps": { "start": 1790000000 },
  "assets": { "large_image": "https://i.ytimg.com/vi/<id>/maxresdefault.jpg" },
  "buttons": [{ "label": "Assistir no YouTube", "url": "https://www.youtube.com/watch?v=<id>&t=201" }]
}
```

---

## Requisitos

- **Node.js 18+** (testado no v24)
- **Discord desktop** (Windows, macOS ou Linux) rodando e logado
- **Chrome / Edge / Vivaldi / Brave** (qualquer navegador Chromium) — a extensão usa Manifest V3

---

## Instalação

### 1. Crie o app no Discord

1. Acesse [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**.
2. Copie o **Application ID** (é o seu `client_id`).
3. Em **Rich Presence**, ative *Rich Presence Asset* (opcional, para registrar imagens — a thumbnail do vídeo é enviada por URL e funciona sem isso).

### 2. Configure o servidor

```bash
git clone https://github.com/hey-Lyn/wytch-rpc.git
cd wytch-rpc
cp server/config.example.json server/config.json
# edite server/config.json e cole seu Application ID
```

```json
{
  "clientId": "SEU_APPLICATION_ID_AQUI",
  "activityName": "YouTube",
  "credit": "by @hey-Lyn"
}
```

### 3. Inicie o servidor

```bash
npm start
```

Você deve ver: `Servidor local ouvindo em http://127.0.0.1:4444` e `Conectado ao Discord (IPC READY)`.

### 4. Instale a extensão

1. Abra `chrome://extensions` no seu navegador.
2. Ative o **modo desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione a pasta `extension/`.
4. Abra um vídeo no YouTube e veja seu status no Discord. 🎉

---

## Configuração (`server/config.json`)

| campo | padrão | descrição |
|-------|--------|-----------|
| `clientId` | — | Application ID do seu app no Discord (obrigatório) |
| `activityName` | `"YouTube"` | Nome que aparece sob o status (é o nome do "jogo") |
| `credit` | `""` | Texto extra no fim da linha de estado, ex.: `"by @hey-Lyn"` |
| `squareThumb` | `true` | Embuta a thumbnail num quadrado 640×640 (via `images.weserv.nl`) para o Discord não cortar |
| `thumbFit` | `"cover"` | Como preenche o quadrado: `cover` (zoom, sem bordas) ou `contain` (vídeo inteiro + fundo) |
| `thumbBg` | `"000000"` | Cor de fundo (hex) usada quando `thumbFit` é `contain` |
| `pipeIndex` | *(auto)* | Força um índice fixo de pipe `discord-ipc-N` (opcional) |

Variáveis de ambiente opcionais: `YT_RPC_PORT`, `YT_RPC_CONFIG`, `YT_RPC_LOG`.

---

## Testes

```bash
npm test
```

A suíte inicia o servidor real contra um **mock do Discord** (pipe dedicado + porta própria, sem tocar no Discord real) e valida 43 casos: handshake, payload, estados (tocando/pausado/live), truncamento, sanitização de entrada, robustez HTTP, timeouts e reconexão.

```
RESULTADO: 43 passaram, 0 falharam
```

---

## Ferramentas de desenvolvimento

| comando | o que faz |
|---------|-----------|
| `npm start` | inicia o servidor |
| `npm test` | roda os 43 testes de integração |
| `npm run icons` | regenera os ícones da extensão (PNG) |
| `npm run diag -- <clientId>` | diagnóstico do named pipe contra o Discord real |
| `node tools/test-pipe.js` | mock manual do Discord para inspecionar o protocolo |

---

## Estrutura do projeto

```
wytch-rpc/
├── extension/          Extensão Manifest V3 (Chrome/Edge/Vivaldi/Brave)
│   ├── manifest.json
│   ├── content.js      Extrai vídeo, título, canal, timestamp, anúncio
│   ├── background.js   Limpa o RPC quando a última aba fecha
│   └── icons/          Ícones gerados
├── server/
│   ├── server.js       Servidor HTTP + cliente IPC do Discord (zero deps)
│   ├── config.example.json
│   └── config.json     (ignorado pelo git — seu clientId pessoal)
├── tools/
│   ├── run-tests.js    Suíte de 43 testes de integração
│   ├── test-pipe.js    Mock do Discord
│   ├── diag-pipe.js    Diagnóstico do pipe real
│   └── generate-icons.js
├── package.json        Scripts (npm start / test / icons / diag)
└── README.md
```

---

## Roadmap / ideias

- [ ] Suporte a Firefox (WebExtensions)
- [ ] Configuração da extensão por popup (ligar/desligar, credit)
- [ ] Detecção de Spotify no YouTube (vídeos de música) para usar o RPC do Spotify
- [ ] Publicar o servidor como binário único (p.ex. `pkg`)
- [ ] Lançar no Chrome Web Store

---

## Troubleshooting

**O status não aparece**
1. O servidor está rodando? `npm start` deve mostrar `Conectado ao Discord (IPC READY)`.
2. Extensão carregada? Abra `chrome://extensions` e confira se está ativa.
3. Botões do RPC só aparecem para **outros usuários** — você mesmo não vê o seu próprio botão.
4. O nome que aparece no status é o nome do **app** do portal Discord (se criou com nome "Wytch", aparece "Watching Wytch").

**"porta 4444 já está em uso"**
Já existe uma instância rodando. Encerre o processo anterior (`Stop-Process` no PID de `server/server.pid`).

**O progresso não anda / o RPC não atualiza**
Veja `server/server.log` — ele registra cada mudança de RPC, conexões e erros.

---

## Licença

[MIT](LICENSE) © 2026 [hey-Lyn](https://github.com/hey-Lyn)

Feito do zero com Node.js puro, sem dependências, como projeto de portfólio.
