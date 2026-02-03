// js/config.js
// Configuração global blindada contra múltiplos loads

window.CONFIG = window.CONFIG || {
  // URL do Google Apps Script
  SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwePrOqUhcq6m4GPlrBi5MQdYwcZt6NLD0dyL_Yd6bofbdRaXHdMtsvIZVxXkLIYbnnMA/exec",

  // Outras configs globais podem vir aqui no futuro
  MOEDA: "BRL"
};

// versão do front (use a mesma string que você gosta)
window.APP_VERSION = window.APP_VERSION || "2026-01-20_v6";
