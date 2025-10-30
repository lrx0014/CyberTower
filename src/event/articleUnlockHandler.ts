import { GameEventHandler } from './bus/eventBus';
import { unlockArticle } from '../journal/travelerJournal';

export const createArticleUnlockHandler = (): GameEventHandler<'article.unlock'> => {
  return (event) => {
    const payload = event.payload ?? {};
    const rawId = (payload.articleId ?? payload.article_id ?? payload.id) as unknown;
    if (rawId === undefined || rawId === null) return;
    const articleId = String(rawId).trim();
    if (!articleId) return;
    unlockArticle(articleId);
  };
};
