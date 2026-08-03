# Memorial Descritivo de Desenvolvimento — Refrimaq Connect

Este documento reúne a especificação detalhada da arquitetura, estrutura de dados, módulos, funcionalidades e as melhorias recentemente desenvolvidas na plataforma **Refrimaq Connect**. Ele serve como base documental para futuras análises, auditorias e manutenções do projeto.

---

## 1. Visão Geral do Projeto

O **Refrimaq Connect** é um sistema integrado de gestão (ERP/CRM) projetado especificamente para prestadoras de serviços de refrigeração e assistência técnica. O sistema unifica o controle de ordens de serviço (OS), a gestão operacional de oficina, o fluxo de faturamento (PDV), o relacionamento e histórico com clientes, roteirização logística e faturamento/financeiro, permitindo que técnicos de campo e administradores colaborem em tempo real.

---

## 2. Arquitetura e Stack Tecnológica

A plataforma é construída sobre uma moderna arquitetura Single Page Application (SPA):

- **Frontend**: React (v18+) com TypeScript (para tipagem estática e segurança do código) alimentado pela ferramenta de build ágil **Vite**.
- **Estilização**: Tailwind CSS (framework de classes utilitárias para interfaces modernas e responsivas).
- **Banco de Dados & Backend-as-a-Service**: **Supabase** (PostgreSQL) com suporte a Row Level Security (RLS) para controle de acesso por usuários/perfis.
- **Armazenamento de Arquivos (Storage)**: Buckets públicos e protegidos no Supabase Storage para armazenamento de anexos de ordens de serviço.
- **APIs de Integração**:
  - **ViaCEP API**: Consulta de CEPs para preenchimento de endereço.
  - **OpenStreetMap (Nominatim API)**: Geocodificação de endereços para determinar latitude e longitude automaticamente.
- **Bibliotecas Auxiliares Importantes**:
  - **SheetJS (xlsx)**: Processamento e leitura de planilhas Excel (`.xls`, `.xlsx`).
  - **lucide-react**: Conjunto de ícones vetoriais modernos.

---

## 3. Estrutura de Módulos e Componentes

### 3.1. Gestão de Clientes (CRM)
- **Componentes**: `CustomerList.tsx`, `CustomerProfile.tsx`, `AddCustomerModal.tsx`.
- **Funcionalidades**:
  - Cadastro de clientes com informações de contato, endereço, documento (CPF/CNPJ), segmento e observações.
  - Monitoramento do status de relacionamento (Recente, Atenção, Urgente e Novo) com base na data do último contato.
  - **Filtros Avançados**: Filtros rápidos por status de contato, filtros dinâmicos por **Cidade** e por **Segmento** (detectados automaticamente a partir da base de dados e de tags especiais `[Segmento: ...]` salvas no campo de observações).
  - Geolocalização automática baseada no endereço fornecido.

### 3.2. Importador Inteligente de Clientes
- **Componentes**: `ImportModal.tsx`.
- **Funcionalidades**:
  - **Upload Multipastas**: Suporta o envio de arquivos CSV, arquivos de texto TXT, TSV e planilhas nativas do Excel (`.xls`, `.xlsx`).
  - **Mapeamento de Colunas**: Interface interativa que permite associar as colunas detectadas no arquivo às colunas internas do sistema (Nome, Telefone, WhatsApp, E-mail, CEP, Endereço, Número, Cidade, Estado, Documento, Segmento e Observações).
  - **Validação de CEP**: Consulta automática ao serviço ViaCEP para preencher dados ausentes de rua, cidade e estado quando apenas o CEP é fornecido.
  - **Processamento de Endereço**: Expressão regular inteligente que separa o nome do logradouro e o número se ambos estiverem inseridos na mesma linha de endereço da planilha.
  - **Mesclagem de Dados (Merge)**: Antes de cadastrar, o importador busca correspondentes por Documento, Nome ou E-mail. Caso o cliente já exista, o sistema apenas adiciona os dados que estavam faltando na base (fill-in) sem apagar as informações já existentes. O segmento é mesclado de forma segura no início das Observações (`[Segmento: Nome do Segmento]`), prevenindo erros de schema do banco.

### 3.3. Oficina e Ordens de Serviço (OS)
- **Componentes**: `WorkshopPage.tsx`, `WorkshopOrderView.tsx`, `WorkshopReportTab.tsx`, `WorkshopStats.tsx`.
- **Funcionalidades**:
  - Visualização detalhada das informações da OS organizada em abas:
    - **Detalhes**: Marca, modelo, número de série, voltagem, acessórios inclusos, estado geral de conservação e anexo de fotos.
    - **Peças**: Lista de peças do estoque aplicadas ou serviços indicados.
    - **PDV (Faturamento)**: Exibe resumo financeiro (valor total de peças + serviços), seleção de formas de pagamento (Dinheiro, PIX, Cartões, Boleto, Transferência) e botões de ação para concluir ou cancelar a OS.
    - **Histórico**: Linha do tempo com as mudanças de etapa da OS.
  - **Ações de Controle**: O botão **"Cancelar Ordem de Serviço"** foi removido da aba *Detalhes* para evitar cancelamentos acidentais e centralizar o fluxo operacional, permanecendo ativo exclusivamente na aba **PDV**.

### 3.4. Fotos e Anexos de Atendimento
- **Componentes**: Integrado em `WorkshopOrderView.tsx` e `TechnicianOSView.tsx`.
- **Funcionalidades**:
  - Upload direto para o bucket `service-order-attachments` do Supabase.
  - Exibição em grade de thumbnails nas telas do administrador e do técnico.
  - **Download de Fotos**: Implementação de um botão de download (ícone `Download`) integrado diretamente no hover dos thumbnails e na visualização expandida (Lightbox). O arquivo é baixado no computador/celular do usuário nomeado automaticamente de acordo com a OS (ex: `OS_0017_foto_1.jpg`), contendo contingência para abrir em nova aba em caso de restrições CORS.

### 3.5. Portal do Técnico (Visualização de Campo)
- **Componentes**: `TechnicianView.tsx`, `TechnicianOSView.tsx`.
- **Funcionalidades**:
  - Interface otimizada para dispositivos móveis com foco no fluxo de trabalho dos técnicos em campo.
  - Acesso rápido a Ordens de Serviço sob responsabilidade do técnico logado.
  - Preenchimento do laudo de diagnóstico técnico operacional.
  - Modais dedicados para avançar etapas das ordens de serviço adicionando observações contextuais.
  - Galeria de fotos do atendimento com recurso para tirar fotos usando a câmera do celular (`capture="environment"`) e baixá-las localmente.

### 3.6. Logística e Roteirização
- **Componentes**: `LogisticsPage.tsx`.
- **Funcionalidades**:
  - Planejamento de rotas de visitas técnicas semanais ou diárias.
  - Ordenação sequencial das paradas dos técnicos usando drag-and-drop.
  - Integração com mapas para visualização geográfica das posições físicas dos clientes a serem atendidos.

### 3.7. Vendas de Usados
- **Componentes**: `UsedSalesPage.tsx`, `UsedSalesControlTab.tsx`, `UsedItemFormModal.tsx`, `UsedItemDetailsModal.tsx`.
- **Funcionalidades**:
  - Controle de compra, recondicionamento e venda de equipamentos usados.
  - Catálogo de itens disponíveis e fluxo de precificação de insumos gastos na reforma dos equipamentos.

---

## 4. Lógicas de Negócio Críticas Desenvolvidas

### 4.1. Algoritmo de Unificação/Mesclagem de Clientes Duplicados
Criado um script independente (`merge-duplicates.cjs`) para expurgar a duplicidade de clientes inseridos incorretamente na base de dados:
1. **Identificação**: Agrupa clientes que possuam o mesmo CPF/CNPJ, E-mail (ignora case) ou Nome (ignora espaços extras e case).
2. **Definição de Registro Pai (Principal)**: O registro com maior quantidade de dados preenchidos é eleito o principal.
3. **Mesclagem de Dados**: Dados não preenchidos no principal que existam no duplicado são importados (como endereços, telefones e coordenadas).
4. **Migração de Dependências (Segurança)**: Antes de remover o registro duplicado, o script localiza todas as chaves estrangeiras vinculadas àquele cliente em tabelas secundárias (`service_orders`, `customer_products`, `contacts`, `contact_schedules`, `route_stops`) e as atualiza para o ID do cliente Principal. Isso impede a deleção em cascata (cascade delete) de históricos valiosos.
5. **Exclusão**: Remove os IDs duplicados do banco.

---

## 5. Histórico Recente de Modificações e Melhorias

1. **Recurso de Download de Anexos**:
   - Inclusão do botão de baixar foto na grade de thumbnails e na janela do visualizador ampliado (lightbox) nos componentes `WorkshopOrderView` e `TechnicianOSView`.
2. **Restruturação de Cancelamento**:
   - Exclusão do botão "Cancelar Ordem de Serviço" da aba Detalhes de OS. Transferência e limitação da ação de cancelamento apenas para a aba PDV (Faturamento).
3. **Upgrade no Importador**:
   - Inclusão de suporte nativo para ler arquivos binários de Excel (`.xls`, `.xlsx`).
   - Integração com ViaCEP para autocomplementar endereços.
   - Desvio seguro do campo `segment` (inexistente no banco) para ser guardado dinamicamente dentro do campo de observações (`notes`), evitando erros de cache de schema.
4. **Refatoração dos Filtros de CRM**:
   - Inclusão de selects de filtragem dinâmica por Cidades e por Segmentos cadastrados na base de clientes.
5. **Limpeza da Base**:
   - Execução da rotina de higienização de dados que unificou 6 grupos de clientes duplicados e migrou com sucesso todas as ordens de serviço e históricos antigos associados a eles.

---
*Este memorial serve como documentação de desenvolvimento de software e especificação técnica para o time de tecnologia da Refrimaq Connect.*
