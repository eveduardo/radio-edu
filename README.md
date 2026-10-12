# Radio Edu

Aplicação web em React + Vite, baseada no [template-react](https://github.com/jposawa/template-react) e usando a biblioteca de UI [`@jposawa/ronin-ui`](https://www.npmjs.com/package/@jposawa/ronin-ui).

## Como rodar

```bash
pnpm install
cp .env.example .env.local   # ajuste as variáveis
pnpm dev
```

| Script | Descrição |
| --- | --- |
| `pnpm dev` | servidor de desenvolvimento |
| `pnpm build` | build de produção |
| `pnpm preview` | serve o build localmente |
| `pnpm lint` | ESLint |

## Estrutura

```
src/
├── app/            # composição da aplicação
│   ├── App.jsx
│   ├── AppProviders.jsx   # providers globais (router, recoil, ...)
│   └── router/            # AppRouter + registro central de rotas (routes.js)
├── features/       # uma pasta por funcionalidade
│   └── <feature>/
│       ├── pages/         # páginas (export default, carregadas com lazy)
│       ├── components/    # componentes exclusivos da feature
│       ├── services/      # chamadas à API da feature
│       ├── routes.jsx     # rotas da feature
│       └── index.js       # API pública da feature
├── layouts/        # estruturas de página (MainLayout)
├── components/     # componentes compartilhados específicos do app
├── hooks/          # hooks compartilhados
├── globalState/    # atoms Recoil
├── services/       # cliente HTTP (axios) compartilhado
├── config/         # variáveis de ambiente
├── constants/      # constantes globais
├── helpers/        # funções utilitárias
└── styles/         # CSS global
```

Import com alias: `@/` aponta para `src/`.

## Adicionando uma nova funcionalidade

1. Crie `src/features/<nome>/pages/<Nome>Page.jsx` com `export default`.
2. Crie `src/features/<nome>/routes.jsx`:

   ```jsx
   import { lazy } from "react";
   const MinhaPage = lazy(() => import("./pages/MinhaPage"));

   export const minhaRoutes = [
     { key: "minha", path: "/minha", label: "Minha", order: 2, Component: MinhaPage },
   ];
   ```

3. Exporte em `src/features/<nome>/index.js` e adicione as rotas em `src/app/router/routes.js`.

Rotas com `label` aparecem automaticamente no menu principal.

## UI e tema

- Use os componentes do `@jposawa/ronin-ui` (`Button`, `Input`, `Card`, `Section`, `Modal`, `Select`, `Tabs`, ...) antes de criar componentes próprios.
- O tema é controlado pelo atributo `data-ronin-theme` no `MainLayout`, a partir do atom `themeAtom` (persistido no `localStorage`).
- Para customizar cores, sobrescreva os tokens (`--color-primary`, `--color-bg`, ...) em `src/styles/global.css`.
