import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import ArticlesListPage from './InsightsArticles';

const InsightsNews = () => {
  const { t } = useLanguage();
  return (
    <ArticlesListPage
      fixedType="news"
      pageTitle={t('insights_news')}
      pageDescription={t('brand_desc')}
      seoTitle={`${t('insights_news')} — ${t('brand')} Insights`}
    />
  );
};

export default InsightsNews;
