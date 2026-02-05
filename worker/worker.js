export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const productId = url.searchParams.get("produto");

    // --- DEV / BYPASS ---
    const devBypass =
      url.searchParams.has("dev") ||
      url.searchParams.has("nocache") ||
      (request.headers.get("cache-control") || "").includes("no-cache");


    const BUILD = (env && env.WORKER_BUILD) ? String(env.WORKER_BUILD) : "v9";

    const BASE_SCRIPT_URL =
      "https://script.google.com/macros/s/AKfycbwePrOqUhcq6m4GPlrBi5MQdYwcZt6NLD0dyL_Yd6bofbdRaXHdMtsvIZVxXkLIYbnnMA/exec";

    const ORIGIN_HTML_BASE = "https://raw.githubusercontent.com/DBertolani/social-deab/main/";
    const ASSET_REF = (env && env.ASSET_REF) ? String(env.ASSET_REF) : "43914a1";
    const ORIGIN_ASSET_BASE = `https://cdn.jsdelivr.net/gh/DBertolani/social-deab@${ASSET_REF}/`;

    // --- Detecta bots/crawlers ---
    const ua = request.headers.get("user-agent") || "";
    const isBot =
      /facebookexternalhit|Facebot|WhatsApp|Twitterbot|Slackbot|Discordbot|TelegramBot|LinkedInBot/i.test(ua);

    // ✅ Forçar modo bot para testar no navegador: ?bot=1
    const isBotFinal = isBot || url.searchParams.has("bot");

    // ------------------ HELPERS: ORIGIN/ASSETS ------------------
    function originHtmlUrlFromPath(pathname) {
      let path = pathname || "/";
      if (path === "/" || path === "") path = "/index.html";
      const filePath = path.replace(/^\/+/, "");
      const cacheBuster = Date.now();
      return new URL(filePath, ORIGIN_HTML_BASE).toString() + `?v=${cacheBuster}`;
    }

    function originAssetUrlFromPath(pathname) {
      let path = pathname || "/";
      if (path === "/" || path === "") path = "/index.html";
      const filePath = path.replace(/^\/+/, "");
      return new URL(filePath, ORIGIN_ASSET_BASE).toString();
    }

    function isAssetRequest(pathname) {
      return (
        pathname.startsWith("/css/") ||
        pathname.startsWith("/js/") ||
        pathname.startsWith("/p/") ||
        pathname.endsWith(".css") ||
        pathname.endsWith(".js") ||
        pathname.endsWith(".json") ||
        pathname.endsWith(".png") ||
        pathname.endsWith(".jpg") ||
        pathname.endsWith(".jpeg") ||
        pathname.endsWith(".webp") ||
        pathname.endsWith(".svg") ||
        pathname.endsWith(".ico") ||
        pathname.endsWith(".woff") ||
        pathname.endsWith(".woff2") ||
        pathname.endsWith(".ttf") ||
        pathname.endsWith(".map")
      );
    }

    function rewriteAssetsToOrigin(html) {
      html = html.replace(/href=(["'])css\//gi, `href=$1${ORIGIN_ASSET_BASE}css/`);
      html = html.replace(/src=(["'])js\//gi, `src=$1${ORIGIN_ASSET_BASE}js/`);
      html = html.replace(/src=(["'])p\//gi, `src=$1${ORIGIN_ASSET_BASE}p/`);
      html = html.replace(/href=(["'])p\//gi, `href=$1${ORIGIN_ASSET_BASE}p/`);
      html = html.replace(/(href|src)=(["'])config\.json/gi, `$1=$2${ORIGIN_ASSET_BASE}config.json`);
      return html;
    }

    // ✅ remove OG fixo do index.html (senão WhatsApp pode pegar o “primeiro”)
    function stripSeoMeta(html) {
      // remove qualquer <title>...</title>
      html = html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "");

      // remove <meta name="description" ...>
      html = html.replace(/<meta\b[^>]*\bname=(["'])description\1[^>]*>/gi, "");

      // remove qualquer meta OG existente (og:*)
      html = html.replace(/<meta\b[^>]*\bproperty=(["'])og:[^"']+\1[^>]*>/gi, "");

      return html;
    }

    // ------------------ HELPERS: CONFIG ------------------
    function normalizeKey(k) {
      return String(k || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "");
    }

    function buildConfig(dados) {
      const out = {};
      if (Array.isArray(dados)) {
        for (const item of dados) {
          const k = item?.Chave ?? item?.chave ?? item?.key ?? item?.Key;
          const v = item?.Valor ?? item?.valor ?? item?.value ?? item?.Value;
          const nk = normalizeKey(k);
          if (nk) out[nk] = String(v ?? "").trim();
        }
      } else if (dados && typeof dados === "object") {
        for (const [k, v] of Object.entries(dados)) {
          const nk = normalizeKey(k);
          if (nk) out[nk] = String(v ?? "").trim();
        }
      }
      return out;
    }

    function cfgGet(cfg, keys, fallback = "") {
      for (const k of keys) {
        const v = cfg[normalizeKey(k)];
        if (v != null && String(v).trim() !== "") return String(v).trim();
      }
      return fallback;
    }

    // ------------------ HELPERS: DRIVE IMAGE UNIVERSAL ------------------
    function extrairDriveId(link) {
      const s = String(link || "");
      const m = s.match(/\/file\/d\/([^\/]+)|\/d\/([^\/]+)|[?&]id=([^&]+)/i);
      return m ? (m[1] || m[2] || m[3]) : null;
    }

    function driveParaOg(link) {
      const s = String(link || "").trim();
      if (!s) return "";
      if (s.includes("drive.google.com")) {
        const id = extrairDriveId(s);
        if (id) return `https://lh3.googleusercontent.com/d/${id}=w1200`;
      }
      return s;
    }

    function escapeHtmlAttr(s) {
      return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }


    function formatarPrecoBR(v) {
  if (v == null) return "";
  let s = String(v).trim();

  // remove "R$" caso exista
  s = s.replace(/[Rr]\$\s*/g, "").trim();

  // normaliza separadores: aceita 129.9, 129,9, 1.299,90 etc
  if (s.includes(",") && s.includes(".")) {
    // assume "." milhar e "," decimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return String(v);

  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}


    // ------------------ FLUXO PRINCIPAL ------------------
    try {
      // 1) Assets: proxy do jsDelivr
      if (isAssetRequest(url.pathname)) {
        const assetUrl = originAssetUrlFromPath(url.pathname);

        const isCritical =
          url.pathname === "/js/app.js" ||
          url.pathname === "/js/config.js";

        const resp = await fetch(assetUrl, {
          redirect: "follow",
          cf: devBypass
            ? { cacheTtl: 0, cacheEverything: false }
            : (isCritical
                ? { cacheTtl: 0, cacheEverything: false, cacheKey: `${url.origin}${url.pathname}::${BUILD}` }
                : { cacheTtl: 86400, cacheEverything: true, cacheKey: `${url.origin}${url.pathname}::${BUILD}` }),
        });

        const headers = new Headers(resp.headers);
        headers.set("x-worker-build", BUILD);
        headers.set("x-dev-bypass", devBypass ? "1" : "0");
        headers.set("x-upstream", "jsdelivr");

        if (isCritical || devBypass) {
          headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
          headers.set("pragma", "no-cache");
          headers.set("expires", "0");
        } else {
          headers.set("cache-control", "public, max-age=86400");
        }

        return new Response(resp.body, { status: resp.status, headers });
      }

      // 2) HTML: GitHub RAW (sem cache no Cloudflare)
      const htmlUrl = originHtmlUrlFromPath(url.pathname);

      const originalResponse = await fetch(htmlUrl, {
        redirect: "follow",
        headers: {
          "cache-control": "no-cache",
          "pragma": "no-cache"
        },
        cf: { cacheTtl: 0, cacheEverything: false }
      });

      let html = originalResponse.ok
        ? await originalResponse.text()
        : `<html><head></head><body>Erro ao carregar HTML.</body></html>`;

      html = rewriteAssetsToOrigin(html);

      // 3) Humanos: entrega HTML normal
      if (!isBotFinal) {
        return new Response(html, {
          headers: {
            "content-type": "text/html;charset=UTF-8",
            "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
            "x-worker-build": BUILD,
            "x-dev-bypass": devBypass ? "1" : "0",
          },
        });
      }

      // 4) Bots: OG dinâmico (busca config + produto se necessário)
      let dadosProd = {};
      let dadosCfg = {};

      try {
        if (productId) {
          const [rProd, rCfg] = await Promise.all([
            fetch(`${BASE_SCRIPT_URL}?rota=produtos`, { redirect: "follow" }),
            fetch(`${BASE_SCRIPT_URL}?rota=config`, { redirect: "follow" }),
          ]);
          try { dadosProd = await rProd.json(); } catch (e) { dadosProd = {}; }
          try { dadosCfg = await rCfg.json(); } catch (e) { dadosCfg = {}; }
        } else {
          const rCfg = await fetch(`${BASE_SCRIPT_URL}?rota=config`, { redirect: "follow" });
          try { dadosCfg = await rCfg.json(); } catch (e) { dadosCfg = {}; }
        }
      } catch (e) {
        dadosProd = {};
        dadosCfg = {};
      }

      const cfg = buildConfig(dadosCfg);

      // ✅ antes de injetar, remove OG/title/description do index.html
      html = stripSeoMeta(html);

      let metaTags = "";

      if (productId) {
        const produto = Array.isArray(dadosProd)
          ? dadosProd.find((p) => String(p.ID || p.id).trim() === String(productId).trim())
          : null;

        if (produto) {
          const nomeLoja = cfgGet(cfg, ["NomeDoSite", "NomeDaLoja", "TituloAba", "Titulo"], "Loja Online");
          const titulo = `${produto.Produto} - ${nomeLoja}`;
          
          const precoRaw = produto.Preço || produto.preco || produto.Preco || "";
          const precoBR = formatarPrecoBR(precoRaw);

          let imagem = produto.ImagemPrincipal || "";

          imagem = driveParaOg(imagem);

          // fallback se imagem vier vazia
          if (!imagem) {
            imagem = driveParaOg(cfgGet(cfg, ["LogoDoSite", "Logo", "OgImage", "ImagemOG", "LogoUrl"], ""));
          }

          const descRaw =
            produto.Descricao ||
            produto.Descrição ||
            produto.descricao ||
            produto.descricao_curta ||
            produto.DescricaoCurta ||
            produto.Detalhes ||
            "";
          
          const desc = String(descRaw).trim();
          const descLimitada = desc.length > 200 ? (desc.slice(0, 197) + "...") : desc;
          
          metaTags = `
            <title>${escapeHtmlAttr(titulo)}</title>
          
            <meta name="description" content="${escapeHtmlAttr(descLimitada || (precoBR ? `Preço: ${precoBR}` : "Confira detalhes e garanta o seu."))}">
            <meta property="og:title" content="${escapeHtmlAttr(`${titulo}${precoBR ? " | " + precoBR : ""}`)}">
            <meta property="og:description" content="${escapeHtmlAttr(descLimitada || "Confira detalhes e garanta o seu.")}">
            ${imagem ? `<meta property="og:image" content="${escapeHtmlAttr(imagem)}">` : ""}
            <meta property="og:type" content="product">
            <meta property="og:url" content="${escapeHtmlAttr(url.href)}">
          `;
        } else {
          // ✅ AQUI: else do if (produto) -> fallback quando ?produto=... NÃO achou produto
          const tituloHome = cfgGet(cfg, ["TituloAba", "Titulo", "NomeDoSite", "NomeDaLoja"], "Loja Online");
          const descHome = cfgGet(cfg, ["DescricaoSEO", "Descricao", "DescricaoAba"], "Confira nosso catálogo.");
          let logoHome = driveParaOg(cfgGet(cfg, ["LogoDoSite", "Logo", "OgImage", "ImagemOG", "Imagem", "LogoUrl"], ""));

          metaTags = `
            <title>${escapeHtmlAttr(tituloHome)}</title>
            <meta name="description" content="${escapeHtmlAttr(descHome)}">
            <meta property="og:title" content="${escapeHtmlAttr(tituloHome)}">
            <meta property="og:description" content="${escapeHtmlAttr(descHome)}">
            ${logoHome ? `<meta property="og:image" content="${escapeHtmlAttr(logoHome)}">` : ""}
            <meta property="og:type" content="website">
            <meta property="og:url" content="${escapeHtmlAttr(url.href)}">
          `;
        }

      } else {
        // ✅ este else aqui continua sendo o HOME normal (quando NÃO existe ?produto=)
        const tituloHome = cfgGet(cfg, ["TituloAba", "Titulo", "NomeDoSite", "NomeDaLoja"], "Loja Online");
        const descHome = cfgGet(cfg, ["DescricaoSEO", "Descricao", "DescricaoAba"], "Confira nosso catálogo.");
        let logoHome = driveParaOg(cfgGet(cfg, ["LogoDoSite", "Logo", "OgImage", "ImagemOG", "Imagem", "LogoUrl"], ""));

        metaTags = `
          <title>${escapeHtmlAttr(tituloHome)}</title>
          <meta name="description" content="${escapeHtmlAttr(descHome)}">
          <meta property="og:title" content="${escapeHtmlAttr(tituloHome)}">
          <meta property="og:description" content="${escapeHtmlAttr(descHome)}">
          ${logoHome ? `<meta property="og:image" content="${escapeHtmlAttr(logoHome)}">` : ""}
          <meta property="og:type" content="website">
          <meta property="og:url" content="${escapeHtmlAttr(url.href)}">
        `;
      }


      if (html.includes("<head>")) {
        html = html.replace("<head>", "<head>" + metaTags);
      } else {
        html = metaTags + html;
      }

      return new Response(html, {
        headers: {
          "content-type": "text/html;charset=UTF-8",
          "cache-control": "public, max-age=300",
          "x-worker-build": BUILD,
          "x-dev-bypass": devBypass ? "1" : "0",
        },
      });

    } catch (e) {
      return new Response(
        "<html><head><title>Erro</title></head><body>Erro ao processar.</body></html>",
        { headers: { "content-type": "text/html;charset=UTF-8" }, status: 200 }
      );
    }
  },
};
