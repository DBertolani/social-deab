// --- CONTROLE DE VERSÃO E CACHE (MODO SEGURO) ---
const VERSAO_SISTEMA = "2026-01-20_v5"; 
const STORAGE_KEY_PRODUTOS = "produtos_cache";


// --- NOVO MODO DE SEGURANÇA MÁXIMA ---
function podeUsarStorage() {
    try {
        // Verifica se a propriedade existe e se não é bloqueada
        if (typeof localStorage === 'undefined' || localStorage === null) return false;
        localStorage.setItem('teste_storage', '1');
        localStorage.removeItem('teste_storage');
        return true;
    } catch (e) {
        // Se cair aqui, o Tracking Prevention bloqueou
        console.warn("Acesso ao Storage bloqueado pelo navegador.");
        return false;
    }
}

// Substitua seu bloco de limpeza de cache por este (SAFE + sem erro de sintaxe):
try {
  if (podeUsarStorage()) {
    const versaoAtual = lsGetRaw("versao_cache"); // usa helper safe
    if (versaoAtual !== VERSAO_SISTEMA) {
      // limpa só o que é do seu app
      lsRemove("carrinho");
      lsRemove(STORAGE_KEY_PRODUTOS);
      lsRemove("loja_config");
      lsRemove("frete_cache");
      lsRemove("sessao_cliente");

      lsSetRaw("versao_cache", VERSAO_SISTEMA); // usa helper safe
    }
  }
} catch (e) {}



//----

// --- STORAGE SAFE HELPERS (blindagem total p/ Edge Tracking Prevention) ---
function lsGetRaw(key) {
  try {
    if (!podeUsarStorage()) return null;
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function lsSetRaw(key, val) {
  try {
    if (!podeUsarStorage()) return false;
    localStorage.setItem(key, val);
    return true;
  } catch (e) {
    return false;
  }
}

function lsRemove(key) {
  try {
    if (!podeUsarStorage()) return;
    localStorage.removeItem(key);
  } catch (e) {}
}

function lsGetJSON(key, fallback) {
  const raw = lsGetRaw(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function lsSetJSON(key, obj) {
  try {
    return lsSetRaw(key, JSON.stringify(obj));
  } catch (e) {
    return false;
  }
}



// Variável global para guardar as configurações da planilha
var CONFIG_LOJA = {};
var dadosClienteTemp = {};

function S(v) {
    if (v === null || v === undefined) return "";
    return String(v).trim();
}

function moneyToFloat(v) {
    if (v === null || v === undefined) return 0;

    let s = String(v).trim();
    if (!s) return 0;

    // remove espaços e "R$"
    s = s.replace(/\s/g, "").replace(/^R\$\s*/i, "");

    // mantém só dígitos, vírgula, ponto e sinal
    s = s.replace(/[^\d.,-]/g, "");

    const hasComma = s.includes(",");
    const hasDot = s.includes(".");

    if (hasComma && hasDot) {
        // Decide o separador decimal pelo ÚLTIMO que aparece
        if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
            // 1.234,56 -> 1234.56
            s = s.replace(/\./g, "").replace(",", ".");
        } else {
            // 1,234.56 -> 1234.56
            s = s.replace(/,/g, "");
        }
    } else if (hasComma && !hasDot) {
        // 32,44 -> 32.44
        s = s.replace(",", ".");
    } else if (hasDot) {
        // Se tiver mais de um ponto, trata os anteriores como milhar
        // 1.234.56 -> 1234.56
        const parts = s.split(".");
        if (parts.length > 2) {
            const dec = parts.pop();
            s = parts.join("") + "." + dec;
        }
    }

    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
}

// --- BUSCA INTELIGENTE (Nome + Categoria + Descrição) ---
var ALL_PRODUTOS = [];

function normalizarTexto(s) {
    return String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // remove acentos
        .trim();
}

function filtrarProdutos() {
    const termo = normalizarTexto(obterTermoBusca());

if (!Array.isArray(ALL_PRODUTOS) || ALL_PRODUTOS.length === 0) {
    ALL_PRODUTOS = lsGetJSON(STORAGE_KEY_PRODUTOS, []);
}

    const filtrados = ALL_PRODUTOS.filter(p => {
        const nome = normalizarTexto(p.Produto);
        const cat = normalizarTexto(p.Categoria);
        const desc = normalizarTexto(p.Descrição);

        // ✅ filtro por atributos (se tiver algum marcado)
        const attrs = extrairAtributosDeProduto(p);
        const passaAtributos =
            (FILTROS_ATRIB.size === 0) ||
            Array.from(FILTROS_ATRIB).every(f => attrs.includes(f));

        // ✅ filtro por texto (se termo estiver vazio, passa)
        const passaTexto =
            !termo || nome.includes(termo) || cat.includes(termo) || desc.includes(termo);

        return passaAtributos && passaTexto;
    });

    mostrar_produtos(filtrados);
}


function obterTermoBusca() {
    const desk = document.getElementById('txt_search')?.value || "";
    const mob = document.getElementById('txt_search_mobile')?.value || "";
    // prioridade: se o mobile estiver visível e preenchido, usa ele
    return (mob.trim() ? mob : desk);
}

function sincronizarBuscaEntreCampos() {
    const deskEl = document.getElementById('txt_search');
    const mobEl = document.getElementById('txt_search_mobile');
    if (!deskEl || !mobEl) return;

    // quando digitar em um, reflete no outro
    deskEl.addEventListener('input', () => {
        if (mobEl.value !== deskEl.value) mobEl.value = deskEl.value;
    });
    mobEl.addEventListener('input', () => {
        if (deskEl.value !== mobEl.value) deskEl.value = mobEl.value;
    });

}



// --- 0. MÁSCARA DE CEP ---
function mascaraCep(t) {
    let v = t.value.replace(/\D/g, "");
    if (v.length > 5) v = v.substring(0, 5) + "-" + v.substring(5, 8);
    t.value = v;
}

// --- 1. CONFIGURAÇÕES INICIAIS (AJUSTE CIRÚRGICO AQUI) ---
function carregar_config() {
    var url = CONFIG.SCRIPT_URL + "?rota=config&nocache=" + new Date().getTime();

// Tenta carregar do Cache APENAS se o storage estiver liberado (modo seguro)
if (podeUsarStorage()) {
    var configCache = lsGetJSON('loja_config', null);
    if (configCache) {
        CONFIG_LOJA = configCache;
        aplicar_config();
    }
}


    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data.erro) return;
            var config = {};
            if (Array.isArray(data)) {
                data.forEach(l => { if (l.Chave && l.Valor) config[l.Chave] = l.Valor; });
            } else { config = data; }

            // Salva no cache apenas se permitido
if (podeUsarStorage()) {
    lsSetJSON("loja_config", config);
}

            
            CONFIG_LOJA = config;
            aplicar_config();
            carregar_produtos();
        })
            .catch(e => {
            console.log("Erro ao carregar config, chamando produtos assim mesmo:", e);
            carregar_produtos(); // CHAMADA DE EMERGÊNCIA: Garante que os produtos carreguem mesmo se a config falhar
        });
}

// --- ACESSIBILIDADE: calcula cor de texto (preto/branco) com bom contraste ---
function hexToRgb(hex) {
  if (!hex) return null;
  let h = String(hex).trim();

  // aceita "0d6efd" ou "#0d6efd"
  if (!h.startsWith("#")) h = "#" + h;

  // suporta #RGB
  if (h.length === 4) {
    h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(h)) return null;

  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return { r, g, b };
}

function luminanciaRelativa({ r, g, b }) {
  // WCAG relative luminance
  const srgb = [r, g, b].map(v => v / 255).map(v =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function escolherTextoContraste(bgHex) {
  const rgb = hexToRgb(bgHex);
  if (!rgb) return "#FFFFFF"; // fallback
  const L = luminanciaRelativa(rgb);

  // contraste com branco e preto (WCAG)
  const contrasteBranco = (1.05) / (L + 0.05);
  const contrastePreto  = (L + 0.05) / (0.05);

  return (contrastePreto >= contrasteBranco) ? "#000000" : "#FFFFFF";
}

function escurecerHex(bgHex, fator = 0.15) {
  const rgb = hexToRgb(bgHex);
  if (!rgb) return bgHex;
  const clamp = (n) => Math.max(0, Math.min(255, n));
  const r = clamp(Math.round(rgb.r * (1 - fator)));
  const g = clamp(Math.round(rgb.g * (1 - fator)));
  const b = clamp(Math.round(rgb.b * (1 - fator)));
  return "#" + [r,g,b].map(v => v.toString(16).padStart(2,"0")).join("");
}

function aplicarTemaAcessivel(corPrincipal) {
  if (!corPrincipal) return;

  const texto = escolherTextoContraste(corPrincipal);
  const hover = escurecerHex(corPrincipal, 0.12);

  document.documentElement.style.setProperty("--cor-principal", corPrincipal);
  document.documentElement.style.setProperty("--cor-principal-texto", texto);
  document.documentElement.style.setProperty("--cor-principal-hover", hover);

  // Navbar: alterna automaticamente navbar-dark/light
  const nav = document.querySelector("nav.navbar");
  if (nav) {
    nav.style.backgroundColor = "var(--cor-principal)";
    nav.classList.remove("bg-primary"); // evita conflito com bootstrap
    nav.classList.toggle("navbar-dark", texto === "#FFFFFF");
    nav.classList.toggle("navbar-light", texto === "#000000");
  }
}


function aplicar_config() {
    // --- 0. Função Auxiliar de Conversão Robusta ---
    const obterLinkDiretoDrive = (url) => {
        if (!url || typeof url !== 'string' || url.trim() === "") return "";
        if (!url.includes('drive.google.com')) return url;
        
        // Extrai o ID do arquivo (funciona com link de compartilhamento, view, preview ou uc)
        const regex = /\/d\/([^\/]+)|id=([^\&]+)/;
        const match = url.match(regex);
        const id = match ? (match[1] || match[2]) : null;
        
        // Retorna o link de visualização direta (Thumbnail de alta qualidade)
        // Isso resolve o problema da logo parar de aparecer
        return id ? `https://drive.google.com/thumbnail?authuser=0&sz=w800&id=${id}` : url;
    };

 
    // 1. Cor Principal (com contraste automático)
    if (CONFIG_LOJA.CorPrincipal) {
        aplicarTemaAcessivel(CONFIG_LOJA.CorPrincipal);
    }


    // 2. Títulos e SEO
    var titulo = CONFIG_LOJA.TituloAba || CONFIG_LOJA.NomeDoSite;
    if (titulo) {
        document.title = titulo;
        var seoTitle = document.getElementById('seo_titulo');
        if (seoTitle) seoTitle.innerText = titulo;
    }

    if (CONFIG_LOJA.DescricaoSEO) {
        var metaDesc = document.getElementById('seo_descricao');
        if (metaDesc) metaDesc.setAttribute("content", CONFIG_LOJA.DescricaoSEO);
    }

    // 3. Logo do Site (Restaurado e Melhorado)
    var logo = document.getElementById('logo_site');
    if (logo) {
        if (CONFIG_LOJA.LogoDoSite && CONFIG_LOJA.LogoDoSite.trim() !== "") {
            var src = obterLinkDiretoDrive(CONFIG_LOJA.LogoDoSite);
            logo.innerHTML = `<img src="${src}" alt="${CONFIG_LOJA.NomeDoSite}" style="max-height:40px; margin-right:10px; width: auto; display: inline-block;">`;
        } else if (CONFIG_LOJA.NomeDoSite) { 
            logo.innerText = CONFIG_LOJA.NomeDoSite; 
        }
    }

    // 4. Favicon Dinâmico
    if (CONFIG_LOJA.Favicon) {
        let link = document.querySelector("link[rel*='icon']") || document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
        link.href = obterLinkDiretoDrive(CONFIG_LOJA.Favicon);
        document.getElementsByTagName('head')[0].appendChild(link);
    }

// 5. Botão de WhatsApp Flutuante (Esquerda e Protegido contra erros)
    // Primeiro, verificamos se o botão já existe na tela
    const btnExistente = document.getElementById('wa_flutuante');

    if (CONFIG_LOJA.WhatsappFlutuante === "Sim" && CONFIG_LOJA.NumeroWhatsapp) {
        // Se a config é SIM e o botão ainda NÃO existe, nós criamos ele
        if (!btnExistente) {
            const waBtn = document.createElement('a');
            waBtn.id = 'wa_flutuante';
            
            const foneRaw = String(CONFIG_LOJA.NumeroWhatsapp || "");
            const foneLimpo = foneRaw.replace(/\D/g, '');
            
            waBtn.href = `https://wa.me/${foneLimpo}`;
            waBtn.target = "_blank";
            waBtn.innerHTML = '<i class="bi bi-whatsapp"></i>';
            
            waBtn.style.cssText = `
                position: fixed;
                width: 50px;
                height: 50px;
                bottom: 20px;
                left: 20px;
                background-color: #25d366;
                color: #FFF;
                border-radius: 50px;
                text-align: center;
                font-size: 26px;
                box-shadow: 0px 4px 10px rgba(0,0,0,0.2);
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                text-decoration: none;
            `;
            
            document.body.appendChild(waBtn);
        }
    } else {
        // ✅ ESTA É A PARTE NOVA:
        // Se na planilha estiver "Não", ou se o número estiver vazio,
        // e o botão existir na tela, nós removemos ele.
        if (btnExistente) {
            btnExistente.remove();
        }
    }
} // Fechamento da função aplicar_config

// --- 2. MENU E CATEGORIAS ---
function carregar_categorias(produtos) {
    const menu = document.getElementById('categoria_menu');
    if (!menu) return;
    menu.innerHTML = `<li><a class="dropdown-item fw-bold" href="#" onclick="limpar_filtros(); fechar_menu_mobile()">Ver Todos</a></li>`;
    menu.innerHTML += `<li><hr class="dropdown-divider"></li>`;

    if (CONFIG_LOJA.MostrarCategorias === "FALSE") return;

    const categorias = [...new Set(produtos.map(p => p.Categoria))].filter(c => c);
    if (categorias.length > 0) {
        categorias.forEach(cat => {
            var li = document.createElement('li');
            li.innerHTML = `<a class="dropdown-item" href="#" onclick="mostrar_produtos_por_categoria('${cat}'); fechar_menu_mobile()">${cat}</a>`;
            menu.appendChild(li);
        });
    }
}

function mostrar_produtos_por_categoria(cat) {
    var dados = (ALL_PRODUTOS && ALL_PRODUTOS.length)
        ? ALL_PRODUTOS
       : (lsGetJSON(STORAGE_KEY_PRODUTOS, []));

    var filtrados = dados.filter(p => p.Categoria === cat);
    mostrar_produtos(filtrados);
}

function fechar_menu_mobile() {
    var navMain = document.getElementById("navbarCollapse");
    if (navMain.classList.contains('show')) {
        document.querySelector('.navbar-toggler').click();
    }
}

var FILTROS_ATRIB = new Set();

function extrairAtributosDeProduto(p) {
    const raw = String(p?.Atributos || "").trim();
    if (!raw) return [];
    return raw.split(",").map(s => normalizarTexto(s)).filter(Boolean);
}

function renderizarFiltrosAtributos(produtos) {
    const hostDesk = document.getElementById("filtros_atributos");
    const hostMob = document.getElementById("filtros_atributos_mobile");

    const todos = new Set();
    (produtos || []).forEach(p => {
        extrairAtributosDeProduto(p).forEach(a => todos.add(a));
    });

    const lista = Array.from(todos).sort();

    const html = (lista.length === 0) ? "" : `
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <span class="small text-muted me-2">Filtrar:</span>
        ${lista.map(a => {
        const id = "attr_" + a.replace(/\W+/g, "_");
        const ativo = FILTROS_ATRIB.has(a) ? "checked" : "";
        return `
              <input type="checkbox" class="btn-check" id="${id}" ${ativo} onchange="toggleAtributoFiltro('${a}'); atualizarBadgeFiltros();">
              <label class="btn btn-outline-secondary btn-sm" for="${id}">${a}</label>
            `;
    }).join("")}
        <button class="btn btn-outline-secondary btn-sm ms-2" onclick="limparFiltrosAtributos(); atualizarBadgeFiltros();">Limpar</button>
      </div>
    `;

    if (hostDesk) hostDesk.innerHTML = html;
    if (hostMob) hostMob.innerHTML = html;

    atualizarBadgeFiltros();
}


function toggleAtributoFiltro(a) {
    if (FILTROS_ATRIB.has(a)) FILTROS_ATRIB.delete(a);
    else FILTROS_ATRIB.add(a);
    filtrarProdutos(); // reaproveita sua busca + lista atual
}

function limparFiltrosAtributos() {
    FILTROS_ATRIB.clear();
    renderizarFiltrosAtributos(ALL_PRODUTOS);
    filtrarProdutos();
}

function atualizarBadgeFiltros() {
    const badge = document.getElementById("badgeFiltros");
    if (!badge) return;

    const n = FILTROS_ATRIB.size || 0;
    badge.classList.toggle("d-none", n === 0);
    badge.innerText = String(n);
}



// --- 3. PRODUTOS E LOADING ---
function carregar_produtos() {
    // 1. Tenta pegar o cache SOMENTE se puder usar storage
    let cache = [];
    if (podeUsarStorage()) {
        cache = lsGetJSON(STORAGE_KEY_PRODUTOS, []);
    }
    
    if (cache && cache.length > 0) {
        ALL_PRODUTOS = cache;
        carregar_categorias(cache);
        renderizarFiltrosAtributos(cache);
        mostrar_produtos(cache);
        mostrar_skeleton(false);
    } else {
        // Se não tem cache ou storage bloqueado, mostra o loading e vai pra rede
        mostrar_skeleton(true);
    }

    var url = CONFIG.SCRIPT_URL + "?rota=produtos&nocache=" + new Date().getTime();
    
    fetch(url)
        .then(r => r.json())
        .then(data => {
            mostrar_skeleton(false);
            if (Array.isArray(data) && data.length > 0) {
                // Tenta salvar no cache, mas se falhar não trava o site
                if (podeUsarStorage()) {
                    lsSetJSON(STORAGE_KEY_PRODUTOS, data);
                }
                ALL_PRODUTOS = data;
                carregar_categorias(data);
                renderizarFiltrosAtributos(data);
                mostrar_produtos(data);
            }
        })
        .catch(err => {
            mostrar_skeleton(false);
            console.error("Erro na Planilha:", err);
            // Se der erro de rede, tenta mostrar o que tem na memória pelo menos
            if(ALL_PRODUTOS.length > 0) mostrar_produtos(ALL_PRODUTOS);
        });
}

function getColMobileClass() {
  const n = parseInt(CONFIG_LOJA.ColunasMobile, 10);

  // 1 coluna no mobile
  if (n === 1) return "col-12";

  // 2 colunas no mobile (padrão bootstrap)
  if (n === 2) return "col-6";

  // 3 colunas no mobile (opcional)
  if (n === 3) return "col-4";

  // fallback seguro
  return "col-6";
}

function mostrar_skeleton(exibir) {
    const container = document.getElementById('loading_skeleton_container');
    const boxes = document.getElementById('loading_skeleton_boxes');
    if (!container) return;

    var colClass = 'col-md-3';
    if (CONFIG_LOJA.ColunasDesktop == 3) colClass = 'col-md-4';

    if (exibir) {
        boxes.innerHTML = '';
        for (let i = 0; i < 4; i++) {
            boxes.innerHTML += `
            <div class="${colClass} ${getColMobileClass()}">
                <div class="card shadow-sm h-100 border-0">
                    <div class="card-img-top bg-secondary" style="height: 150px; opacity:0.1; animation: pulse 1.5s infinite;"></div>
                    <div class="card-body">
                        <h5 class="card-title placeholder-glow"><span class="placeholder col-6"></span></h5>
                    </div>
                </div>
            </div>`;
        }
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
}

function ajustarImagemDrive(url, widthPx) {
  if (!url || typeof url !== "string") return url;
  if (!url.includes("drive.google.com")) return url;

  // pega ID
  const regex = /\/d\/([^\/]+)|id=([^\&]+)/;
  const match = url.match(regex);
  const id = match ? (match[1] || match[2]) : null;
  if (!id) return url;

  const w = Math.max(120, Math.min(Number(widthPx) || 400, 1600));
  return `https://drive.google.com/thumbnail?authuser=0&sz=w${w}&id=${id}`;
}


function mostrar_produtos(produtos) {
    const container = document.getElementById('div_produtos');
    container.innerHTML = '';

    if (produtos.length === 0) {
        container.innerHTML = '<div class="col-12 text-center mt-5"><p class="text-muted">Nenhum produto encontrado.</p><button class="btn btn-outline-secondary" onclick="limpar_filtros()">Ver Todos</button></div>';
        return;
    }

    var colClass = 'col-md-3';
    if (CONFIG_LOJA.ColunasDesktop == 3) colClass = 'col-md-4';
    if (CONFIG_LOJA.ColunasDesktop == 2) colClass = 'col-md-6';

    produtos.forEach(p => {
        var altText = p.Produto + " - " + p.Categoria;
        var infoExtra = (p.Tamanhos || p.Variacoes) ? `<small>Opções disponíveis</small>` : '';
        const imgCard = ajustarImagemDrive(p.ImagemPrincipal, 500);
        const item = document.createElement('div');
        const colMobile = getColMobileClass();
        item.className = `${colClass} ${colMobile} mt-4`;


        item.innerHTML = `
      <div class="card shadow-sm h-100">
          <div style="height: 250px; display: flex; align-items: center; justify-content: center; background: #fff;">
             <img 
                  src="${imgCard}" 
                  alt="${altText}" 
                  loading="lazy"
                  decoding="async"
                  width="600"
                  height="600"
                  style="max-height: 100%; max-width: 100%; object-fit: contain; padding: 10px;"
                />

          </div>
          <div class="card-body d-flex flex-column">
              <p class="card-text">
                  <strong>${p.Produto}</strong><br/>
                  <span class="text-primary fw-bold" style="font-size: 1.2rem;">R$ ${moneyToFloat(p.Preço).toFixed(2)}</span><br/>
                  <small class="text-muted">${p.Categoria}</small><br/>
                  ${infoExtra}
              </p>
              <div class="mt-auto btn-group w-100">
                  <button class="btn btn-primary w-100" onclick="abrir_modal_ver('${p.ID}')">Ver Detalhes</button>
              </div>
          </div>
      </div>`;
        container.appendChild(item);
    });
}


function limpar_filtros() {
    const desk = document.getElementById('txt_search');
    const mob = document.getElementById('txt_search_mobile');

    if (desk) desk.value = "";
    if (mob) mob.value = "";

    FILTROS_ATRIB.clear();
    renderizarFiltrosAtributos(ALL_PRODUTOS);

    if (!ALL_PRODUTOS || !ALL_PRODUTOS.length) {
        ALL_PRODUTOS = lsGetJSON(STORAGE_KEY_PRODUTOS, []);
    }
    mostrar_produtos(ALL_PRODUTOS);
}



// --- 4. MODAL DO PRODUTO (Ver + Simular Frete Individual) ---
var produtoAtual = null;
var variacaoSelecionada = null;

// ✅ Viewer (tela cheia) - estado
var VIEWER_IMGS = [];
var VIEWER_IDX = 0;

function abrirViewerImagens(lista, idxInicial, titulo) {
    VIEWER_IMGS = (lista || []).filter(s => String(s || "").trim().length > 4);
    VIEWER_IDX = Math.max(0, Math.min(idxInicial || 0, VIEWER_IMGS.length - 1));

    const t = document.getElementById('viewerTitulo');
    if (t) t.innerText = titulo || "Imagem";

    atualizarViewer();

    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalImagemViewer')).show();
}

function atualizarViewer() {
    const imgEl = document.getElementById('viewerImg');
    const contEl = document.getElementById('viewerContador');

    const total = VIEWER_IMGS.length;
    const src = VIEWER_IMGS[VIEWER_IDX] || "";

    if (imgEl) imgEl.src = src;
    if (contEl) contEl.innerText = total ? `Imagem ${VIEWER_IDX + 1} de ${total}` : "";
}

function viewerPrev() {
    if (!VIEWER_IMGS.length) return;
    VIEWER_IDX = (VIEWER_IDX - 1 + VIEWER_IMGS.length) % VIEWER_IMGS.length;
    atualizarViewer();
}

function viewerNext() {
    if (!VIEWER_IMGS.length) return;
    VIEWER_IDX = (VIEWER_IDX + 1) % VIEWER_IMGS.length;
    atualizarViewer();
}

// ✅ resumo da descrição (primeira frase / fallback por tamanho)
// ✅ Resumo Inteligente: Remove o HTML para a prévia não ficar bagunçada
function obterResumoDescricao(texto, maxChars) {
    // Remove tags HTML (<br>, <b>, <h2>) apenas para o resumo visual
    const textoPuro = String(texto || "").replace(/<[^>]*>?/gm, '').trim();
    
    if (!textoPuro) return "";

    const ponto = textoPuro.indexOf(".");
    let resumo = (ponto > 20) ? textoPuro.slice(0, ponto + 1) : textoPuro;

    const lim = maxChars || 160;
    if (resumo.length > lim) resumo = resumo.slice(0, lim).trim() + "…";

    return resumo;
}


function abrir_modal_ver(id) {
    var dados = (ALL_PRODUTOS && ALL_PRODUTOS.length)
        ? ALL_PRODUTOS
       : (lsGetJSON(STORAGE_KEY_PRODUTOS, []));
    produtoAtual = dados.find(p => String(p.ID) === String(id));
    if (!produtoAtual) {
        console.warn("Produto não encontrado para ID:", id, "IDs disponíveis:", dados.slice(0, 10).map(p => p.ID));
        return;
    }



    variacaoSelecionada = null;
    const alertVar = document.getElementById('alertVariacao');
    if (alertVar) alertVar.classList.add('d-none');
    const lista = document.getElementById('listaVariacoes');
    if (lista) lista.classList.remove('border', 'border-warning', 'rounded', 'p-2');


    document.getElementById('modalTituloProduto').innerText = produtoAtual.Produto;
    document.getElementById('modalPreco').innerText = 'R$ ' + parseFloat(produtoAtual.Preço).toFixed(2);
    const descCompleta = produtoAtual.Descrição || "";

    const resumoEl = document.getElementById('modalDescricaoResumo');
    const btnMais = document.getElementById('btnLerMaisDescricao');

    if (resumoEl) resumoEl.innerText = obterResumoDescricao(descCompleta, 160);

    const precisaMais = String(descCompleta || "").trim().length > (resumoEl?.innerText?.length || 0) + 5;
    if (btnMais) btnMais.classList.toggle('d-none', !precisaMais);

    // prepara modal de descrição completa
    const tit = document.getElementById('modalDescricaoTitulo');
    const full = document.getElementById('modalDescricaoCompletaTexto');

    if (tit) tit.innerText = produtoAtual.Produto || "Descrição";
    // ✅ CORREÇÃO: Usar innerHTML para interpretar o código da IA
    if (full) full.innerHTML = descCompleta;


    var containerImagens = document.getElementById('carouselImagensContainer');
    containerImagens.innerHTML = '';

    var imgs = [produtoAtual.ImagemPrincipal];
    if (produtoAtual.ImagensExtras) {
        imgs = imgs.concat(produtoAtual.ImagensExtras.split(',').map(s => s.trim()));
    }

// 1) monta lista final limpa
const imgsLimpa = imgs
    .map(s => String(s || "").trim())
    .filter(s => s.length > 4);

// lista para o viewer (imagem maior, mas otimizada)
const imgsViewer = imgsLimpa.map(s => ajustarImagemDrive(s, 1600));


    // 2) renderiza com a lista final (a mesma para todos)
imgsLimpa.forEach((src, idx) => {
  var div = document.createElement('div');
  const srcAjustado = ajustarImagemDrive(src, 1200);
  div.className = (idx === 0) ? 'carousel-item active' : 'carousel-item';

  div.innerHTML = `
    <img
      src="${srcAjustado}"
      class="d-block w-100"
      width="900"
      height="300"
      decoding="async"
      style="height: 300px; object-fit: contain; background: #f8f9fa; cursor: zoom-in;"
      onclick='abrirViewerImagens(${JSON.stringify(imgsViewer)}, ${idx}, "Galeria")'
    >
  `;

  containerImagens.appendChild(div);
});



    var divVar = document.getElementById('areaVariacoes');
    var listaVar = document.getElementById('listaVariacoes');
    divVar.style.display = 'none';
    listaVar.innerHTML = '';

    if (produtoAtual.Tamanhos && produtoAtual.Tamanhos.trim() !== "") {
        divVar.style.display = 'block';
        var tamanhos = produtoAtual.Tamanhos.split(',').map(t => t.trim());
        tamanhos.forEach(tam => {
            var idBtn = 'var_' + tam;
            listaVar.innerHTML += `
                <input type="radio" class="btn-check" name="variacao" id="${idBtn}" autocomplete="off" onchange="selecionar_variacao('${tam}')">
                <label class="btn btn-outline-secondary" for="${idBtn}">${tam}</label>
            `;
        });
    } else {
        variacaoSelecionada = "Único";
    }

    var divMedidas = document.getElementById('areaTabelaMedidas');
    if (produtoAtual.TamanhosImagens && produtoAtual.TamanhosImagens.trim() !== "") {
        divMedidas.style.display = 'block';
        document.getElementById('imgTabelaMedidas').src = ajustarImagemDrive(produtoAtual.TamanhosImagens, 1200);
        // ✅ Viewer da Tabela de Medidas
        const btnTab = document.getElementById('btnTabelaMedidas');
        const imgTab = document.getElementById('imgTabelaMedidas');

        if (btnTab && produtoAtual.TamanhosImagens) {
            // opcional: esconder preview inline
            if (imgTab) imgTab.classList.add('d-none');

            btnTab.onclick = function () {
                abrirViewerImagens([ajustarImagemDrive(produtoAtual.TamanhosImagens, 1600)], 0, 'Tabela de Medidas');
                return false;
            };
        }

    } else {
        divMedidas.style.display = 'none';
    }

    document.getElementById('btnAdicionarModal').onclick = function () {
        // NOVO: aviso bonito dentro do modal (sem alert)
        const alertVar = document.getElementById('alertVariacao');

        if (!variacaoSelecionada) {
            if (alertVar) {
                alertVar.classList.remove('d-none');

                // opcional: rolar até o aviso (ajuda no mobile)
                alertVar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                // opcional: destacar as opções
                const lista = document.getElementById('listaVariacoes');
                if (lista) lista.classList.add('border', 'border-warning', 'rounded', 'p-2');
            }
            return;
        }

        // se selecionou, esconde aviso e remove destaque
        if (alertVar) alertVar.classList.add('d-none');
        const lista = document.getElementById('listaVariacoes');
        if (lista) lista.classList.remove('border', 'border-warning', 'rounded', 'p-2');

        var nomeFinal = produtoAtual.Produto;
        var freteGratisUF = produtoAtual.FreteGratis || "";

        adicionar_carrinho(
            produtoAtual.ID + "_" + variacaoSelecionada,
            nomeFinal,
            produtoAtual.Preço,
            produtoAtual.ImagemPrincipal,
            freteGratisUF,
            variacaoSelecionada
        );

        bootstrap.Modal.getInstance(document.getElementById('modalProduto')).hide();
    };


    // Reseta simulador individual
    document.getElementById('resultadoFreteIndividual').innerHTML = "";
    document.getElementById('inputSimulaCepIndividual').value = "";
    document.getElementById('btnSimularFreteIndividual').onclick = function () {
        simular_frete_produto_individual(produtoAtual);
    };

    new bootstrap.Modal(document.getElementById('modalProduto')).show();
}

function selecionar_variacao(valor) {
    variacaoSelecionada = valor;
}

function simular_frete_produto_individual(produto) {
    var cep = document.getElementById('inputSimulaCepIndividual').value.replace(/\D/g, '');
    if (cep.length !== 8) { alert("CEP inválido"); return; }

    var btn = document.getElementById('btnSimularFreteIndividual');
    var res = document.getElementById('resultadoFreteIndividual');

    btn.innerText = "...";
    btn.disabled = true;
    res.innerHTML = "Calculando...";

    var subsidio = parseFloat(CONFIG_LOJA.SubsidioFrete || 0);

    var dadosFrete = {
        op: "calcular_frete",
        cep: cep,
        peso: produto.Peso || 0.9,
        comprimento: produto.Comprimento || 20,
        altura: produto.Altura || 15,
        largura: produto.Largura || 20
    };

    fetch(CONFIG.SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(dadosFrete)
    })
        .then(r => r.json())
        .then(data => {
            btn.innerText = "OK";
            btn.disabled = false;

            if (data.erro) {
                res.innerHTML = `<span class="text-danger">${data.erro}</span>`;
                return;
            }

            fetch(`https://viacep.com.br/ws/${cep}/json/`)
                .then(rv => rv.json())
                .then(cepData => {

                    // ✅ NOVO: trata CEP inválido e pega cidade/UF
                    if (cepData.erro) {
                        res.innerHTML = `<span class="text-danger">CEP não encontrado.</span>`;
                        return;
                    }

                    var ufDestino = cepData.uf || "";
                    var cidade = cepData.localidade || "";

                    // ✅ NOVO: mostra destino antes da lista
                    var cabecalhoDestino = (cidade || ufDestino)
                        ? `<div class="mb-1"><strong>Destino:</strong> ${cidade}${cidade && ufDestino ? "/" : ""}${ufDestino}</div>`
                        : "";

                    // ✅ ALTERADO: antes era só "<ul..."
                    var html = cabecalhoDestino + '<ul class="list-unstyled mt-2">';

                    var ehGratis = produto.FreteGratis && produto.FreteGratis.includes(ufDestino);

                    data.opcoes.forEach(op => {
                        var valor = moneyToFloat(op.valor);
                        var nome = op.nome.toUpperCase();
                        var isPac = nome.includes("PAC");
                        var displayVal = valor;
                        var tag = "";

                        if (ehGratis) {
                            if (isPac) {
                                displayVal = 0;
                                tag = '<span class="badge bg-success">Grátis</span>';
                            } else {
                                displayVal = Math.max(0, valor - subsidio);
                                tag = '<span class="badge bg-info text-dark">Desconto</span>';
                            }
                        } else {
                            displayVal = Math.max(0, valor - subsidio);
                            if (subsidio > 0) tag = '<span class="badge bg-info text-dark">Desconto</span>';
                        }

                        html += `<li><strong>${op.nome}</strong>: R$ ${displayVal.toFixed(2)} <small class="text-muted">(${op.prazo}d)</small> ${tag}</li>`;
                    });

                    html += '</ul>';
                    res.innerHTML = html;
                });

        })
        .catch(e => {
            console.error(e);
            btn.innerText = "OK";
            btn.disabled = false;
            res.innerHTML = "Erro ao calcular.";
        });
}


// --- 5. CARRINHO ---

var freteCalculado = 0;
var freteSelecionadoNome = "";
var enderecoEntregaTemp = {};

function adicionar_carrinho(id, prod, preco, img, freteGratisUF, variacao) {
var c = lsGetJSON('carrinho', []);
var existe = c.find(i => i.id === id);

if (existe) {
    existe.quantidade++;

    // ✅ BÔNUS (o que você perguntou): garante que o preço vira número
    if (!Number.isFinite(existe.preco)) {
        existe.preco = moneyToFloat(existe.preco);
    }
} else {
    c.push({
        id: id,
        producto: prod,

        // ✅ CRÍTICO: salva o preço já convertido (resolve vírgula "129,90")
        preco: moneyToFloat(preco),

        imagem: img,
        quantidade: 1,
        freteGratisUF: freteGratisUF,
        variacao: variacao
    });
}

lsSetJSON('carrinho', c);

    atualizar_carrinho();

    freteCalculado = 0;
    freteSelecionadoNome = "";
    limparFreteCache();
    document.getElementById('carrinho_opcoes_frete').innerHTML = "";
    bloquearCheckout(true);
}

function editar_item_carrinho(idComVariacao) {
    var c = lsGetJSON('carrinho', []);
    var item = c.find(i => i.id === idComVariacao);

    if (item) {
        var idProdutoOriginal = idComVariacao.split('_')[0];
        remover_carrinho(idComVariacao);
        bootstrap.Modal.getInstance(document.getElementById('modalCarrito')).hide();
        setTimeout(() => {
            abrir_modal_ver(idProdutoOriginal);
        }, 500);
    }
}

function mudar_quantidade(id, delta) {
   var c = lsGetJSON('carrinho', []);
    var item = c.find(i => i.id === id);
    if (item) {
        item.quantidade += delta;
        if (item.quantidade <= 0) {
            c.splice(c.findIndex(i => i.id === id), 1);
        }
        lsSetJSON('carrinho', c);
        atualizar_carrinho();
        bloquearCheckout(true);
        document.getElementById('carrinho_opcoes_frete').innerHTML = "Quantidade mudou. Recalcule o frete.";
        freteCalculado = 0;
        limparFreteCache();

    }
}

function remover_carrinho(id) {
   var c = lsGetJSON('carrinho', []);
    c.splice(c.findIndex(i => i.id === id), 1);
    lsSetJSON('carrinho', c);
    atualizar_carrinho();
    bloquearCheckout(true);
    freteCalculado = 0;
    limparFreteCache();
    document.getElementById('carrinho_opcoes_frete').innerHTML = "";
}

function atualizar_carrinho() {
    var c = lsGetJSON('carrinho', []);
    var div = document.getElementById('div_carrito');
    div.innerHTML = '';
    var subtotal = 0;

    if (c.length === 0) {
        div.innerHTML = '<p class="text-center text-muted">Seu carrinho está vazio.</p>';
        document.getElementById('total_carro_final').innerText = 'R$ 0.00';
        document.getElementById('valorTotal').innerText = 'R$ 0.00';
        return;
    }

    c.forEach(i => {
        var textoVariacao = (i.variacao && i.variacao !== 'Único')
            ? `<div class="badge bg-secondary mt-1">Opção: ${i.variacao}</div>`
            : '';

        var row = document.createElement('div');
        row.className = 'd-flex justify-content-between align-items-center mb-3 border-bottom pb-2';

        var btnEditar = (i.variacao && i.variacao !== 'Único')
            ? `<button class="btn btn-sm btn-outline-primary me-1" onclick="editar_item_carrinho('${i.id}')" title="Editar Opção"><i class="bi bi-pencil"></i></button>`
            : '';

        row.innerHTML = `
        <div class="d-flex align-items-center" style="width: 45%;">
            <img 
              src="${i.imagem}" 
              width="50" 
              height="50"
              loading="lazy"
              decoding="async"
              style="width:50px; height:50px; object-fit:cover; margin-right:10px; border-radius:5px;"
            >

            <div>
                <div style="font-size:0.85rem; font-weight:bold; line-height: 1.2;">${i.producto}</div>
                ${textoVariacao}
                <div style="font-size:0.8rem; color:#666; margin-top:2px;">Unit: R$ ${moneyToFloat(i.preco).toFixed(2)}</div>
            </div>
        </div>
        
        <div class="d-flex align-items-center">
             <button class="btn btn-sm btn-outline-secondary px-2" onclick="mudar_quantidade('${i.id}', -1)">-</button>
             <span class="mx-2 font-weight-bold">${i.quantidade}</span>
             <button class="btn btn-sm btn-outline-secondary px-2" onclick="mudar_quantidade('${i.id}', 1)">+</button>
        </div>

        <div class="text-end d-flex flex-column align-items-end" style="width: 25%;">
             <div style="font-weight:bold; font-size: 0.9rem; margin-bottom: 5px;">R$ ${(moneyToFloat(i.preco) * (parseInt(i.quantidade,10)||1)).toFixed(2)}</div>
             <div>
                ${btnEditar}
                <button class="btn btn-sm btn-outline-danger" onclick="remover_carrinho('${i.id}')" title="Excluir Item">
                    <i class="bi bi-trash"></i> 
                </button>
             </div>
        </div>`;
        div.appendChild(row);
        subtotal += (moneyToFloat(i.preco) * (parseInt(i.quantidade, 10) || 1));
    });

    document.getElementById('resumo_subtotal').innerText = 'R$ ' + subtotal.toFixed(2);
    atualizarTotalFinal(subtotal);
}

function atualizarTotalFinal(subtotal) {
    var total = subtotal + freteCalculado;
    document.getElementById('resumo_frete').innerText = 'R$ ' + freteCalculado.toFixed(2);
    document.getElementById('total_carro_final').innerText = 'R$ ' + total.toFixed(2);

    var btnTotal = document.getElementById('valorTotal');
    if (btnTotal) btnTotal.innerText = 'R$ ' + total.toFixed(2);
}

// --- 6. FRETE NO CARRINHO ---

function buscarEnderecoSimples(cep) {
    cep = cep.replace(/\D/g, '');
    if (cep.length === 8) {
        fetch(`https://viacep.com.br/ws/${cep}/json/`)
            .then(r => r.json())
            .then(d => {
                if (!d.erro) {
                    document.getElementById('carrinho_endereco_resumo').innerText = `${d.localidade}/${d.uf}`;
                    enderecoEntregaTemp = d;
                }
            });
    }
}

async function calcularFreteCarrinho() {
    var cep = document.getElementById('carrinho_cep').value.replace(/\D/g, '');
    if (cep.length !== 8) { alert("CEP inválido"); return; }

    var carrinho = lsGetJSON('carrinho', []);
    if (carrinho.length === 0) return;

    var divOpcoes = document.getElementById('carrinho_opcoes_frete');
    divOpcoes.innerHTML = "Calculando...";
    bloquearCheckout(true);

    // ✅ garante UF SEM depender do blur
    let ufDestino = "";
    try {
        const rCep = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const dCep = await rCep.json();
        if (!dCep.erro) {
            ufDestino = dCep.uf || "";
            document.getElementById('carrinho_endereco_resumo').innerText = `${dCep.localidade}/${dCep.uf}`;
            enderecoEntregaTemp = dCep;
        }
    } catch (e) {
        console.warn("Falha ao buscar UF no ViaCEP", e);
    }

   var todosProdutos = lsGetJSON(STORAGE_KEY_PRODUTOS, []);
    var pesoTotal = 0;
    var volumeTotal = 0;

    carrinho.forEach(item => {
        var prodOriginal = todosProdutos.find(p => p.ID == item.id.split('_')[0]);
        if (prodOriginal) {
            pesoTotal += (parseFloat(prodOriginal.Peso || 0.9) * item.quantidade);
            volumeTotal += (parseFloat(prodOriginal.Altura || 15) * parseFloat(prodOriginal.Largura || 20) * parseFloat(prodOriginal.Comprimento || 20)) * item.quantidade;
        } else {
            pesoTotal += (0.9 * item.quantidade);
            volumeTotal += (6000 * item.quantidade);
        }
    });

    var aresta = Math.pow(volumeTotal, 1 / 3);
    var alturaFinal = Math.max(15, Math.ceil(aresta));
    var larguraFinal = Math.max(15, Math.ceil(aresta));
    var compFinal = Math.max(20, Math.ceil(aresta));

    var dadosFrete = {
        op: "calcular_frete",
        cep: cep,
        peso: pesoTotal.toFixed(2),
        comprimento: compFinal,
        altura: alturaFinal,
        largura: larguraFinal
    };

    const subsidio = moneyToFloat(CONFIG_LOJA.SubsidioFrete);



    fetch(CONFIG.SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(dadosFrete)
    })
        .then(r => r.json())
        .then(data => {
            if (data.erro) {
                divOpcoes.innerHTML = `<span class="text-danger">${data.erro}</span>`;
                return;
            }

            if (!data.opcoes) return;

            // ✅ frete grátis: se QUALQUER item tem aquele UF na lista
            const ehGratis = !!ufDestino && carrinho.some(item =>
                item.freteGratisUF && String(item.freteGratisUF).includes(ufDestino)
            );

            let html = '<div class="list-group">';
            let autoSelectEl = null;


            data.opcoes.forEach((op) => {
                let valorFinal = moneyToFloat(op.valor);
                const nomeServico = String(op.nome || "").toUpperCase();
                const isPac = nomeServico.includes("PAC") || nomeServico.includes("ECONÔMICO");
                let textoExtra = "";

                if (ehGratis) {
                    if (isPac) {
                        valorFinal = 0;
                        textoExtra = '<span class="badge bg-success ms-2">GRÁTIS</span>';

                    } else {
                        valorFinal = Math.max(0, valorFinal - subsidio);
                        textoExtra = '<span class="badge bg-info text-dark ms-2">Desconto Aplicado</span>';
                    }
                } else {
                    if (subsidio > 0) {
                        valorFinal = Math.max(0, valorFinal - subsidio);
                        textoExtra = '<span class="badge bg-info text-dark ms-2">Desconto Aplicado</span>';
                    }
                }

                const idRadio = `frete_${nomeServico.replace(/\W+/g, '_')}_${op.prazo}`;
                html += `
        <label class="list-group-item d-flex justify-content-between align-items-center" for="${idRadio}">
          <div>
            <input id="${idRadio}" class="form-check-input me-2" type="radio" name="freteRadio"
              value="${valorFinal}" data-nome="${op.nome}"
              onchange="selecionarFrete(this)">
            ${op.nome} (${op.prazo} dias)
            ${textoExtra}
          </div>
          <span class="fw-bold">R$ ${valorFinal.toFixed(2)}</span>
        </label>
      `;

                // auto-seleção: pega a 1ª opção e, se aparecer alguma grátis, ela vira preferida
                if (!autoSelectEl) autoSelectEl = { id: idRadio, valor: valorFinal, nome: op.nome };
                if (valorFinal === 0) autoSelectEl = { id: idRadio, valor: valorFinal, nome: op.nome };

            });

            divOpcoes.innerHTML = html;

            // ✅ tenta restaurar o frete salvo (mesmo CEP)
            const cacheFrete = lerFreteCache();
            let selecionou = false;

            if (cacheFrete && cacheFrete.cep === cep) {
                const radios = divOpcoes.querySelectorAll('input[name="freteRadio"]');
                radios.forEach(r => {
                    const nome = r.getAttribute('data-nome') || "";
                    const val = moneyToFloat(r.value);
                    if (!selecionou && nome === cacheFrete.nome && Math.abs(val - cacheFrete.valor) < 0.01) {
                        r.checked = true;
                        selecionarFrete(r);
                        selecionou = true;
                    }
                });
            }

            // se não encontrou cache, usa auto-seleção padrão
            if (!selecionou) {
                setTimeout(() => {
                    const el = document.getElementById(autoSelectEl?.id);
                    if (el) {
                        el.checked = true;
                        selecionarFrete(el);
                    }
                }, 0);
            }


        })
        .catch(err => {
            console.error(err);
            divOpcoes.innerHTML = `<span class="text-danger">Erro ao calcular frete.</span>`;
        });
}


function selecionarFrete(input) {
    freteCalculado = moneyToFloat(input.value);
    freteSelecionadoNome = input.getAttribute('data-nome');
    var c = lsGetJSON('carrinho', []);
    var subtotal = c.reduce((acc, i) => acc + (i.preco * i.quantidade), 0);
    atualizarTotalFinal(subtotal);
    bloquearCheckout(false);

    // ✅ salva frete escolhido para “lembrar”
    const cepAtual = document.getElementById('carrinho_cep')?.value?.replace(/\D/g, '') || '';
    salvarFreteCache(cepAtual, freteSelecionadoNome, freteCalculado);


}


function bloquearCheckout(bloquear) {
    var btn = document.getElementById('btn_pagar');
    var msg = document.getElementById('msg_falta_frete');
    if (btn) btn.disabled = bloquear;
    if (msg) msg.style.display = bloquear ? 'block' : 'none';
}

function salvarFreteCache(cep, nome, valor) {
    lsSetJSON("frete_cache", {
        cep: String(cep || "").replace(/\D/g, ""),
        nome: String(nome || ""),
        valor: Number(valor) || 0,
        ts: Date.now()
    });
}


function limparFreteCache() {
    lsRemove("frete_cache");
}

function lerFreteCache() {
    return lsGetJSON("frete_cache", null);
}



// --- 7. CHECKOUT FINAL ---

function irParaCheckout() {
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalCarrito')).hide();

    if (enderecoEntregaTemp.logradouro) {
        document.getElementById('checkout_rua').value = enderecoEntregaTemp.logradouro;
        document.getElementById('checkout_bairro').value = enderecoEntregaTemp.bairro;
        document.getElementById('checkout_cidade').value = enderecoEntregaTemp.localidade;
        document.getElementById('checkout_uf').value = enderecoEntregaTemp.estado || enderecoEntregaTemp.uf || "";

        setTimeout(() => document.getElementById('checkout_numero').focus(), 500);
    }

    new bootstrap.Modal(document.getElementById('modalCheckout')).show();
}



function iniciarPagamentoFinal(ev) {
    if (!validarCepCheckoutComFrete()) return;

    // ✅ pega nome/sobrenome do checkout (prioridade) e fallback para cache
    const nomeDigitado = (document.getElementById('checkout_nome')?.value || "").trim();
    const sobrenomeDigitado = (document.getElementById('checkout_sobrenome')?.value || "").trim();

    const nomeFinal = (nomeDigitado || (dadosClienteTemp.nome || "").trim());
    const sobrenomeFinal = (sobrenomeDigitado || (dadosClienteTemp.sobrenome || "").trim());

    if (!nomeFinal || !sobrenomeFinal) {
        alert("Informe Nome e Sobrenome do destinatário.");
        return;
    }

        var cliente = {
          nome: nomeFinal,
          sobrenome: sobrenomeFinal,
          cpf: (document.getElementById('checkout_cpf')?.value || "").trim(),
          telefone: (document.getElementById('checkout_telefone')?.value || "").trim(),
            
        // ✅ NOVO
          email: document.getElementById('checkout_email')?.value || (enderecoEntregaTemp.email || ""),
          cep: (document.getElementById('checkout_cep')?.value || "").trim(),
          rua: (document.getElementById('checkout_rua')?.value || "").trim(),
          numero: (document.getElementById('checkout_numero')?.value || "").trim(),
          bairro: (document.getElementById('checkout_bairro')?.value || "").trim(),
          cidade: (document.getElementById('checkout_cidade')?.value || "").trim(),
          uf: (document.getElementById('checkout_uf')?.value || "").trim(),
          complemento: (document.getElementById('checkout_complemento')?.value || "").trim(),
          // ✅ NOVO
          referencia: document.getElementById('checkout_referencia')?.value || ""
        };


    if (!cliente.cpf || !cliente.rua || !cliente.numero) {
        alert("Preencha CPF, Rua e Número.");
        return;
    }

    // ✅ sanitizadores para evitar NaN/#NUM!
    const safeQty = (q) => {
        const n = parseInt(q, 10);
        return Number.isFinite(n) && n > 0 ? n : 1;
    };

    const safePrice = (p) => {
        // aceita "129,90", "R$ 129,90", 129.90...
        const s = String(p ?? "").replace(/[^\d,.-]/g, "").replace(",", ".");
        const n = parseFloat(s);
        return Number.isFinite(n) && n >= 0 ? n : 0;
    };

    var btn = ev?.target;
    if (btn) {
        btn.innerText = "Abrindo resumo...";
        btn.disabled = true;
    }


    var carrinho = lsGetJSON('carrinho', []);
    var items = carrinho.map(i => {
        var tituloCompleto = i.producto;
        if (i.variacao && i.variacao !== "Único") tituloCompleto += " - " + i.variacao;

        return {
            title: tituloCompleto,
            quantity: safeQty(i.quantidade),
            currency_id: 'BRL',
            unit_price: safePrice(i.preco)
        };
    });

    if (freteCalculado > 0) {
        items.push({
            title: "Frete (" + (freteSelecionadoNome || "Serviço") + ")",
            quantity: 1,
            currency_id: 'BRL',
            unit_price: safePrice(freteCalculado)
        });
    }

    var logisticaInfo = {
        servico: freteSelecionadoNome || "N/I",
        peso: (carrinho.reduce((t, i) => t + (safeQty(i.quantidade) * 0.9), 0)).toFixed(2),
        dimensoes: "Calculado via Carrinho"
    };

        // ✅ NOVO: referência separada (não junta com complemento)
        cliente.referencia = (document.getElementById('checkout_referencia')?.value || "").trim();


    // ✅ guarda tudo para confirmar depois
    window.__pedidoPendente = { cliente, items, logisticaInfo, btn };

    // ✅ abre o modal de confirmação (sem pagar ainda)
    abrirConfirmacaoPedido(cliente, items, logisticaInfo);
    if (btn) {
        btn.innerText = "Ir para Pagamento";
        btn.disabled = false;
    }



}



// Monitora se o usuário está tentando mudar o CEP no meio do caminho
$(document).on('change', '#carrinho_cep', function () {
    // Se mudar o CEP, reseta o frete selecionado para forçar novo cálculo
    freteCalculado = 0;
    freteSelecionadoNome = "";
    limparFreteCache();
    document.getElementById('carrinho_opcoes_frete').innerHTML = '<span class="text-danger">CEP alterado. Recalcule o frete para continuar.</span>';
    bloquearCheckout(true);
});


// 2. Validação Definitiva (A "Vigia")
function validarCepsIdenticos() {
    var cepCarrinho = document.getElementById('carrinho_cep').value.replace(/\D/g, '');
    var cepCheckout = document.getElementById('checkout_cep').value.replace(/\D/g, '');

    // Se o checkout tiver um CEP e ele for diferente do carrinho
    if (cepCheckout !== "" && cepCheckout !== cepCarrinho) {
        $("#erro_cep_divergente").fadeIn();
        document.querySelector('#modalCheckout .btn-success').disabled = true;
    } else {
        $("#erro_cep_divergente").fadeOut();
        document.querySelector('#modalCheckout .btn-success').disabled = false;
    }
}

// 3. Função para recalcular o frete sem sair da tela (Upgrade)
function corrigirCepDivergente() {
    var novoCep = document.getElementById('checkout_cep').value;
    document.getElementById('carrinho_cep').value = novoCep;

    // Simula o clique de cálculo no carrinho (isso já está pronto no seu código)
    calcularFreteCarrinho();

    // Aguarda um pouco o cálculo e libera
    setTimeout(() => {
        validarCepsIdenticos();
        const box = document.getElementById("erro_cep_divergente");
        if (box) {
            box.style.display = "none"; // se CEPs ficaram iguais
        }
    }, 800);

}

// 4. Vigiar mudanças no campo de CEP do Checkout em tempo real
$(document).on('change', '#checkout_cep', function () {
    validarCepsIdenticos();
});


// --- NOVO FLUXO DE IDENTIFICAÇÃO (SEGURANÇA OTP) ---

function abrirIdentificacao() {
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalCarrito')).hide();

    // Reset visual para o estado inicial
    document.getElementById('passo_cpf').style.display = 'block';
    document.getElementById('passo_codigo').style.display = 'none';
    
    // Limpa campos
    document.getElementById('cpf_identificacao').value = '';
    document.getElementById('input_codigo_otp').value = '';
    
    // Remove qualquer resultado de sucesso anterior se houver
    const containerSucesso = document.getElementById('container_sucesso_identificacao');
    if (containerSucesso) containerSucesso.remove();
    
    // Mostra o corpo do modal novamente caso tenha sido ocultado
    document.querySelector('#modalIdentificacao .modal-body').style.display = 'block';

    // LGPD
    document.getElementById('check_lgpd').checked = false;
    document.getElementById('btn_buscar_identidade').disabled = true;

    new bootstrap.Modal(document.getElementById('modalIdentificacao')).show();
}

function iniciarIdentificacaoSegura() {
    if (!document.getElementById('check_lgpd').checked) {
        alert("Para continuar, autorize o uso dos dados (LGPD).");
        return;
    }

    var cpf = document.getElementById('cpf_identificacao').value.replace(/\D/g, '');
    if (cpf.length !== 11) { alert("CPF inválido"); return; }

    var btn = document.getElementById('btn_buscar_identidade');
    var txtOriginal = btn.innerText;
    btn.innerText = "Verificando...";
    btn.disabled = true;

    fetch(CONFIG.SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ op: "solicitar_codigo", cpf: cpf })
    })
    .then(r => r.json())
    .then(dados => {
        btn.innerText = txtOriginal;
        btn.disabled = false;

        if (dados.encontrado) {
            if (dados.requerCodigo) {
                // SUCESSO: Vai para tela de código
                document.getElementById('lbl_destino_codigo').innerText = dados.destino;
                
                // Animação de troca de tela
                $("#passo_cpf").fadeOut(200, function() {
                    $("#passo_codigo").fadeIn(200);
                    document.getElementById('input_codigo_otp').focus();
                });

            } else {
                // Legado: Cliente antigo sem email
                exibirDadosEncontrados(dados, cpf);
            }
        } else {
            // CPF não existe -> Checkout Manual
            if(confirm("CPF não encontrado. Deseja preencher o endereço manualmente?")) {
                irParaCheckoutManual(cpf);
            }
        }
    })
    .catch(e => {
        console.error(e);
        btn.innerText = txtOriginal;
        btn.disabled = false;
        alert("Erro de conexão. Tente novamente.");
    });
}

function validarIdentificacaoSegura() {
    var cpf = document.getElementById('cpf_identificacao').value.replace(/\D/g, '');
    var codigo = document.getElementById('input_codigo_otp').value.replace(/\D/g, '');
    
    if (codigo.length < 6) { alert("Digite o código de 6 números."); return; }

    var btn = document.querySelector('#passo_codigo .btn-success');
    var txtOriginal = btn.innerText;
    btn.innerText = "Validando...";
    btn.disabled = true;

    fetch(CONFIG.SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ op: "validar_codigo", cpf: cpf, codigo: codigo })
    })
    .then(r => r.json())
    .then(dados => {
        btn.innerText = txtOriginal;
        btn.disabled = false;

        if (dados.erro) {
            alert("Erro: " + dados.erro);
        } else if (dados.encontrado) {
            // SUCESSO TOTAL: Código aceito
            exibirDadosEncontrados(dados, cpf);
        }
    })
    .catch(e => {
        alert("Erro ao validar.");
        btn.disabled = false;
        btn.innerText = txtOriginal;
    });
}

function voltarParaCpf() {
    $("#passo_codigo").fadeOut(200, function() {
        $("#passo_cpf").fadeIn(200);
    });
}

function exibirDadosEncontrados(dados, cpf) {
    // 1. Preenche as variáveis globais que o checkout usa
    enderecoEntregaTemp = dados;
    enderecoEntregaTemp.referencia =
      String(dados.referencia || dados.Referencia || dados["Referência"] || "").trim();
    enderecoEntregaTemp.cpf = cpf;
    
    dadosClienteTemp.nome = String(dados.nome || "").trim();
    dadosClienteTemp.sobrenome = String(dados.sobrenome || "").trim();
    dadosClienteTemp.email = String(dados.email || "").trim();
    dadosClienteTemp.referencia = String(dados.referencia || "").trim();

    // 2. Esconde o formulário de código/cpf
    document.querySelector('#modalIdentificacao .modal-body').style.display = 'none';

    // 3. Monta o HTML de Sucesso
    var modalContent = document.querySelector('#modalIdentificacao .modal-content');
    
    // Remove anterior se houver
    var antigo = document.getElementById('container_sucesso_identificacao');
    if (antigo) antigo.remove();

    var divSucesso = document.createElement('div');
    divSucesso.id = 'container_sucesso_identificacao';
    divSucesso.className = 'p-4';
    divSucesso.innerHTML = `
        <div class="text-center mb-4">
            <i class="bi bi-shield-check text-success" style="font-size: 3rem;"></i>
            <h5 class="mt-2">Identidade Confirmada!</h5>
        </div>
        
        <div class="bg-light p-3 rounded border mb-3">
            <div class="fw-bold">${dadosClienteTemp.nome} ${dadosClienteTemp.sobrenome}</div>
            <div class="small text-muted">
                ${dados.rua}, ${dados.numero} ${dados.complemento ? '- ' + dados.complemento : ''}${(dados.referencia || dados.Referencia || dados["Referência"]) ? ' - Ref: ' + (dados.referencia || dados.Referencia || dados["Referência"]) : ''}<br>
                ${dados.bairro} - ${dados.cidade}/${dados.uf}<br>
                CEP: ${dados.cep}
            </div>
        </div>

        <div class="d-grid gap-2">
             <button class="btn btn-success btn-lg" onclick="confirmarDadosExistentes('usar')">
                <i class="bi bi-check-lg"></i> Usar este Endereço
             </button>
             <button class="btn btn-outline-warning" onclick="confirmarDadosExistentes('editar')">
                <i class="bi bi-pencil"></i> Editar Informações
             </button>
             <button class="btn btn-link text-muted btn-sm" onclick="irParaCheckoutManual('${cpf}')">
                Enviar para outro endereço
             </button>
        </div>
    `;

    modalContent.appendChild(divSucesso);
}

// Helper: Ir para checkout manual (limpa tudo)
function irParaCheckoutManual(cpfInformado) {
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalIdentificacao')).hide();
    document.getElementById('form-checkout').reset(); 
    dadosClienteTemp = {};
    
    // Preenche apenas o CPF
    document.getElementById('checkout_cpf').value = cpfInformado || document.getElementById('cpf_identificacao').value;
    
    new bootstrap.Modal(document.getElementById('modalCheckout')).show();
}

// Helper: Máscara CPF
function mascaraCpf(i){
   var v = i.value;
   if(isNaN(v[v.length-1])){ i.value = v.substring(0, v.length-1); return; }
   i.setAttribute("maxlength", "14");
   if (v.length == 3 || v.length == 7) i.value += ".";
   if (v.length == 11) i.value += "-";
}

// LGPD Checkbox Listener
$(document).on('change', '#check_lgpd', function () {
    const ok = this.checked;
    $('#btn_buscar_identidade').prop('disabled', !ok);
    $('#btn_buscar_identidade_div button').prop('disabled', !ok);
});



// 3. Função para buscar CEP dentro da tela de pagamento
function buscarCepNoCheckout() {
    var cep = document.getElementById('checkout_cep').value.replace(/\D/g, '');
    if (cep.length !== 8) { alert("CEP Inválido"); return; }

    fetch(`https://viacep.com.br/ws/${cep}/json/`)
        .then(r => r.json())
        .then(d => {
            if (!d.erro) {
                document.getElementById('checkout_rua').value = d.logradouro;
                document.getElementById('checkout_bairro').value = d.bairro;
                document.getElementById('checkout_cidade').value = d.localidade;
                document.getElementById('checkout_uf').value = d.uf || "";


                enderecoEntregaTemp.cep = cep; // Atualiza para validação de frete
                validarCepsIdenticos();
            } else {
                alert("CEP não encontrado.");
            }
        });
}

// 4. Ajuste na função de confirmar para preencher o novo campo de CEP
function confirmarDadosExistentes(acao) {
  // Fecha modal de identificação
  var mIdent = bootstrap.Modal.getInstance(document.getElementById('modalIdentificacao'));
  if (mIdent) mIdent.hide();

  // ✅ CPF
  const cpfDigitado = (document.getElementById('cpf_identificacao')?.value || "").replace(/\D/g, "");
  document.getElementById('checkout_cpf').value = enderecoEntregaTemp.cpf || cpfDigitado || "";

  // ✅ Dados Pessoais
  document.getElementById('checkout_nome').value      = S(enderecoEntregaTemp.nome);
  document.getElementById('checkout_sobrenome').value = S(enderecoEntregaTemp.sobrenome);
  document.getElementById('checkout_telefone').value  = S(enderecoEntregaTemp.telefone);
  
  var elEmail = document.getElementById('checkout_email');
  if (elEmail) elEmail.value = S(enderecoEntregaTemp.email);

  // ❌ REMOVIDO: Lógica de "pareceDeslocado". 
  // O Backend agora garante a integridade das colunas via headerMap_.
  
  // ✅ Endereço - Mapeamento Direto e Seguro
  document.getElementById('checkout_cep').value         = S(enderecoEntregaTemp.cep);
  document.getElementById('checkout_rua').value         = S(enderecoEntregaTemp.rua);
  document.getElementById('checkout_numero').value      = S(enderecoEntregaTemp.numero);
  document.getElementById('checkout_complemento').value = S(enderecoEntregaTemp.complemento);
  
  // ✅ CORREÇÃO: Mapeamento direto sem heurística
  document.getElementById('checkout_referencia').value =
  S(enderecoEntregaTemp.referencia || enderecoEntregaTemp.Referencia || enderecoEntregaTemp["Referência"]);
  document.getElementById('checkout_bairro').value      = S(enderecoEntregaTemp.bairro);
  document.getElementById('checkout_cidade').value      = S(enderecoEntregaTemp.cidade);
  
  // Prioriza UF, depois Estado, depois UF2 (alguns APIs retornam diferente)
  let ufFinal = S(enderecoEntregaTemp.uf) || S(enderecoEntregaTemp.estado) || S(enderecoEntregaTemp.uf2);
  document.getElementById('checkout_uf').value = ufFinal;

  // ✅ BLINDAGEM: Se o UF vier com nome completo (ex: "Minas Gerais") ou vazio,
  // tentamos corrigir via ViaCEP silenciosamente se tivermos o CEP.
  const cepLimpo = S(enderecoEntregaTemp.cep).replace(/\D/g, "");
  
  if (cepLimpo.length === 8 && ufFinal.length !== 2) {
      // Recupera UF correto do ViaCEP sem travar a tela
      fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
        .then(r => r.json())
        .then(d => {
            if (!d.erro) {
                document.getElementById('checkout_uf').value = d.uf;
                // Se cidade estiver vazia, preenche também
                if (!document.getElementById('checkout_cidade').value) {
                    document.getElementById('checkout_cidade').value = d.localidade;
                }
            }
        })
        .catch(() => {}); // Falha silenciosa
  }

  // Abre o modal
  new bootstrap.Modal(document.getElementById('modalCheckout')).show();

  setTimeout(() => {
    (document.getElementById('checkout_telefone') || document.getElementById('checkout_nome'))?.focus?.();
  }, 300);
}


// 5. Corrigir o problema do botão de carrinho sumindo
$(document).ready(function () {
    // Garante que o botão flutuante reapareça ao fechar qualquer modal se houver itens
    $('.modal').on('hidden.bs.modal', function () {
        var c = lsGetJSON('carrinho', []);
        if (c.length > 0) {
            $('#btn_carrinho_flutuante').fadeIn();
        }
    });
});



function validarCepCheckoutComFrete() {
    const cepCarrinho = document.getElementById("carrinho_cep")?.value?.replace(/\D/g, "");
    const cepCheckout = document.getElementById("checkout_cep")?.value?.replace(/\D/g, "");

    if (!cepCarrinho || !cepCheckout) return true;

    if (cepCarrinho !== cepCheckout) {
        document.getElementById("erro_cep_divergente").style.display = "block";
        return false;
    }

    document.getElementById("erro_cep_divergente").style.display = "none";
    return true;
}


function formatBRL(v) {
    const n = Number(v) || 0;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function abrirConfirmacaoPedido(cliente, items, logisticaInfo) {
    // Preenche o modal (você precisa ter os IDs do modalConfirmacaoPedido)
    const carrinho = lsGetJSON('carrinho', []);
    const subtotal = carrinho.reduce((acc, i) => acc + ((Number(i.preco) || 0) * (Number(i.quantidade) || 1)), 0);
    const frete = Number(freteCalculado) || 0;
    const total = subtotal + frete;

    const destEl = document.getElementById('conf_destinatario');
    const endEl = document.getElementById('conf_endereco');
    const itensEl = document.getElementById('conf_itens');
    const subEl = document.getElementById('conf_subtotal');
    const freEl = document.getElementById('conf_frete');
    const totEl = document.getElementById('conf_total');

    if (destEl) destEl.innerText = `${cliente.nome} ${cliente.sobrenome} • CPF: ${cliente.cpf}`;

const linha1 = `${cliente.rua}, ${cliente.numero}${cliente.complemento ? " - " + cliente.complemento : ""}`;
const linha2 = `${cliente.bairro} - ${cliente.cidade}/${cliente.uf} • CEP: ${cliente.cep}`;

// ✅ NOVO: Referência no resumo da entrega
const ref = String(cliente.referencia || "").trim();
const linha3 = ref ? `Referência: ${ref}` : "";

if (endEl) endEl.innerText = [linha1, linha2, linha3].filter(Boolean).join("\n");


    const itensSomenteProdutos = items.filter(it => !(String(it.title || "").toLowerCase().includes("frete")));
    const htmlItens = itensSomenteProdutos
        .map(it => `• ${it.title} — ${it.quantity}x ${formatBRL(it.unit_price)}`)
        .join("<br>");
    if (itensEl) itensEl.innerHTML = htmlItens || "<span class='text-muted'>Nenhum item</span>";

    if (subEl) subEl.innerText = formatBRL(subtotal);
    if (freEl) freEl.innerText = frete > 0 ? `${formatBRL(frete)} (${freteSelecionadoNome || "Frete"})` : formatBRL(0);
    if (totEl) totEl.innerText = formatBRL(total);

    // configura o botão "Confirmar e ir para pagamento"
    const btnConfirmar = document.getElementById('btn_confirmar_pagamento');
    if (btnConfirmar) {
        btnConfirmar.onclick = efetivarPagamentoFinal;
    }

    new bootstrap.Modal(document.getElementById('modalConfirmacaoPedido')).show();
}

async function efetivarPagamentoFinal() {
    const pend = window.__pedidoPendente;
    if (!pend) {
        alert("Pedido pendente não encontrado. Tente novamente.");
        return;
    }

    // fecha modal de confirmação
    const inst = bootstrap.Modal.getInstance(document.getElementById('modalConfirmacaoPedido'));
    if (inst) inst.hide();

    const { cliente, items, logisticaInfo, btn } = pend;
    if (btn) {
        btn.innerText = "Processando...";
        btn.disabled = true;
    }

    // ✅ CORREÇÃO PARA CHECKOUT WHATSAPP
        const tipo = String(CONFIG_LOJA.TipoCheckout || "").toLowerCase().trim();
        if (tipo === "whatsapp") {

        let texto = `*Novo Pedido - ${CONFIG_LOJA.NomeDoSite || "Loja"}*\n\n`;
        texto += `*Cliente:* ${cliente.nome} ${cliente.sobrenome}\n`;
        texto += `*Telefone:* ${cliente.telefone}\n`; // Corrigido de .whatsapp para .telefone
        texto += `*Endereço:* ${cliente.rua}, ${cliente.numero}\n`;
        texto += `*Bairro:* ${cliente.bairro} - ${cliente.cidade}/${cliente.uf}\n`;
        if(cliente.complemento) texto += `*Comp:* ${cliente.complemento}\n`;
        if (cliente.referencia && String(cliente.referencia).trim()) {
          texto += `*Referência:* ${String(cliente.referencia).trim()}\n`;
        }
        texto += `\n*--- Itens ---*\n`;
        
        let subtotalProdutos = 0;
        items.forEach(it => {
            // Ignora a linha de frete que o sistema injeta no array para o Mercado Pago
            if (!it.title.toLowerCase().includes("frete")) {
                texto += `✅ ${it.quantity}x ${it.title} (${formatBRL(it.unit_price)})\n`;
                subtotalProdutos += (it.unit_price * it.quantity);
            }
        });

        const valorDoFrete = Number(freteCalculado) || 0;
        const totalGeral = subtotalProdutos + valorDoFrete;

        texto += `\n*Subtotal:* ${formatBRL(subtotalProdutos)}`;
        texto += `\n*Frete (${freteSelecionadoNome}):* ${formatBRL(valorDoFrete)}`;
        texto += `\n*TOTAL FINAL: ${formatBRL(totalGeral)}*`;

        const numeroDestino = String(CONFIG_LOJA.NumeroWhatsapp || "").replace(/\D/g, '');
        const linkWa = `https://wa.me/${numeroDestino}?text=${encodeURIComponent(texto)}`;
        
        if (btn) {
            btn.innerText = "Pedido Enviado!";
        }

// ✅ 1) REGISTRAR NA PLANILHA (VENDAS) MESMO SENDO WHATSAPP
try {
  await fetch(CONFIG.SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify({
      op: "registrar_pedido_whatsapp",
      cliente,
      items,
      logistica: logisticaInfo,
      canal: "whatsapp",
      frete_nome: freteSelecionadoNome || "",
      frete_valor: Number(freteCalculado) || 0
    })
  }).then(r => r.json()).then(resp => {
    // opcional: guardar ID retornado pelo back
    if (resp && resp.idPedido) {
      console.log("Pedido WhatsApp registrado:", resp.idPedido);
    }
  });
} catch (e) {
  console.warn("Falha ao registrar pedido WhatsApp (seguindo mesmo assim):", e);
}

// ✅ 2) LIMPAR CARRINHO APÓS ENVIAR PRO WHATSAPP
lsRemove("carrinho");
atualizar_carrinho();

freteCalculado = 0;
freteSelecionadoNome = "";
limparFreteCache();
bloquearCheckout(true);

const divOp = document.getElementById("carrinho_opcoes_frete");
if (divOp) divOp.innerHTML = "";

// (opcional) fechar modal do carrinho/checkout se estiver aberto
try {
  bootstrap.Modal.getInstance(document.getElementById('modalCheckout'))?.hide();
} catch(e){}

        
        // Abre o WhatsApp
        window.open(linkWa, '_blank');
        
        // Opcional: Limpar carrinho após enviar para o WhatsApp
        // localStorage.removeItem('carrinho');
        // atualizar_carrinho();
        
        return; 
    }

    // --- Fluxo Original Mercado Pago (Mantido) ---
// --- Fluxo Original Mercado Pago (Mantido) ---
fetch(CONFIG.SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify({
        cliente,
        items,
        logistica: logisticaInfo,

        // ✅ NOVO: para o backend saber pra onde voltar
        return_to: window.location.href
    })
})
.then(r => r.text())
.then(link => { 
    if(link.includes("http")) {
        window.location.href = link; 
    } else {
        alert("Erro ao gerar link de pagamento: " + link);
        if(btn) { btn.innerText = "Tentar Novamente"; btn.disabled = false; }
    }
})
.catch(e => {
    alert("Erro ao processar.");
    if (btn) {
        btn.innerText = "Tentar Novamente";
        btn.disabled = false;
    }
});

}

// --- LÓGICA DE LOGIN E MEUS PEDIDOS ---

// ✅ Configuração da Sessão (10 minutos em milissegundos)
const TEMPO_SESSAO_MS = 10 * 60 * 1000; 

function salvarSessao(cpf) {
    const dados = { cpf: cpf, validade: Date.now() + TEMPO_SESSAO_MS };
    lsSetJSON("sessao_cliente", dados);
}

function verificarSessaoAtiva() {
    const sessao = lsGetJSON("sessao_cliente", null);
    if (sessao && sessao.cpf && Date.now() < sessao.validade) {
        // Renova a sessão por mais 10 min a cada acesso
        salvarSessao(sessao.cpf);
        return sessao.cpf;
    }
    return null;
}

function logoutSessao() {
    lsRemove("sessao_cliente");
    location.reload();
}

// Intercepta o clique no botão "Meus Pedidos" da Navbar
function cliqueMeusPedidos(e) {
    e.preventDefault(); 
    e.stopPropagation(); // Impede que o Bootstrap tente abrir algo automaticamente

    const cpfAtivo = verificarSessaoAtiva();
    
    if (cpfAtivo) {
        // CENÁRIO 1: Sessão válida -> Abre histórico direto
        
        // Garante que o modal de login esteja fechado
        const elLogin = document.getElementById('modalLogin');
        const modalLogin = bootstrap.Modal.getInstance(elLogin);
        if (modalLogin) modalLogin.hide();

        abrirModalMeusPedidos(cpfAtivo);
    } else {
        // CENÁRIO 2: Sessão expirada ou inexistente -> Abre Login
        new bootstrap.Modal(document.getElementById('modalLogin')).show();
    }
}


function iniciarLoginMeusPedidos() {
    var cpf = document.getElementById('login_cpf_acesso').value.replace(/\D/g, '');
    if (cpf.length !== 11) { 
        document.getElementById('login_cpf_acesso').classList.add('is-invalid');
        return; 
    }
    document.getElementById('login_cpf_acesso').classList.remove('is-invalid');

    var btn = document.getElementById('btn_login_otp');
    var original = btn.innerText;
    btn.innerText = "Enviando...";
    btn.disabled = true;

    fetch(CONFIG.SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ op: "solicitar_codigo", cpf: cpf })
    })
    .then(r => r.json())
    .then(dados => {
        btn.innerText = "Código Enviado!";
        setTimeout(() => { btn.innerText = original; btn.disabled = false; }, 2000);

        if (dados.encontrado) {
            document.getElementById('form-login-otp').style.opacity = '0.5';
            $("#area_codigo_login").slideDown();
            document.getElementById('login_otp_input').focus();
        } else {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-danger');
            btn.innerText = "CPF não encontrado";
            setTimeout(() => { 
                btn.classList.remove('btn-danger'); 
                btn.classList.add('btn-primary'); 
                btn.innerText = original; 
            }, 3000);
        }
    })
    .catch(e => {
        btn.disabled = false;
        btn.innerText = "Erro ao enviar";
    });
}

function validarLoginMeusPedidos() {
    var cpf = document.getElementById('login_cpf_acesso').value.replace(/\D/g, '');
    var codigo = document.getElementById('login_otp_input').value;
    var btn = document.querySelector('#area_codigo_login button');
    
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Verificando...';
    btn.disabled = true;

    fetch(CONFIG.SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ op: "validar_codigo", cpf: cpf, codigo: codigo })
    })
    .then(r => r.json())
    .then(dados => {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-unlock-fill me-2"></i> Acessar Painel';

        if (dados.encontrado) {
            // ✅ SUCESSO: Salva a sessão e abre a lista
            salvarSessao(cpf);

            bootstrap.Modal.getInstance(document.getElementById('modalLogin')).hide();
            
            // Limpa campos para próxima vez
            document.getElementById('login_otp_input').value = "";
            document.getElementById('area_codigo_login').style.display = "none";
            document.getElementById('form-login-otp').style.opacity = "1";

            abrirModalMeusPedidos(cpf); 
        } else {
            var inputCod = document.getElementById('login_otp_input');
            inputCod.classList.add('is-invalid');
            inputCod.value = "";
            inputCod.placeholder = "Inválido";
        }
    })
    .catch(() => {
        btn.disabled = false;
        btn.innerText = "Erro de conexão";
    });
}

// --- Renderizar Lista de Pedidos ---
function abrirModalMeusPedidos(cpf) {
    new bootstrap.Modal(document.getElementById('modalListaPedidos')).show();
    
    const divLista = document.getElementById('container_pedidos_lista');
    const divLoading = document.getElementById('loading_pedidos');
    
    divLista.innerHTML = '';
    divLoading.style.display = 'block';

    // Botão de Logout no modal (Opcional, mas útil)
    const headerModal = document.querySelector('#modalListaPedidos .modal-header');
    if (!document.getElementById('btn_logout_sessao')) {
        const btnLogout = document.createElement('button');
        btnLogout.id = 'btn_logout_sessao';
        btnLogout.className = 'btn btn-sm btn-outline-light ms-auto me-2';
        btnLogout.innerText = 'Sair';
        btnLogout.onclick = function() {
            logoutSessao();
        };
        // Insere antes do botão de fechar (X)
        headerModal.insertBefore(btnLogout, headerModal.lastElementChild);
    }

    fetch(CONFIG.SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ op: "listar_pedidos", cpf: cpf })
    })
    .then(r => r.json())
    .then(lista => {
        divLoading.style.display = 'none';
        
        if (!lista || lista.length === 0 || lista.erro) {
            divLista.innerHTML = `
                <div class="text-center py-4">
                    <i class="bi bi-basket text-muted" style="font-size: 3rem;"></i>
                    <p class="mt-3 text-muted">Nenhum pedido encontrado para este CPF.</p>
                </div>`;
            return;
        }

        lista.forEach(p => {
            // Status Badges
            let statusBadge = 'bg-secondary';
            let st = String(p.status).toLowerCase();
            if (st.includes('aprovado') || st.includes('pago')) statusBadge = 'bg-success';
            else if (st.includes('pendente') || st.includes('aguardando')) statusBadge = 'bg-warning text-dark';
            else if (st.includes('cancelado')) statusBadge = 'bg-danger';
            else if (st.includes('enviado')) statusBadge = 'bg-primary'; // Azul para enviado

            // Formata Data
            let dataFormatada = p.data;
            try {
               let d = new Date(p.data);
               if(!isNaN(d)) dataFormatada = d.toLocaleDateString('pt-BR');
            } catch(e){}

            // Botão Pagar
            let botoesAcao = '';
            
            if ((st.includes('pendente') || st.includes('aguardando')) && p.link && p.link.startsWith('http')) {
                botoesAcao += `<a href="${p.link}" target="_blank" class="btn btn-sm btn-success me-2 mb-2">
                                  <i class="bi bi-credit-card"></i> Pagar Agora
                               </a>`;
            }

            // ✅ NOVO: Botão Rastrear (Linkado com rastreio.html)
            if (p.rastreio && p.rastreio.length > 5) {
                botoesAcao += `<a href="rastreio.html?code=${p.rastreio}" target="_blank" class="btn btn-sm btn-primary mb-2">
                                  <i class="bi bi-truck"></i> Rastrear Entrega
                               </a>`;
            } else if (st.includes('enviado')) {
                 botoesAcao += `<span class="badge bg-light text-dark border mb-2">Rastreio em breve</span>`;
            }

            const card = document.createElement('div');
            card.className = 'card mb-3 shadow-sm border-0';
            card.innerHTML = `
                <div class="card-header bg-white d-flex justify-content-between align-items-center">
                    <span class="fw-bold">#${p.id}</span>
                    <span class="badge ${statusBadge}">${p.status || 'Desconhecido'}</span>
                </div>
                <div class="card-body">
                    <div class="small text-muted mb-2"><i class="bi bi-calendar"></i> ${dataFormatada}</div>
                    <p class="mb-2" style="white-space: pre-wrap;">${p.itens}</p>
                    
                    <div class="d-flex flex-wrap justify-content-between align-items-end border-top pt-3 mt-2">
                        <div class="mb-2">
                             <span class="small text-muted">Total:</span>
                             <div class="fw-bold text-success fs-5">R$ ${parseFloat(p.total).toFixed(2)}</div>
                        </div>
                        <div class="text-end">
                            ${botoesAcao}
                        </div>
                    </div>
                </div>
            `;
            divLista.appendChild(card);
        });
    })
    .catch(e => {
        divLoading.style.display = 'none';
        divLista.innerHTML = '<div class="alert alert-danger">Erro ao carregar pedidos.</div>';
    });
}


// --- 8. INICIALIZAÇÃO ---
document.addEventListener("DOMContentLoaded", function () {
    carregar_config();
    atualizar_carrinho();

    // ✅ SESSÃO: Configura o botão "Meus Pedidos" para controle total via JS
    const btnMeusPedidos = document.getElementById('btn_login');
    if (btnMeusPedidos) {
        // REMOVE ATRIBUTOS AUTOMÁTICOS DO HTML PARA EVITAR ABRIR DUAS JANELAS
        btnMeusPedidos.removeAttribute('data-bs-toggle');
        btnMeusPedidos.removeAttribute('data-bs-target');
        
        // Adiciona nosso gerenciador inteligente
        btnMeusPedidos.addEventListener('click', cliqueMeusPedidos);
    }

    // ✅ BUSCA: filtra enquanto digita + Enter
    const busca = document.getElementById('txt_search');
    if (busca) {
        busca.addEventListener('input', filtrarProdutos);
        busca.addEventListener('search', () => filtrarProdutos()); 

busca.addEventListener('keydown', (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        filtrarProdutos();
    }
});

    }

    // ✅ BUSCA MOBILE
    const buscaMob = document.getElementById('txt_search_mobile');
    if (buscaMob) {
        buscaMob.addEventListener('input', filtrarProdutos);
        buscaMob.addEventListener('search', () => filtrarProdutos());

        buscaMob.addEventListener('keydown', (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                filtrarProdutos();
            }
        });
    }

    // ✅ BUSCA: Form submit
    const formBusca = document.getElementById('form_busca');
    if (formBusca) {
        formBusca.addEventListener('submit', (e) => {
            e.preventDefault();
            filtrarProdutos();
            fechar_menu_mobile();
        });
    }

    sincronizarBuscaEntreCampos();

    // ✅ Offcanvas de filtros: registra UMA vez (evita duplicar a cada tecla)
const offEl = document.getElementById('offcanvasFiltros');
if (offEl) {
    offEl.addEventListener('show.bs.offcanvas', () => {
        document.body.classList.add('filtros-abertos');
    });

    offEl.addEventListener('hidden.bs.offcanvas', () => {
        document.body.classList.remove('filtros-abertos');
    });
}


    // submit do form mobile
    const formBuscaMob = document.getElementById('form_busca_mobile');
    if (formBuscaMob) {
        formBuscaMob.addEventListener('submit', (e) => {
            e.preventDefault();
            filtrarProdutos();
        });
    }

    const modais = [
        'modalProduto',
        'modalCarrito',
        'modalCheckout',
        'modalLogin',
        'modalUsuario',
        'modalIdentificacao',
        'modalConfirmacaoPedido'
    ];

    const btnFloat = document.getElementById('btn_carrinho_flutuante');

    modais.forEach(id => {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('show.bs.modal', () => { if (btnFloat) btnFloat.style.display = 'none'; });
            el.addEventListener('hidden.bs.modal', () => {
                if (!document.querySelector('.modal.show') && btnFloat) btnFloat.style.display = 'block';
            });
        }
    });
});
