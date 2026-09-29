# Matura Zap para macOS

Aplicativo separado da edição Windows, usando o mesmo painel de licenças em
`https://maturazap.superzapmarketing.net`.

## Compatibilidade

- macOS 12 ou mais recente
- Apple Silicon (`arm64`) e Macs Intel (`x64`)
- Cada Mac ativado ocupa uma vaga de computador da licença
- Cada WhatsApp cadastrado ocupa uma vaga de conta da licença

## Atualizações

As versões são publicadas em GitHub Releases. O aplicativo consulta a versão
mais recente ao iniciar e a cada quatro horas, baixa o pacote correspondente à
arquitetura do Mac e oferece a instalação assim que o download termina.

Para atualização automática validada pelo macOS, configure no repositório os
segredos `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD` e `APPLE_TEAM_ID` de uma conta Apple Developer.
Sem esses segredos, o GitHub ainda gera os instaladores, porém o primeiro uso
exige abertura manual pela opção **Abrir** do Finder e a atualização automática
não deve ser liberada para clientes finais.

## Desenvolvimento

```bash
npm ci
npm test
npm start
```

O fluxo `.github/workflows/release.yml` compila e publica os instaladores DMG e
ZIP para Intel e Apple Silicon quando uma tag `v*` é enviada ao repositório.

