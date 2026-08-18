/**
 * ═══════════════════════════════════════════════════════════════════
 *  COLA ELEITORAL DINÂMICA 2026 — app.js
 *  Stack: Vanilla JS puro, sem dependências além do html2canvas
 * ═══════════════════════════════════════════════════════════════════
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────
//  CONFIGURAÇÃO DOS CARGOS NA ORDEM DA URNA ELETRÔNICA
// ─────────────────────────────────────────────────────────────────────

const CARGOS = [
  {
    key: 'DEP_FEDERAL',
    label: 'Deputado Federal',
    dsCargo: 'DEPUTADO FEDERAL',
    icon: '🏛️',
    digitos: 4,
    descricao: 'Representa o estado no Congresso Nacional (4 anos)',
    usaUF: true,
  },
  {
    key: 'DEP_ESTADUAL',
    label: 'Deputado Estadual',
    dsCargo: 'DEPUTADO ESTADUAL',
    icon: '🏢',
    digitos: 5,
    descricao: 'Representa o povo na Assembleia Legislativa (4 anos)',
    usaUF: true,
  },
  {
    key: 'SENADOR_1',
    label: 'Senador — 1ª Vaga',
    dsCargo: 'SENADOR',
    icon: '⚖️',
    digitos: 3,
    descricao: 'Senador Federal — 1ª vaga disputada nesta eleição',
    usaUF: true,
  },
  {
    key: 'SENADOR_2',
    label: 'Senador — 2ª Vaga',
    dsCargo: 'SENADOR',
    icon: '⚖️',
    digitos: 3,
    descricao: 'Senador Federal — 2ª vaga disputada nesta eleição',
    usaUF: true,
  },
  {
    key: 'GOVERNADOR',
    label: 'Governador',
    dsCargo: 'GOVERNADOR',
    icon: '🗺️',
    digitos: 2,
    descricao: 'Chefe do Poder Executivo Estadual (4 anos)',
    usaUF: true,
  },
  {
    key: 'PRESIDENTE',
    label: 'Presidente',
    dsCargo: 'PRESIDENTE',
    icon: '🇧🇷',
    digitos: 2,
    descricao: 'Presidente da República — candidatos de âmbito nacional',
    usaUF: false,
  },
];

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO',
  'MA','MT','MS','MG','PA','PB','PR','PE','PI',
  'RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

const BATCH_SIZE  = 40;  // Quantos candidatos renderizar por vez no scroll
const DEBOUNCE_MS = 180; // Delay para busca rápida

// ─────────────────────────────────────────────────────────────────────
//  ESTADO DA APLICAÇÃO
// ─────────────────────────────────────────────────────────────────────

const state = {
  candidatos:       [],
  uf:               null,
  escolhas:         Object.fromEntries(CARGOS.map(c => [c.key, null])),
  accordionAberto:  null,
  cargoAtivo:       null,
  carregado:        false,
  // Controle de paginação no scroll por cargo
  listaFiltrada:    {}, // key -> Array de candidatos
  limiteRender:     {}, // key -> Quantidade atualmente renderizada
};

// ─────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────

const $  = id => document.getElementById(id);
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function norm(str = '') {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function mostrarTela(nome) {
  ['welcome', 'selection', 'cola'].forEach(t => {
    const el = $(`screen-${t}`);
    if (el) el.classList.toggle('active', t === nome);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─────────────────────────────────────────────────────────────────────
//  INICIALIZAÇÃO & CARREGAMENTO DE DADOS
// ─────────────────────────────────────────────────────────────────────

async function init() {
  mostrarLoadingOverlay(true);
  renderUFGrid();
  bindWelcomeEvents();

  try {
    const res = await fetch('candidatos.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.candidatos = Array.isArray(data) ? data : [];
    state.carregado  = true;
    console.info(`[TSE] ${state.candidatos.length.toLocaleString()} candidatos carregados.`);
  } catch (err) {
    console.error('[ERRO] Falha ao carregar candidatos.json:', err);
    mostrarErro(
      'Não foi possível carregar o arquivo candidatos.json. ' +
      'Se você abriu o arquivo direto pelo navegador (file://), execute o servidor local (iniciar_servidor.bat).'
    );
  } finally {
    mostrarLoadingOverlay(false);
  }
}

function mostrarLoadingOverlay(visivel) {
  let el = $('loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.style.cssText = `
      position: fixed; inset: 0; z-index: 9999; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 16px;
      background: #0d1b2a;
    `;
    el.innerHTML = `
      <div style="width: 44px; height: 44px; border: 3px solid rgba(16,185,129,0.15);
        border-top-color: #10b981; border-radius: 50%; animation: spin 0.8s linear infinite"></div>
      <div style="text-align: center">
        <p style="color: #ffffff; font-weight: 600; font-size: 14px; margin: 0">Carregando candidatos...</p>
        <p style="color: rgba(255,255,255,0.4); font-size: 11px; margin-top: 4px">Base oficial TSE 2026</p>
      </div>
    `;
    document.body.appendChild(el);
  }
  el.style.display = visivel ? 'flex' : 'none';
}

function mostrarErro(msg) {
  const el = document.createElement('div');
  el.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: #7f1d1d; color: #fecaca; font-size: 13px; padding: 14px 22px;
    border-radius: 12px; z-index: 9999; border: 1px solid rgba(252,165,165,0.3);
    box-shadow: 0 8px 30px rgba(0,0,0,0.5); max-width: 90vw; text-align: center;
    line-height: 1.5;
  `;
  el.innerHTML = `<strong>⚠️ Atenção:</strong> ${msg}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 10000);
}

// ─────────────────────────────────────────────────────────────────────
//  TELA 1 — SELEÇÃO DE UF
// ─────────────────────────────────────────────────────────────────────

function renderUFGrid(filtro = '') {
  const grid  = $('uf-grid');
  if (!grid) return;
  const termo = norm(filtro);
  const lista = termo ? UFS.filter(u => norm(u).includes(termo)) : UFS;

  if (!lista.length) {
    grid.innerHTML = `<p class="col-span-6 text-center py-4 text-xs" style="color:rgba(255,255,255,0.3)">Nenhum estado encontrado</p>`;
    return;
  }

  grid.innerHTML = lista.map(uf => `
    <button
      class="uf-btn rounded-lg py-2.5 text-xs font-bold tracking-wide ${state.uf === uf ? 'selected' : ''}"
      data-uf="${uf}"
      aria-pressed="${state.uf === uf}"
    >${uf}</button>
  `).join('');

  grid.querySelectorAll('.uf-btn').forEach(btn => {
    on(btn, 'click', () => selecionarUF(btn.dataset.uf));
  });
}

function selecionarUF(uf) {
  state.uf = uf;
  renderUFGrid($('uf-search')?.value || '');
  const btn = $('btn-continuar');
  if (btn) btn.disabled = false;
}

function bindWelcomeEvents() {
  on($('uf-search'),     'input', e => renderUFGrid(e.target.value));
  on($('btn-continuar'), 'click', irParaSelecao);
  on($('btn-trocar-uf'), 'click', resetarApp);
}

function irParaSelecao() {
  if (!state.uf) return;
  if (!state.carregado) {
    mostrarErro('Aguarde o carregamento dos candidatos antes de continuar.');
    return;
  }
  atualizarHeaderUF();
  atualizarProgresso();
  state.cargoAtivo = CARGOS[0].key;
  renderCargoChips();
  renderCargoPanel(state.cargoAtivo);
  bindSelecaoEvents();
  mostrarTela('selection');
}

// ─────────────────────────────────────────────────────────────────────
//  TELA 2 — ACCORDION DE CARGOS
// ─────────────────────────────────────────────────────────────────────

function renderAccordion() {
  const container = $('cargos-accordion');
  if (!container) return;

  container.innerHTML = CARGOS.map((cargo, i) => `
    <div id="card-${cargo.key}" class="cargo-card rounded-xl overflow-hidden fade-up"
         style="animation-delay:${i * 0.05}s">

      <!-- Cabeçalho do Accordion -->
      <button
        class="accordion-toggle w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/5 transition-colors cursor-pointer"
        data-key="${cargo.key}"
        aria-expanded="false"
      >
        <span class="text-xl flex-shrink-0" aria-hidden="true">${cargo.icon}</span>

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-semibold text-white">${cargo.label}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded font-mono tracking-wide"
                  style="background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.4)">
              ${cargo.digitos} dígitos
            </span>
          </div>
          <div id="status-${cargo.key}" class="text-xs mt-0.5 truncate" style="color:rgba(255,255,255,0.35)">
            Nenhum candidato selecionado
          </div>
        </div>

        <!-- Badge de Seleção Confirmada -->
        <span id="badge-ok-${cargo.key}"
              class="hidden w-5 h-5 rounded-full items-center justify-center flex-shrink-0"
              style="background:#10b981">
          <svg class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
          </svg>
        </span>

        <!-- Chevron Animado -->
        <svg id="chevron-${cargo.key}"
             class="w-4 h-4 flex-shrink-0 transition-transform duration-300"
             style="color:rgba(255,255,255,0.3)"
             fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7"/>
        </svg>
      </button>

      <!-- Corpo do Accordion -->
      <div class="accordion-body" id="body-${cargo.key}">
        <div class="px-4 pb-4 pt-2" style="border-top: 1px solid rgba(255,255,255,0.07)">

          <div class="flex items-center justify-between gap-2 mb-2.5">
            <p class="text-[11px]" style="color:rgba(255,255,255,0.35)">${cargo.descricao}</p>
            <span id="count-${cargo.key}" class="text-[10px] font-mono text-emerald-400/70 whitespace-nowrap"></span>
          </div>

          <!-- Campo de Busca Rápida -->
          <div class="relative mb-3">
            <input
              id="search-${cargo.key}"
              type="text"
              placeholder="Buscar por nome de urna, número ou partido..."
              class="search-input w-full rounded-xl px-4 py-2.5 text-sm pl-9"
              autocomplete="off"
              spellcheck="false"
            />
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                 style="color:rgba(255,255,255,0.3)" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803a7.5 7.5 0 0 0 10.607 0Z"/>
            </svg>
          </div>

          <!-- Container de Lista com Scroll Funcional -->
          <div
            id="list-${cargo.key}"
            class="candidate-list rounded-xl"
            style="border: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.15)"
          ></div>

        </div>
      </div>

    </div>
  `).join('');
}

function bindSelecaoEvents() {
  // Delegação de clique nos chips de cargo
  const chipsEl = $('cargo-chips');
  if (chipsEl) {
    const novoChips = chipsEl.cloneNode(true);
    chipsEl.parentNode.replaceChild(novoChips, chipsEl);
    on(novoChips, 'click', e => {
      const btn = e.target.closest('.cargo-chip');
      if (btn) ativarCargo(btn.dataset.key);
    });
  }

  // Botão gerar cola
  const btnGerar = $('btn-gerar-cola');
  if (btnGerar) {
    const novo = btnGerar.cloneNode(true);
    btnGerar.parentNode.replaceChild(novo, btnGerar);
    on(novo, 'click', gerarCola);
  }
}

function toggleAccordion(key) {
  const estaAberto = state.accordionAberto === key;

  // Fechar todos
  CARGOS.forEach(c => {
    $(`body-${c.key}`)?.classList.remove('open');
    const ch = $(`chevron-${c.key}`);
    if (ch) ch.style.transform = '';
  });

  if (!estaAberto) {
    state.accordionAberto = key;
    $(`body-${key}`)?.classList.add('open');
    const ch = $(`chevron-${key}`);
    if (ch) ch.style.transform = 'rotate(180deg)';

    // Popular lista do cargo ao abrir
    pesquisarCandidatos(key, $(`search-${key}`)?.value ?? '');
  } else {
    state.accordionAberto = null;
  }
}

// ─────────────────────────────────────────────────────────────────────
//  BUSCA & FILTRAGEM DE CANDIDATOS
// ─────────────────────────────────────────────────────────────────────

function getCandidatosDoCargo(key) {
  const cargo = CARGOS.find(c => c.key === key);
  if (!cargo) return [];

  // Excluir senador já escolhido na outra vaga
  const excluirId = key === 'SENADOR_1' ? state.escolhas['SENADOR_2']?.id
                  : key === 'SENADOR_2' ? state.escolhas['SENADOR_1']?.id
                  : null;

  return state.candidatos.filter(c => {
    if (c.cargo !== cargo.dsCargo) return false;
    if (excluirId && c.id === excluirId) return false;
    return cargo.usaUF ? c.uf === state.uf : c.uf === 'NACIONAL';
  });
}

function pesquisarCandidatos(key, query) {
  const todos = getCandidatosDoCargo(key);
  const q     = norm(query);

  const filtrados = q
    ? todos.filter(c =>
        norm(c.nomeUrna).includes(q) ||
        norm(c.numero).includes(q) ||
        norm(c.partido).includes(q) ||
        norm(c.nomeCompleto).includes(q)
      )
    : todos;

  state.listaFiltrada[key] = filtrados;
  state.limiteRender[key]  = BATCH_SIZE;

  renderLista(key);
}

function carregarMaisCandidatos(key) {
  const lista = state.listaFiltrada[key] || [];
  const atual = state.limiteRender[key] || BATCH_SIZE;

  if (atual >= lista.length) return; // Todos já renderizados

  state.limiteRender[key] = Math.min(atual + BATCH_SIZE, lista.length);
  renderLista(key, true); // true = preserva posição do scroll
}

function renderLista(key, manterScroll = false) {
  const el = key === state.cargoAtivo ? $('list-cargo-ativo') : $(`list-${key}`);
  if (!el) return;

  const lista = state.listaFiltrada[key] || [];
  const limite = state.limiteRender[key] || BATCH_SIZE;
  const countEl = key === state.cargoAtivo ? $('count-cargo-ativo') : $(`count-${key}`);

  // Atualizar indicador de contagem
  if (countEl) {
    if (lista.length === 0) {
      countEl.textContent = '0 encontrados';
    } else if (lista.length <= limite) {
      countEl.textContent = `${lista.length} candidato${lista.length > 1 ? 's' : ''}`;
    } else {
      countEl.textContent = `Mostrando ${limite} de ${lista.length}`;
    }
  }

  // Lista vazia
  if (lista.length === 0) {
    el.innerHTML = `
      <div class="py-8 text-center" style="color:rgba(255,255,255,0.3)">
        <div class="text-2xl mb-2">🔍</div>
        <p class="text-xs">Nenhum candidato encontrado</p>
        <p class="text-[10px] text-white/20 mt-1">Tente buscar por outro nome ou número</p>
      </div>`;
    return;
  }

  const scrollAnterior = el.scrollTop;
  const selId = state.escolhas[key]?.id;
  const visiveis = lista.slice(0, limite);

  const itemsHtml = visiveis.map(c => {
    const sel = c.id === selId;
    const fotoSrc = c.foto || '';
    const iniciais = (c.nomeUrna || '?').slice(0, 2).toUpperCase();

    return `
      <button
        class="candidate-item w-full flex items-center gap-3 px-3.5 py-2.5 text-left ${sel ? 'is-selected' : ''} cursor-pointer"
        data-id="${c.id}"
        data-key="${key}"
        aria-selected="${sel}"
      >
        <!-- Foto / Avatar Oficial TSE -->
        <div class="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-white/10 flex items-center justify-center border border-white/15 relative">
          ${fotoSrc ? `<img src="${fotoSrc}" alt="${c.nomeUrna}" class="w-full h-full object-cover" onerror="this.style.display='none';this.nextElementSibling.classList.remove('hidden');" loading="lazy">` : ''}
          <div class="w-full h-full ${fotoSrc ? 'hidden' : 'flex'} items-center justify-center text-[11px] font-bold text-white/60 bg-emerald-950/60">
            ${iniciais}
          </div>
        </div>

        <!-- Número com destaque -->
        <div class="flex-shrink-0 min-w-[52px] rounded-lg px-2 py-1.5 text-center"
             style="background:${sel ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.07)'}">
          <span class="font-mono font-bold text-sm" style="color:${sel ? '#34d399' : '#ffffff'}">
            ${c.numero}
          </span>
        </div>

        <!-- Dados do Candidato -->
        <div class="flex-1 min-w-0">
          <div class="text-sm font-semibold truncate" style="color:${sel ? '#6ee7b7' : '#e2eaf3'}">
            ${c.nomeUrna}
          </div>
          <div class="text-[11px] mt-0.5 truncate" style="color:rgba(255,255,255,0.4)">
            <span class="font-medium text-white/60">${c.partido}</span>
            ${c.nomePartido ? `<span class="text-white/30"> — ${c.nomePartido}</span>` : ''}
          </div>
        </div>

        <!-- Ícone de Checkmark -->
        ${sel ? `
          <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="#10b981" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
          </svg>` : ''}
      </button>`;
  }).join('');

  // Mensagem de rodapé da lista
  let footerHtml = '';
  if (limite < lista.length) {
    const restantes = lista.length - limite;
    footerHtml = `
      <div class="py-2.5 px-3 text-center border-t border-white/5 bg-white/[0.02]">
        <button
          type="button"
          class="btn-carregar-mais text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer py-1 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20"
          data-key="${key}"
        >
          ⬇ Role para baixo ou clique para ver mais (+${Math.min(restantes, BATCH_SIZE)})
        </button>
      </div>`;
  } else if (lista.length > 10) {
    footerHtml = `
      <div class="py-2 text-center text-[10px] text-white/20 border-t border-white/5">
        ✓ Todos os ${lista.length} candidatos listados
      </div>`;
  }

  el.innerHTML = itemsHtml + footerHtml;

  if (manterScroll) {
    el.scrollTop = scrollAnterior;
  }

  // Bind de clique nos itens de candidato
  el.querySelectorAll('.candidate-item').forEach(btn => {
    on(btn, 'click', () => {
      const cand = state.candidatos.find(c => c.id === Number(btn.dataset.id));
      if (cand) selecionarCandidato(btn.dataset.key, cand);
    });
  });

  // Bind no botão de carregar mais
  el.querySelectorAll('.btn-carregar-mais').forEach(btn => {
    on(btn, 'click', (e) => {
      e.stopPropagation();
      carregarMaisCandidatos(btn.dataset.key);
    });
  });
}

function selecionarCandidato(key, candidato) {
  // Toggle: clicar no selecionado desmarca
  state.escolhas[key] = state.escolhas[key]?.id === candidato.id ? null : candidato;

  atualizarStatusCargo(key);
  renderLista(key, true);
  atualizarProgresso();
  atualizarAvisoCola();

  // Atualizar o card do candidato escolhido no painel
  renderCargoChips();
  renderCargoPanel(key);
  pesquisarCandidatos(key, $('search-cargo-ativo')?.value ?? '');

  // Avançar automaticamente para o próximo cargo vazio após 400ms
  if (state.escolhas[key]) {
    const idxAtual = CARGOS.findIndex(c => c.key === key);
    const proximo = CARGOS.slice(idxAtual + 1).find(c => !state.escolhas[c.key])
                 || CARGOS.slice(0, idxAtual).find(c => !state.escolhas[c.key]);
    if (proximo) {
      setTimeout(() => ativarCargo(proximo.key), 400);
    }
  }
}

function atualizarStatusCargo(key) {
  const escolha  = state.escolhas[key];
  const statusEl = $(`status-${key}`);
  const badgeOk  = $(`badge-ok-${key}`);
  const card     = $(`card-${key}`);
  if (!statusEl) return;

  if (escolha) {
    statusEl.innerHTML = `
      <span style="color:#34d399;font-weight:600">${escolha.nomeUrna}</span>
      <span style="color:rgba(52,211,153,0.6);font-family:monospace"> #${escolha.numero} (${escolha.partido})</span>
    `;
    badgeOk?.classList.remove('hidden');
    badgeOk?.classList.add('flex');
    card?.classList.add('done');
  } else {
    statusEl.textContent = 'Nenhum candidato selecionado';
    statusEl.style.color = 'rgba(255,255,255,0.35)';
    badgeOk?.classList.add('hidden');
    badgeOk?.classList.remove('flex');
    card?.classList.remove('done');
  }
}

// ─────────────────────────────────────────────────────────────────────
//  UI HELPERS & PROGRESSO
// ─────────────────────────────────────────────────────────────────────

function atualizarHeaderUF() {
  const badge = $('header-uf-badge');
  const area  = $('header-uf-area');
  if (badge) badge.textContent = state.uf;
  area?.classList.remove('hidden');
  area?.classList.add('flex');
}

function atualizarProgresso() {
  const feitos = Object.values(state.escolhas).filter(Boolean).length;
  const pct = Math.round((feitos / CARGOS.length) * 100);
  const bar = $('progress-bar');
  if (bar) bar.style.width = `${pct}%`;

  if ($('cargo-chips') && typeof renderCargoChips === 'function') renderCargoChips();
}

function atualizarAvisoCola() {
  const aviso  = $('aviso-cola');
  if (!aviso) return;
  const feitos = Object.values(state.escolhas).filter(Boolean).length;

  if (feitos === 0) {
    aviso.textContent = 'Selecione ao menos um candidato para gerar a cola';
    aviso.style.color = 'rgba(255,255,255,0.3)';
  } else if (feitos < CARGOS.length) {
    aviso.textContent = `${feitos} de ${CARGOS.length} cargos preenchidos · faltam ${CARGOS.length - feitos}`;
    aviso.style.color = 'rgba(251,191,36,0.8)';
  } else {
    aviso.textContent = '✅ Todos os 6 cargos preenchidos!';
    aviso.style.color = 'rgba(52,211,153,0.9)';
  }
}

// ─────────────────────────────────────────────────────────────────────
//  TELA 3 — A COLA FINAL (ALTO CONTRASTE & NÍTIDO)
// ─────────────────────────────────────────────────────────────────────

function renderCargoChips() {
  const el = $('cargo-chips');
  if (!el) return;
  el.innerHTML = CARGOS.map(c => {
    const ativo  = state.cargoAtivo === c.key;
    const feito  = !!state.escolhas[c.key];
    return `<button
      class="cargo-chip${ativo ? ' active' : ''}${feito ? ' done' : ''}"
      data-key="${c.key}"
    >${c.icon} ${c.label}</button>`;
  }).join('');

  // scroll para o chip ativo
  const activeChip = el.querySelector('.cargo-chip.active');
  if (activeChip) activeChip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

function ativarCargo(key) {
  state.cargoAtivo = key;
  renderCargoChips();
  renderCargoPanel(key);
  pesquisarCandidatos(key, '');
  // bind scroll na nova lista
  const listEl = $('list-cargo-ativo');
  if (listEl) {
    on(listEl, 'scroll', () => {
      if (listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 90) {
        carregarMaisCandidatos(key);
      }
    });
  }
}

function renderCargoPanel(key) {
  const panel = $('cargo-panel');
  if (!panel) return;
  const cargo = CARGOS.find(c => c.key === key);
  if (!cargo) return;

  const escolha = state.escolhas[key];
  const proxIdx = CARGOS.findIndex(c => c.key === key) + 1;
  const proximo = CARGOS[proxIdx];

  // Card do candidato escolhido
  let chosenHtml = '';
  if (escolha) {
    const fotoSrc = escolha.foto || '';
    const iniciais = (escolha.nomeUrna || '?').slice(0, 2).toUpperCase();
    chosenHtml = `
      <div class="chosen-card">
        <div class="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-white/10 flex items-center justify-center border border-emerald-500/30">
          ${fotoSrc ? `<img src="${fotoSrc}" class="w-full h-full object-cover" onerror="this.style.display='none'" loading="lazy">` : ''}
          <div class="w-full h-full ${fotoSrc ? 'hidden' : 'flex'} items-center justify-center text-[11px] font-bold text-white/60 bg-emerald-950/60">${iniciais}</div>
        </div>
        <div class="chosen-card-info">
          <div class="chosen-card-name">${escolha.nomeUrna}</div>
          <div class="chosen-card-meta">${escolha.partido}${escolha.nomePartido ? ' — ' + escolha.nomePartido : ''}</div>
        </div>
        <div class="chosen-card-num">${escolha.numero}</div>
        <button class="btn-desmarcar" id="btn-desmarcar-${key}" title="Desmarcar candidato">✕</button>
      </div>`;
  }

  panel.innerHTML = `
    <div>
      <div class="flex items-center gap-3 mb-4">
        <span class="text-2xl flex-shrink-0">${cargo.icon}</span>
        <div>
          <div class="text-base font-bold text-white">${cargo.label}
            <span class="text-[11px] font-normal ml-1.5" style="color:rgba(255,255,255,0.35)">${cargo.digitos} dígitos</span>
          </div>
          <div class="text-xs mt-0.5" style="color:rgba(255,255,255,0.4)">${cargo.descricao}</div>
        </div>
      </div>

      ${chosenHtml}

      <div class="flex items-center justify-between gap-2 mb-2">
        <div class="relative flex-1">
          <input
            id="search-cargo-ativo"
            type="text"
            placeholder="Buscar por nome, número ou partido..."
            class="search-input w-full rounded-xl px-4 py-2.5 text-sm pl-9"
            autocomplete="off" spellcheck="false"
          />
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
               style="color:rgba(255,255,255,0.3)" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803a7.5 7.5 0 0 0 10.607 0Z"/>
          </svg>
        </div>
        <span id="count-cargo-ativo" class="text-[10px] font-mono text-emerald-400/70 whitespace-nowrap"></span>
      </div>

      <div
        id="list-cargo-ativo"
        class="candidate-list rounded-xl"
        style="border: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.15); max-height: 420px"
      ></div>

      ${proximo ? `<button class="btn-proximo-cargo" id="btn-proximo-cargo">Próximo: ${proximo.icon} ${proximo.label} →</button>` : ''}
    </div>`;

  // Bind no campo de busca
  const searchEl = $('search-cargo-ativo');
  if (searchEl) {
    const debouncedSearch = debounce(q => pesquisarCandidatos(key, q), DEBOUNCE_MS);
    on(searchEl, 'input', e => debouncedSearch(e.target.value));
  }

  // Bind scroll na lista
  const listEl = $('list-cargo-ativo');
  if (listEl) {
    on(listEl, 'scroll', () => {
      if (listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 90) {
        carregarMaisCandidatos(key);
      }
    });
  }

  // Bind botão desmarcar
  const btnDesmarcar = $(`btn-desmarcar-${key}`);
  if (btnDesmarcar) {
    on(btnDesmarcar, 'click', () => {
      state.escolhas[key] = null;
      atualizarProgresso();
      atualizarAvisoCola();
      renderCargoChips();
      renderCargoPanel(key);
      pesquisarCandidatos(key, '');
    });
  }

  // Bind botão próximo cargo
  const btnProx = $('btn-proximo-cargo');
  if (btnProx && proximo) {
    on(btnProx, 'click', () => ativarCargo(proximo.key));
  }
}

function gerarCola() {
  const temEscolha = Object.values(state.escolhas).some(Boolean);
  if (!temEscolha) {
    mostrarErro('Selecione ao menos um candidato antes de gerar a cola.');
    return;
  }
  renderCola();
  bindColaEvents();
  mostrarTela('cola');
}

function setTemaCola(tema) {
  state.temaCola = tema;
  const area = $('area-cola');
  if (!area) return;

  area.classList.remove('theme-papel', 'theme-dark');
  if (tema === 'papel') area.classList.add('theme-papel');
  if (tema === 'dark')  area.classList.add('theme-dark');

  document.querySelectorAll('.theme-select-btn').forEach(btn => {
    const active = btn.dataset.theme === tema;
    btn.classList.toggle('active', active);
    btn.classList.toggle('bg-white/15', active);
    btn.classList.toggle('text-white', active);
    btn.classList.toggle('shadow-sm', active);
    if (!active) {
      btn.classList.add('text-white/60');
    } else {
      btn.classList.remove('text-white/60');
    }
  });
}

function renderCola() {
  const estadoEl = $('cola-estado');
  if (estadoEl) estadoEl.textContent = state.uf;

  const container = $('cola-items');
  if (!container) return;

  const escolhidos = CARGOS.filter(c => state.escolhas[c.key]);

  container.innerHTML = escolhidos.map((cargo, i) => {
    const c        = state.escolhas[cargo.key];
    const isUltimo = i === escolhidos.length - 1;
    const fotoSrc  = c.foto || '';

    // Renderizar cada dígito como <table> real — única forma confiável no html2canvas
    const digitosHtml = String(c.numero || '')
      .split('')
      .map(d => `<table class="cola-digit-box"><tbody><tr><td>${d}</td></tr></tbody></table>`)
      .join('');

    return `
      <div style="padding: 10px 0">

        <!-- Label do cargo — barra colorida + texto simples, sem emoji, sem caixa -->
        <div style="display:flex; align-items:center; gap:7px; margin-bottom:8px">
          <div class="cola-cargo-accent"></div>
          <span class="cola-cargo-label">${cargo.label.toUpperCase()}</span>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; gap: 14px">

          <!-- Foto + Informações -->
          <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0">
            ${fotoSrc ? `
              <img
                class="cola-foto-cand"
                src="${fotoSrc}"
                alt="${c.nomeUrna}"
                style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:1.5px solid #059669;flex-shrink:0;background:#e2e8f0;display:block"
                onerror="this.style.display='none'"
              />` : ''}
            <div style="flex: 1; min-width: 0">
              <div class="cola-candidate-name">${c.nomeUrna}</div>
              <div class="cola-party">
                <strong style="color:currentColor">${c.partido}</strong>${c.nomePartido ? ' — ' + c.nomePartido : ''}
              </div>
            </div>
          </div>

          <!-- Dígitos -->
          <div class="cola-digits-wrapper flex-shrink-0">
            ${digitosHtml}
          </div>

        </div>
      </div>
      ${!isUltimo ? '<hr class="cola-divider">' : ''}`;
  }).join('');
}

function bindColaEvents() {
  // Theme switcher buttons
  ['branco', 'papel', 'dark'].forEach(tema => {
    const btn = $(`theme-btn-${tema}`);
    if (btn) {
      const novo = btn.cloneNode(true);
      btn.parentNode.replaceChild(novo, btn);
      on(novo, 'click', () => setTemaCola(tema));
    }
  });

  // Ações
  ['btn-editar', 'btn-baixar', 'btn-nova-cola'].forEach(id => {
    const el = $(id);
    if (!el) return;
    const novo = el.cloneNode(true);
    el.parentNode.replaceChild(novo, el);
  });

  on($('btn-editar'),    'click', () => mostrarTela('selection'));
  on($('btn-baixar'),    'click', baixarImagem);
  on($('btn-nova-cola'), 'click', resetarApp);
}

// ─────────────────────────────────────────────────────────────────────
//  DOWNLOAD DA IMAGEM (html2canvas com Blindagem de Scroll & Transform)
// ─────────────────────────────────────────────────────────────────────

async function baixarImagem() {
  const btn   = $('btn-baixar');
  const label = $('label-baixar');
  const icon  = $('icon-download');

  if (btn)   btn.disabled = true;
  if (icon)  icon.classList.add('spin-icon');
  if (label) label.textContent = 'Gerando imagem em alta resolução…';

  try {
    const target = $('area-cola');
    if (!target) throw new Error('Elemento #area-cola não encontrado');

    const tema = state.temaCola || 'branco';
    let bg = '#ffffff';
    if (tema === 'papel') bg = '#fdfbf2';
    if (tema === 'dark')  bg = '#0d1b2a';

    // Captura à prova de bugs de scroll e transform do navegador
    const canvas = await html2canvas(target, {
      scale:           2,
      useCORS:         true,
      allowTaint:      true,
      backgroundColor: bg,
      scrollX:         0,
      scrollY:         0,
      logging:         false,
      imageTimeout:    6000,
      onclone: (clonedDoc) => {
        const clonedCola = clonedDoc.getElementById('area-cola');
        if (clonedCola) {
          clonedCola.style.transform = 'none';
          clonedCola.style.animation = 'none';
          clonedCola.style.transition = 'none';
          clonedCola.style.opacity = '1';
          clonedCola.style.boxShadow = 'none';
        }
        clonedDoc.querySelectorAll('.fade-up, .fade-in').forEach(el => {
          el.style.transform = 'none';
          el.style.animation = 'none';
          el.style.opacity = '1';
        });

        const tema = state.temaCola || 'branco';
        let digitBg, digitColor, digitBorder;
        if (tema === 'papel')  { digitBg = '#f7f1de'; digitColor = '#1a130b'; digitBorder = '#3b2e1e'; }
        else if (tema === 'dark') { digitBg = '#064e3b'; digitColor = '#34d399'; digitBorder = '#34d399'; }
        else                   { digitBg = '#f8fafc'; digitColor = '#0f172a'; digitBorder = '#0f172a'; }

        // ── 1. Substituir fotos de candidatos por canvas com crop circular correto
        //       (html2canvas não suporta object-fit:cover, causando imagens esticadas)
        clonedDoc.querySelectorAll('.cola-foto-cand').forEach(img => {
          if (!img.complete || !img.naturalWidth) return;
          const S = 88; // canvas 2× (44px display)
          const cvs = clonedDoc.createElement('canvas');
          cvs.width  = S;
          cvs.height = S;
          cvs.style.cssText = [
            'width:44px', 'height:44px',
            'border-radius:50%',
            'display:block',
            'flex-shrink:0',
            `border:1.5px solid #059669`,
          ].join(';');
          const ctx = cvs.getContext('2d');
          // Clip circular
          ctx.beginPath();
          ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
          ctx.clip();
          // Desenhar com cover (manter proporção, cortar nas bordas)
          const iw = img.naturalWidth, ih = img.naturalHeight;
          const scale = Math.max(S / iw, S / ih);
          const dx = (S - iw * scale) / 2;
          const dy = (S - ih * scale) / 2;
          ctx.drawImage(img, dx, dy, iw * scale, ih * scale);
          img.parentNode.replaceChild(cvs, img);
        });

        // ── 2. Substituir cada caixa de dígito por canvas desenhado na mão
        clonedDoc.querySelectorAll('table.cola-digit-box').forEach(tbl => {
          const digit = (tbl.querySelector('td') || tbl).textContent.trim();
          const W = 60, H = 84; // 2× para alta resolução

          const cvs = clonedDoc.createElement('canvas');
          cvs.width  = W;
          cvs.height = H;
          cvs.style.cssText = [
            'width:30px', 'height:42px',
            `border:2.5px solid ${digitBorder}`,
            'border-radius:8px',
            'display:inline-block',
            'vertical-align:middle',
            'margin:0 2px',
            'box-sizing:border-box',
          ].join(';');

          const ctx = cvs.getContext('2d');
          ctx.fillStyle = digitBg;
          ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = digitColor;
          ctx.font = '900 40px Inter, ui-sans-serif, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          const m = ctx.measureText(digit);
          const textH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
          const y = H / 2 + m.actualBoundingBoxAscent - textH / 2;
          ctx.fillText(digit, W / 2, y);

          tbl.parentNode.replaceChild(cvs, tbl);
        });
      },
    });

    const link    = document.createElement('a');
    link.download = `cola-eleitoral-2026-${state.uf || 'brasil'}-${tema}.png`;
    link.href     = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    console.error('Erro html2canvas:', err);
    mostrarErro('Não foi possível gerar a imagem automaticamente. Você pode tirar um print da tela.');
  } finally {
    if (btn)   btn.disabled = false;
    if (icon)  icon.classList.remove('spin-icon');
    if (label) label.textContent = 'Baixar Imagem da Cola (.png)';
  }
}

// ─────────────────────────────────────────────────────────────────────
//  RESET COMPLETO DO APP
// ─────────────────────────────────────────────────────────────────────

function resetarApp() {
  state.uf              = null;
  state.escolhas        = Object.fromEntries(CARGOS.map(c => [c.key, null]));
  state.accordionAberto = null;
  state.listaFiltrada   = {};
  state.limiteRender    = {};

  $('header-uf-area')?.classList.add('hidden');
  $('header-uf-area')?.classList.remove('flex');
  const bar = $('progress-bar');
  if (bar) bar.style.width = '0%';
  const btn = $('btn-continuar');
  if (btn) btn.disabled = true;
  const search = $('uf-search');
  if (search) search.value = '';

  renderUFGrid();
  atualizarAvisoCola();
  mostrarTela('welcome');
}

// ─────────────────────────────────────────────────────────────────────
//  PONTO DE ENTRADA
// ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
