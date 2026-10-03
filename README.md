# Wytch RPC

![Node](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)
![Dependências](https://img.shields.io/badge/runtime-0%20depend%C3%AAncias-brightgreen)
![Discord](https://img.shields.io/badge/Discord-Rich%20Presence-5865F2?logo=discord&logoColor=white)
![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)

> Mostra no seu status do Discord **o que você está assistindo no YouTube**: título, canal, timestamp com barra de progresso, thumbnail e um botão para assistir na hora exata. Tudo isso conversando com o Discord pelo **protocolo IPC puro**, sem bibliotecas externas.

[English version 🇺🇸](README.en.md)

---

## Instalação rápida (Windows)

1. **Baixe** o `wytch-rpc-win-x64.zip` na página de [**Releases**](https://github.com/hey-Lyn/wytch-rpc/releases) e extraia a pasta.
2. **Inicie o programa**: dê um clique duplo em `wytch-rpc.exe`
   - Ele abre **oculto**, com um **ícone na tray do sistema** (perto do relógio). Clique com o botão direito no ícone para **Mostrar terminal**, **Minimizar**, **Abrir YouTube**, **Status** ou **Cancelar processo**.
   - Use `instalar-autostart.bat` caso queira que ele inicie junto do Windows.
3. **Instale a extensão**: abra `chrome://extensions` (ou a que for do seu navegador) → ative o **Modo do desenvolvedor** → **Carregar sem compactação** → selecione a pasta `extension`.
4. Abra um vídeo no YouTube.

---

## Demonstração

Quando você assiste a um vídeo, seu status fica assim:

```
▶ Assistindo ao YouTube
   Canal · Título do vídeo
   ▶ 03:21 / 10:45 · by @seunick

   [Watch]   [Get it]    ← abre o vídeo na timestamp exata / baixa o projeto
```

- **Pausou** (ou trocou de aba), O progresso congela (`❚❚ 03:21 / 10:45`).
- **Fechou** a aba do YouTube, O RPC some.
- **Se assistindo uma live**: Sem barra de progresso, só o tempo decorrido.
---

## Funcionalidades

- ⏱️ **Timestamp em tempo real** com barra de progresso (tocando / pausado / live)
- 🖼️ **Thumbnail do vídeo**
- 🔘 **Botão "Watch"** que abre o vídeo exatamente no segundo atual
- 🔗 **Botão "Get it"** que leva ao repositório do projeto
- 🧊 Congela o progresso ao pausar, trocar de aba ou durante anúncios
- 🧹 Limpa o RPC automaticamente quando a última aba de YouTube é fechada
- 🔁 **Reconexão automática**: se o Discord cair ou reiniciar, o servidor se recupera sozinho

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

## Testes

```bash
npm test
```

A suíte inicia o servidor real contra um **mock do Discord** (pipe dedicado + porta própria, sem tocar no Discord real) e valida 55 casos: handshake, payload, estados (tocando/pausado/live), truncamento, sanitização de entrada, robustez HTTP, configuração, timeouts e reconexão.

```
RESULTADO: 55 passaram, 0 falharam
```

---

## Ferramentas de desenvolvimento

| comando | o que faz |
|---------|-----------|
| `npm start` | inicia o servidor |
| `npm test` | roda os 55 testes de integração |
| `npm run build:exe` | gera o executável standalone em `dist/` |
| `npm run icons` | regenera os ícones da extensão (PNG) |
| `npm run diag -- <clientId>` | diagnóstico do named pipe contra o Discord real |
| `node tools/test-pipe.js` | mock manual do Discord para inspecionar o protocolo |

---

## Roadmap / ideias

- [x] Popup de configuração na extensão
- [x] Servidor empacotado como binário único (`.exe`)
- [ ] Suporte a Firefox (WebExtensions)
- [ ] Detecção de Spotify no YouTube (vídeos de música) para usar o RPC do Spotify
- [ ] Lançar na Chrome Web Store

---

## Licença

[MIT](LICENSE) © 2026 [hey-Lyn](https://github.com/hey-Lyn)
