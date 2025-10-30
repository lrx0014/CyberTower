interface JournalUIElements {
  openButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  modal: HTMLElement;
  list: HTMLElement;
  content: HTMLElement;
}

interface ArticleEntry {
  id: string;
  title: string;
  markdown?: string;
  html?: string;
  loaded: boolean;
  loading: boolean;
  error?: string;
}

const unlockedOrder: string[] = [];
const articles = new Map<string, ArticleEntry>();

let activeArticleId: string | null = null;
let ui: JournalUIElements | null = null;
let initialised = false;

const ARTICLE_BASE_PATH = '/articles';

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

const escapeHtml = (input: string): string => {
  return input.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] ?? ch);
};

const sanitizeUrl = (url: string): string | null => {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^(https?:)?\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;
  return null;
};

const renderInlineMarkdown = (text: string): string => {
  const escaped = escapeHtml(text);
  const withCode = escaped.replace(/`([^`]+)`/g, (_, code: string) => `<code>${code}</code>`);
  const withLinks = withCode.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, url: string) => {
    const safeUrl = sanitizeUrl(url);
    const safeLabel = escapeHtml(label);
    if (!safeUrl) return safeLabel;
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`;
  });
  const withStrong = withLinks.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const withEmphasis = withStrong.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return withEmphasis;
};

const markdownToHtml = (markdown: string): string => {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      output.push('</ul>');
      inList = false;
    }
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      closeList();
      output.push('<p class="journal-break"></p>');
      return;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      const content = renderInlineMarkdown(headingMatch[2].trim());
      output.push(`<h${level}>${content}</h${level}>`);
      return;
    }

    const listMatch = line.match(/^[-*+]\s+(.+)$/);
    if (listMatch) {
      if (!inList) {
        output.push('<ul>');
        inList = true;
      }
      output.push(`<li>${renderInlineMarkdown(listMatch[1].trim())}</li>`);
      return;
    }

    closeList();
    output.push(`<p>${renderInlineMarkdown(line.trim())}</p>`);
  });

  closeList();
  return output.join('');
};

const extractTitleFromMarkdown = (markdown: string, fallback: string): string => {
  const headingMatch = markdown.match(/^#\s+(.+)$/m);
  if (headingMatch && headingMatch[1]) {
    return headingMatch[1].trim();
  }
  return formatTitleFromId(fallback);
};

const formatTitleFromId = (id: string): string => {
  const spaced = id.replace(/[_-]+/g, ' ').trim();
  if (!spaced) return id;
  return spaced
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const ensureArticleEntry = (articleId: string): ArticleEntry => {
  const existing = articles.get(articleId);
  if (existing) return existing;
  const entry: ArticleEntry = {
    id: articleId,
    title: formatTitleFromId(articleId),
    loaded: false,
    loading: false
  };
  articles.set(articleId, entry);
  return entry;
};

const updateNav = () => {
  if (!ui) return;
  const { list } = ui;
  list.innerHTML = '';
  if (unlockedOrder.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'journal-empty';
    empty.textContent = 'No articles unlocked yet.';
    list.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  unlockedOrder.forEach((articleId) => {
    const entry = articles.get(articleId);
    if (!entry) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'journal-nav-item';
    button.dataset.articleId = articleId;
    button.textContent = entry.title;
    if (articleId === activeArticleId) {
      button.classList.add('active');
    }
    fragment.appendChild(button);
  });
  list.appendChild(fragment);
};

const showModal = () => {
  if (!ui) return;
  ui.modal.classList.remove('hidden');
  activeArticleId ?? selectFirstArticle();
};

const hideModal = () => {
  ui?.modal.classList.add('hidden');
};

const renderContentState = (html: string) => {
  if (!ui) return;
  ui.content.innerHTML = html;
};

const renderArticleContent = (entry: ArticleEntry) => {
  if (!ui) return;
  if (entry.loading) {
    renderContentState('<div class="journal-status">Loading article...</div>');
    return;
  }
  if (entry.error) {
    renderContentState(`<div class="journal-status error">${escapeHtml(entry.error)}</div>`);
    return;
  }
  if (entry.html) {
    renderContentState(entry.html);
    return;
  }
  renderContentState('<div class="journal-status">Content unavailable.</div>');
};

const selectFirstArticle = () => {
  if (unlockedOrder.length === 0) {
    renderContentState('<div class="journal-status">Unlock articles to view their contents.</div>');
    return;
  }
  selectArticle(unlockedOrder[0]);
};

const selectArticle = (articleId: string) => {
  const trimmed = articleId.trim();
  if (!trimmed) return;
  const entry = articles.get(trimmed);
  if (!entry) return;
  activeArticleId = trimmed;
  updateNav();
  if (!entry.loaded && !entry.loading) {
    loadArticle(entry);
  }
  renderArticleContent(entry);
};

const loadArticle = async (entry: ArticleEntry) => {
  entry.loading = true;
  entry.error = undefined;
  renderArticleContent(entry);
  try {
    const response = await fetch(`${ARTICLE_BASE_PATH}/${entry.id}.md?cb=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`Failed to load article (status ${response.status}).`);
    }
    const markdown = await response.text();
    entry.markdown = markdown;
    entry.title = extractTitleFromMarkdown(markdown, entry.id);
    entry.html = markdownToHtml(markdown);
    entry.loaded = true;
    entry.loading = false;
    if (entry.id === activeArticleId) {
      renderArticleContent(entry);
      updateNav();
    }
  } catch (err) {
    entry.loading = false;
    entry.error = err instanceof Error ? err.message : 'Unknown error loading article.';
    if (entry.id === activeArticleId) {
      renderArticleContent(entry);
    }
  }
};

const handleNavClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  const button = target.closest<HTMLButtonElement>('.journal-nav-item');
  if (!button || !button.dataset.articleId) return;
  selectArticle(button.dataset.articleId);
};

export function initialiseJournalUI(elements: JournalUIElements) {
  ui = elements;
  initialised = true;

  ui.openButton.addEventListener('click', () => {
    if (unlockedOrder.length === 0) {
      renderContentState('<div class="journal-status">No articles unlocked yet.</div>');
    }
    showModal();
  });

  ui.closeButton.addEventListener('click', () => {
    hideModal();
  });

  ui.modal.addEventListener('click', (event) => {
    if (event.target === ui?.modal) {
      hideModal();
    }
  });

  ui.list.addEventListener('click', handleNavClick);

  if (unlockedOrder.length > 0) {
    updateNav();
    selectArticle(unlockedOrder[0]);
  } else {
    updateNav();
    renderContentState('<div class="journal-status">Unlock articles to view their contents.</div>');
  }
}

export function unlockArticle(articleId: string) {
  const trimmed = articleId.trim();
  if (!trimmed) return;
  if (articles.has(trimmed)) return;
  unlockedOrder.push(trimmed);
  const entry = ensureArticleEntry(trimmed);
  entry.title = formatTitleFromId(entry.id);
  if (initialised) {
    updateNav();
    if (!activeArticleId) {
      selectArticle(trimmed);
    }
  }
}
