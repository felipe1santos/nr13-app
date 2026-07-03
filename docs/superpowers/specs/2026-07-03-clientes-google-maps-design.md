# Clientes com Google Maps/Places — Design

Data: 03/07/2026 · Status: aprovado pelo usuário

## Objetivo

Na tela "Empresas Cadastradas" (clientes): buscar a empresa no Google para preencher o cadastro,
exibir cards com logo (favicon do site) + nome + dados rápidos (como resultado de busca do
Google), e ao clicar no card abrir uma tela de detalhe com todos os dados, mapa da localização
exata e o login do portal do cliente (se existir).

## Abordagem escolhida

Places API (New) via REST (`places:searchText`) para busca/autofill — sem carregar o Maps JS
SDK. Mapa de detalhe via **Google Maps Embed API** (iframe, gratuito). Logo via favicon público
`https://www.google.com/s2/favicons?domain=<site>&sz=64` (sem chave).

Chave da API em `.env` → `VITE_GOOGLE_MAPS_KEY` (já coberta pelo .gitignore). **Segurança:** a
chave fica no bundle (inevitável); proteção real é restrição por HTTP referrer + restrição de
APIs (Maps Embed API, Places API New) no Google Cloud Console — responsabilidade de deploy.

## Modelo de dados

`Cliente` (`src/features/cadastros/tipos.ts`) ganha campos opcionais:
`website`, `logoUrl`, `placeId`, `lat`, `lng`, `anotacoes`, `portalEmail`.
Clientes existentes seguem válidos (todos opcionais).

## Fluxos

1. **Form Nova/Editar Empresa:** campo "Buscar empresa no Google" no topo. Digita → botão
   Buscar → `POST https://places.googleapis.com/v1/places:searchText` (header
   `X-Goog-Api-Key` + `X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,
   places.addressComponents,places.location,places.websiteUri,places.nationalPhoneNumber`).
   Lista de resultados; ao escolher: preenche nome fantasia, endereço/bairro/cidade/UF/CEP
   (de addressComponents), telefone, website, lat/lng, placeId, logoUrl (favicon do domínio).
   CNPJ segue manual. Campo novo "Anotações" (textarea).
2. **Lista:** cards estilo resultado Google — favicon + razão social/fantasia + URL do site;
   abaixo CNPJ, telefone, endereço curto. Card inteiro clicável → detalhe. Lápis → edição.
3. **Detalhe do cliente:** todos os dados (contato/representante, telefone, e-mail, atividade,
   endereço completo, anotações) + mapa iframe
   `https://www.google.com/maps/embed/v1/place?key=<KEY>&q=place_id:<ID>` (fallback: endereço
   textual; sem chave/sem endereço → sem mapa, aviso discreto) + seção "Acesso ao Portal":
   mostra `portalEmail` gravado; se usuário mestre, tenta `listarSubUsuarios()` e filtra
   `papel==='cliente' && cliente_id===id` para listar logins reais; sem acesso → "Sem acesso
   criado" + atalho para o form.
4. **Criar acesso no form** grava `portalEmail` no cliente (visível a qualquer usuário depois).

## Erros / bordas

- Busca falha/quota: mensagem no form, cadastro manual segue funcionando.
- Sem `VITE_GOOGLE_MAPS_KEY`: busca e mapa desativados com aviso; resto da tela normal.
- Favicon 404: `onError` esconde a imagem e mostra inicial do nome.
