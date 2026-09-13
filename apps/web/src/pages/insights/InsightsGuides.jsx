import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import ArticlesListPage from './InsightsArticles';

const InsightsGuides = () => {
  const { t } = useLanguage();
  return (
    <ArticlesListPage
      fixedType="guide"
      pageTitle={t('insights_guides')}
      pageDescription={t('brand_desc')}
      seoTitle={`${t('insights_guides')} — ${t('brand')} Insights`}
    />
  );
};

export default InsightsGuides;
