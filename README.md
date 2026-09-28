# Wytch RPC

![Node](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)
![Dependências](https://img.shields.io/badge/runtime-0%20depend%C3%AAncias-brightgreen)
![Testes](https://img.shields.io/badge/testes-50%20passando-brightgreen)
![Discord](https://img.shields.io/badge/Discord-Rich%20Presence-5865F2?logo=discord&logoColor=white)
![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)

> Mostra no seu status do Discord **o que você está assistindo no YouTube**: título, canal, timestamp com barra de progresso, thumbnail e um botão para assistir na hora exata. Tudo isso conversando com o Discord pelo **protocolo IPC puro**, sem bibliotecas externas.

[English version 🇺🇸](README.en.md)

---

## Instalação rápida (Windows) 🚀

Não quer mexer com código? Baixe o executável pronto:

1. **Baixe** o `wytch-rpc-win-x64.zip` na página de [**Releases**](https://github.com/hey-Lyn/wytch-rpc/releases) e extraia a pasta.
2. **Inicie o programa**: dê um duplo clique em `wytch-rpc.vbs` (ou `iniciar.bat`).
   - Ele abre **oculto**, com um **ícone na bandeja do sistema** (perto do relógio). Clique com o botão direito no ícone para **Mostrar terminal**, **Minimizar**, **Abrir YouTube**, **Status** ou **Cancelar processo**.
   - Quer que ele inicie junto com o Windows? Rode uma vez `instalar-autostart.bat`.
3. **Instale a extensão**: abra `vivaldi://extensions` (ou `chrome://extensions` / `edge://extensions`) → ative o **Modo do desenvolvedor** → **Carregar sem compactação** → selecione a pasta `extension`.
4. Abra um vídeo no YouTube. Pronto! 🎉

> **Não precisa criar app no Discord** — já vem com um Application ID padrão. Para personalizar (crédito, formato da thumbnail ou seu próprio ID), clique no **ícone do Wytch RPC** na barra do navegador.

**Requisitos:** Discord desktop aberto e logado (o aplicativo, não o navegador).

---

## Demonstração

Quando você assiste a um vídeo, seu status fica assim:

```
▶ Assistindo ao YouTube
   Canal · Título do vídeo
   ▶ 03:21 / 10:45 · by @seunick

   [Assistir]            ← abre o vídeo na timestamp exata
```

- **Pausou** (ou trocou de aba)? O progresso congela (`❚❚ 03:21 / 10:45`).
- **Fechou** a aba do YouTube? O RPC some.
- **Assistindo uma live?** Sem barra de progresso, só o tempo decorrido.
- **Anúncio tocando?** O RPC não mostra o anúncio.

---

## Funcionalidades

- ⏱️ **Timestamp em tempo real** com barra de progresso (tocando / pausado / live)
- 🖼️ **Thumbnail do vídeo** como imagem grande do RPC em **moldura quadrada** — o Discord exige imagem quadrada; o servidor gera via `images.weserv.nl` (padrão: zoom preenchendo, sem bordas; ou `contain` com fundo)
- 🔘 **Botão "Assistir"** que abre o vídeo exatamente no segundo atual
- 🧊 Congela o progresso ao pausar, trocar de aba ou durante anúncios
- 🧹 Limpa o RPC automaticamente quando a última aba de YouTube é fechada
- 🔁 **Reconexão automática**: se o Discord cair ou reiniciar, o servidor se recupera sozinho
- 🛡️ Entrada validada (anti-NaN, truncamento, limites de payload) — roda como se fosse produção
- 🧪 Suíte de testes automatizada (**50 testes**) que valida o protocolo de ponta a ponta
- 🖱️ **Fácil de usar**: executável pronto (`wytch-rpc.exe`), scripts `iniciar.bat`/`parar.bat`, auto-start no Windows e **popup de configuração** na extensão
- 🗂️ **Roda oculto** com um **ícone na bandeja do sistema** — mostre/minimize o terminal e cancele o processo pelo menu do ícone, sem janela sempre aberta
- 📦 **Zero dependências em runtime** — Node.js puro (o `.exe` embute o runtime)
- 🏷️ Crédito configurável (`by @seunick`)

---

## Como funciona

```
Extensão (MV3) ──HTTP POST /update──► Servidor local (Node.js) ──IPC (named pipe)──► Discord
  content.js                              server.js                        \\.\pipe\discord-ipc-{0..9}
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
  "state": "▶ 03:21 / 10:45 · by @seunick",
  "timestamps": { "start": 1790000000 },
  "assets": { "large_image": "https://images.weserv.nl/?url=...&w=640&h=640&fit=cover" },
  "buttons": [{ "label": "Assistir", "url": "https://www.youtube.com/watch?v=<id>&t=201" }]
}
```

---

## Requisitos

- **Discord desktop** (Windows, macOS ou Linux) rodando e logado
- **Chrome / Edge / Vivaldi / Brave** (qualquer navegador Chromium) — a extensão usa Manifest V3
- Para a **instalação manual**: **Node.js 18+** (testado no v24)

---

## Instalação manual (Node.js / desenvolvedores)

```bash
git clone https://github.com/hey-Lyn/wytch-rpc.git
cd wytch-rpc
npm start
```

O `server/config.json` é criado automaticamente na primeira execução. Você deve ver:

```
Servidor local ouvindo em http://127.0.0.1:4444
Conectado ao Discord (IPC READY)
```

Depois carregue a extensão: `chrome://extensions` → **Modo do desenvolvedor** → **Carregar sem compactação** → pasta `extension/`.

Para gerar o executável standalone:

```bash
npm install          # instala o empacotador (só no build)
npm run build:exe    # gera dist/wytch-rpc.exe
```

---

## Configuração

A forma mais fácil é o **popup da extensão** (clique no ícone do Wytch RPC). As mudanças são salvas em `server/config.json` e aplicadas na hora.

| campo | padrão | descrição |
|-------|--------|-----------|
| `clientId` | *(padrão do projeto)* | Application ID do app no Discord. Só mude se você criou o seu. |
| `activityName` | `"YouTube"` | Nome que aparece sob o status (é o nome do "jogo") |
| `credit` | `""` | Texto extra no fim da linha de estado, ex.: `"by @seunick"` |
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

A suíte inicia o servidor real contra um **mock do Discord** (pipe dedicado + porta própria, sem tocar no Discord real) e valida 50 casos: handshake, payload, estados (tocando/pausado/live), truncamento, sanitização de entrada, robustez HTTP, configuração, timeouts e reconexão.

```
RESULTADO: 50 passaram, 0 falharam
```

---

## Ferramentas de desenvolvimento

| comando | o que faz |
|---------|-----------|
| `npm start` | inicia o servidor |
| `npm test` | roda os 50 testes de integração |
| `npm run build:exe` | gera o executável standalone em `dist/` |
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
│   ├── options.html/js Popup de configuração (ícone da extensão)
│   └── icons/          Ícones gerados
├── server/
│   ├── server.js       Servidor HTTP + cliente IPC do Discord (zero deps)
│   ├── config.example.json
│   └── config.json     (ignorado pelo git — criado automaticamente)
├── tools/
│   ├── run-tests.js    Suíte de 50 testes de integração
│   ├── test-pipe.js    Mock do Discord
│   ├── diag-pipe.js    Diagnóstico do pipe real
│   └── generate-icons.js
├── iniciar.bat / parar.bat / instalar-autostart.bat
├── wytch-rpc.vbs / tray.ps1        Inicia oculto + ícone na bandeja
├── iniciar-console.bat             Modo console (debug)
├── package.json        Scripts (start / test / build:exe / icons / diag)
└── README.md
```

---

## Roadmap / ideias

- [x] Popup de configuração na extensão
- [x] Servidor empacotado como binário único (`.exe`)
- [ ] Suporte a Firefox (WebExtensions)
- [ ] Detecção de Spotify no YouTube (vídeos de música) para usar o RPC do Spotify
- [ ] Lançar na Chrome Web Store

---

## Troubleshooting

**O status não aparece**
1. O servidor está rodando? Abra http://127.0.0.1:4444/ — deve mostrar `"discordConnected": true`.
2. Extensão carregada? Abra `chrome://extensions` e confira se está ativa.
3. Botões do RPC só aparecem para **outros usuários** — você não vê o seu próprio botão.
4. O nome no status é o nome do **app** do Discord (o padrão do projeto mostra "Wytch").

**"porta 4444 já está em uso"**
Já existe uma instância rodando. Clique com o botão direito no ícone da bandeja → **Cancelar processo** (ou rode `parar.bat`).

**O progresso não anda / o RPC não atualiza**
Veja o `server.log` (ao lado do `server.js` ou do `.exe`) — ele registra cada mudança de RPC, conexões e erros.

---

## Licença

[MIT](LICENSE) © 2026 [hey-Lyn](https://github.com/hey-Lyn)

Feito do zero com Node.js puro, sem dependências em runtime, como projeto de portfólio.
