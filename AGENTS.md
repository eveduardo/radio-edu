# Regras e Diretrizes do Projeto Radio Flash (radio-edu)

## 🚀 Arquitetura & Deploy Contínuo (Netlify + GitHub)
- **Frontend em Produção**: `https://radio-flash.netlify.app/` (React + Vite PWA).
- **Repositório Git**: Conectado ao GitHub no branch `main` (`origin/main`).
- **Deploy Automático no Netlify**: O Netlify monitora os commits enviados para o GitHub (`git push origin main`), executa `npm run build` e publica o site automaticamente na nuvem.

### ⚠️ REGRA MANDATÓRIA DE DEPLOY:
Sempre que fizer qualquer modificação em arquivos do projeto React (`c:\sistemasReact\radio-edu\`):
1. Testar e rodar o build: `npm run build`.
2. Fazer o commit das alterações no Git.
3. **SEMPRE dar `git push origin main`** para que o Netlify receba as atualizações e atualize a rádio online imediatamente!

## 📻 Backend & Comunicação
- O backend PHP reside em `c:\sistemasPHP\datasystem\radio\` (hospedado em `https://datasystem-ce.com.br/radio/`).
- O Netlify possui proxy configurado no `netlify.toml` que encaminha `/radio-api/*` diretamente para o servidor PHP (`https://datasystem-ce.com.br/radio/`).
- Scripts como `radio_sync.php`, `hora_certa.php` e `fazer_pedido.php` rodam no servidor PHP e devem ser mantidos sincronizados com a hospedagem.
