/**
 * Mercado Jesi — comportamento global de labels e tooltips nativos.
 * Labels são apenas textos informativos: clicar nelas não ativa campos.
 * Atributos title são removidos para evitar tooltips nativos do navegador,
 * inclusive em componentes e modais renderizados dinamicamente.
 */
(() => {
  const removeNativeTitles = (root) => {
    if (!(root instanceof Element || root instanceof Document)) return;

    if (root instanceof Element && root.hasAttribute('title')) {
      root.removeAttribute('title');
    }

    root.querySelectorAll?.('[title]').forEach((element) => {
      element.removeAttribute('title');
    });
  };

  // Impede a ativação automática do input associado ao clicar no label.
  document.addEventListener('click', (event) => {
    const label = event.target instanceof Element
      ? event.target.closest('label')
      : null;

    if (!label) return;

    // Cliques nos próprios controles devem continuar funcionando, inclusive
    // no botão que substitui visualmente os selects administrativos.
    const interactive = event.target.closest(
      'input, select, textarea, button, a, [role="button"], [role="option"], .admin-select, .admin-select-menu'
    );
    if (interactive) return;

    // Impede somente o clique no texto do label de ativar o campo associado.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);

  // Remove tooltips nativos existentes e os adicionados posteriormente.
  removeNativeTitles(document);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'title') {
        mutation.target.removeAttribute('title');
        return;
      }

      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) removeNativeTitles(node);
      });
    });
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['title'],
    childList: true,
    subtree: true
  });
})();
